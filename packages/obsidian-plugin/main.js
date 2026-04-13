const { Plugin, PluginSettingTab, Setting, Notice, FuzzySuggestModal, TFile, setIcon } = require('obsidian');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const DEFAULT_SETTINGS = {
  serverUrl: 'http://127.0.0.1:8765',
  language: 'ko',
  model: 'medium',
  prompt: '',
  requestTimeoutMs: 120000,
  outputFolder: 'Generated Notes',
  recordingNoteOutputFolder: 'Generated Notes/Recorded Sessions',
  templateMode: 'meeting',
  customTemplateFilePath: 'Templates/custom-template.md',
  openCreatedNote: true,
  fallbackRawHeading: '## 원문 전사',
  fileNamePattern: '{{date}} {{audio_base}}',
  recordingFolder: 'Recordings',
  autoGenerateNoteAfterRecording: true,
  recordingFileNamePattern: '{{date}} {{time}} recording',
  postProcessWithClaude: false,
  claudeBinary: 'claude',
  claudeTimeoutMs: 120000,
  claudeGuardrailFilePath: '',
  saveRawNoteBeforeClaude: true,
};

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'mp4', 'mpeg', 'mpga', 'webm', 'ogg', 'flac', 'aac', 'opus']);
const BUILTIN_GUARDRAILS = [
  'Use only the provided transcription text.',
  'Do not invent facts, names, dates, owners, or decisions.',
  'If a field is unclear, leave it empty rather than guessing.',
  'If something looks probable but uncertain, mark it as uncertain.',
  'Never rewrite the raw transcription as evidence. Preserve it separately.',
  'Keep summaries short and faithful.',
  'Action items must come only from explicit requests, commitments, or decisions in the transcription.',
  'If no explicit action item exists, return an empty list.',
  'If owner or due date is missing, keep that field empty.',
  'Output must be valid JSON only using this schema:',
  '{"summary":"","key_points":[],"decisions":[],"action_items":[{"owner":"","task":"","due_date":"","uncertain":false}],"open_questions":[]}'
].join('\n');

class AudioFileSuggestModal extends FuzzySuggestModal {
  constructor(app, files, onChoose) {
    super(app);
    this.files = files;
    this.onChoose = onChoose;
    this.setPlaceholder('Select an audio file from your vault');
  }
  getItems() { return this.files; }
  getItemText(file) { return file.path; }
  onChooseItem(item) { this.onChoose(item); }
}

module.exports = class LightningSimulWhisperTemplateDrivenPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordingStream = null;
    this.recordingStartedAt = null;
    this.recordingTimerId = null;
    this.statusBarEl = this.addStatusBarItem();
    this.recordingRibbonIconEl = this.addRibbonIcon('mic', 'Start microphone recording', async () => {
      await this.toggleRecording();
    });
    this.updateRecordingUI();

    this.addSettingTab(new TemplateDrivenSettingTab(this.app, this));

    this.addCommand({ id: 'check-bridge-server-health', name: 'Check bridge server health', callback: async () => {
      try {
        const result = await this.checkHealth();
        new Notice(`Bridge server OK: ${result.status || 'ok'}`);
      } catch (error) {
        console.error(error);
        new Notice(`Bridge server health check failed: ${error.message}`);
      }
    }});

    this.addCommand({ id: 'generate-note-from-audio-file', name: 'Generate note from audio file', callback: async () => {
      const files = this.getAudioFiles();
      if (!files.length) {
        new Notice('No audio files found in vault.');
        return;
      }
      new AudioFileSuggestModal(this.app, files, async (file) => {
        await this.generateDocumentFromAudio(file);
      }).open();
    }});

    this.addCommand({ id: 'generate-note-from-linked-audio', name: 'Generate note from linked audio in active note', callback: async () => {
      const file = this.findAudioFileFromActiveNote();
      if (!file) {
        new Notice('No linked audio file found in active note.');
        return;
      }
      await this.generateDocumentFromAudio(file);
    }});

    this.addCommand({ id: 'start-microphone-recording', name: 'Start microphone recording', callback: async () => { await this.startRecording(); }});
    this.addCommand({ id: 'stop-microphone-recording', name: 'Stop microphone recording', callback: async () => { await this.stopRecording(); }});
    this.addCommand({ id: 'toggle-microphone-recording', name: 'Toggle microphone recording', callback: async () => { await this.toggleRecording(); }});
  }

  onunload() {
    this.clearRecordingTimer();
    this.stopRecordingTracks();
  }

  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }
  isRecording() { return !!this.mediaRecorder && this.mediaRecorder.state === 'recording'; }

  updateRecordingUI() {
    this.updateRecordingStatusBar();
    this.updateRecordingRibbon();
  }

  updateRecordingStatusBar() {
    if (!this.statusBarEl) return;
    if (!this.isRecording() || !this.recordingStartedAt) {
      this.statusBarEl.setText('Mic idle');
      return;
    }
    const elapsedSec = Math.max(0, Math.floor((Date.now() - this.recordingStartedAt) / 1000));
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const ss = String(elapsedSec % 60).padStart(2, '0');
    this.statusBarEl.setText(`● Recording ${mm}:${ss}`);
  }

  updateRecordingRibbon() {
    if (!this.recordingRibbonIconEl) return;
    if (this.isRecording()) {
      this.recordingRibbonIconEl.addClass('lightning-simulwhisper-recording-active');
      this.recordingRibbonIconEl.setAttribute('aria-label', 'Stop microphone recording');
      this.recordingRibbonIconEl.setAttribute('title', 'Stop microphone recording');
      setIcon(this.recordingRibbonIconEl, 'square');
    } else {
      this.recordingRibbonIconEl.removeClass('lightning-simulwhisper-recording-active');
      this.recordingRibbonIconEl.setAttribute('aria-label', 'Start microphone recording');
      this.recordingRibbonIconEl.setAttribute('title', 'Start microphone recording');
      setIcon(this.recordingRibbonIconEl, 'mic');
    }
  }

  startRecordingTimer() {
    this.clearRecordingTimer();
    this.recordingTimerId = window.setInterval(() => this.updateRecordingUI(), 1000);
  }

  clearRecordingTimer() {
    if (this.recordingTimerId) {
      window.clearInterval(this.recordingTimerId);
      this.recordingTimerId = null;
    }
  }

  stopRecordingTracks() {
    if (this.recordingStream) {
      for (const track of this.recordingStream.getTracks()) {
        try { track.stop(); } catch (error) { console.error(error); }
      }
    }
    this.recordingStream = null;
  }

  getSupportedRecordingMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    if (typeof MediaRecorder === 'undefined') return '';
    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    }
    return '';
  }

  getExtensionForMimeType(mimeType) {
    if (!mimeType) return 'webm';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('mp4')) return 'm4a';
    return 'webm';
  }

  async toggleRecording() {
    if (this.isRecording()) await this.stopRecording();
    else await this.startRecording();
  }

  async startRecording() {
    if (this.isRecording()) {
      new Notice('Recording is already in progress.');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      new Notice('Microphone recording is not supported in this environment.');
      return;
    }
    try {
      this.recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.getSupportedRecordingMimeType();
      const options = mimeType ? { mimeType } : undefined;
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(this.recordingStream, options);
      this.mediaRecorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) this.recordedChunks.push(event.data); };
      this.mediaRecorder.onerror = (event) => { console.error(event); new Notice('Recording error occurred. See console for details.'); };
      this.mediaRecorder.start();
      this.recordingStartedAt = Date.now();
      this.startRecordingTimer();
      this.updateRecordingUI();
      new Notice('Microphone recording started.');
    } catch (error) {
      console.error(error);
      this.stopRecordingTracks();
      this.mediaRecorder = null;
      this.recordedChunks = [];
      this.recordingStartedAt = null;
      this.clearRecordingTimer();
      this.updateRecordingUI();
      new Notice(`Failed to start microphone recording: ${error.message}`);
    }
  }

  async stopRecording() {
    if (!this.isRecording()) {
      new Notice('No active recording.');
      return;
    }
    const recorder = this.mediaRecorder;
    await new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = reject; recorder.stop(); }).catch((error) => {
      console.error(error);
      new Notice(`Failed to stop recording: ${error.message}`);
    });
    this.clearRecordingTimer();
    this.stopRecordingTracks();
    this.mediaRecorder = null;
    this.updateRecordingUI();
    try {
      const mimeType = recorder.mimeType || this.getSupportedRecordingMimeType() || 'audio/webm';
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      this.recordedChunks = [];
      const audioFile = await this.saveRecordingBlob(blob, mimeType);
      this.recordingStartedAt = null;
      new Notice(`Recording saved: ${audioFile.path}`);
      if (this.settings.autoGenerateNoteAfterRecording) await this.generateDocumentFromAudio(audioFile, { trigger: 'recording' });
    } catch (error) {
      console.error(error);
      new Notice(`Failed to save recording: ${error.message}`);
    } finally {
      this.recordingStartedAt = null;
      this.updateRecordingUI();
    }
  }

  async saveRecordingBlob(blob, mimeType) {
    const folderPath = (this.settings.recordingFolder || 'Recordings').trim();
    await this.ensureFolderExists(folderPath);
    const now = new Date();
    const context = { date: this.formatDate(now), time: this.formatTime(now), datetime: this.formatDateTime(now) };
    const baseName = this.renderRecordingFileNamePattern(context).replace(/[^a-zA-Z0-9가-힣._ -]/g, '_');
    const ext = this.getExtensionForMimeType(mimeType);
    const path = this.getAvailableBinaryPath(`${folderPath}/${baseName}.${ext}`);
    const arrayBuffer = await blob.arrayBuffer();
    return await this.app.vault.createBinary(path, arrayBuffer);
  }

  renderRecordingFileNamePattern(context) {
    let output = this.settings.recordingFileNamePattern || '{{date}} {{time}} recording';
    for (const [key, value] of Object.entries(context)) output = output.split(`{{${key}}}`).join(String(value ?? ''));
    return output.trim();
  }

  getAvailableBinaryPath(initialPath) {
    if (!this.app.vault.getAbstractFileByPath(initialPath)) return initialPath;
    const dot = initialPath.lastIndexOf('.');
    const base = dot >= 0 ? initialPath.slice(0, dot) : initialPath;
    const ext = dot >= 0 ? initialPath.slice(dot) : '';
    let index = 2;
    while (true) {
      const candidate = `${base} ${index}${ext}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
      index += 1;
    }
  }

  getAudioFiles() { return this.app.vault.getFiles().filter((file) => AUDIO_EXTENSIONS.has((file.extension || '').toLowerCase())); }

  findAudioFileFromActiveNote() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return null;
    const cache = this.app.metadataCache.getFileCache(activeFile);
    const links = cache?.links || [];
    for (const link of links) {
      const destination = this.app.metadataCache.getFirstLinkpathDest(link.link, activeFile.path);
      if (destination instanceof TFile && AUDIO_EXTENSIONS.has((destination.extension || '').toLowerCase())) return destination;
    }
    return null;
  }

  async checkHealth() {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${this.settings.serverUrl.replace(/\/$/, '')}/health`, { method: 'GET', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async generateDocumentFromAudio(file, options = {}) {
    new Notice(`Generating note from: ${file.path}`);
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const transcription = await this.requestTranscription(file, arrayBuffer);
      let context = this.buildTemplateContext(file, transcription);
      const outputFolder = this.resolveOutputFolder(options);

      if (this.settings.postProcessWithClaude && this.settings.saveRawNoteBeforeClaude) {
        const rawRendered = this.renderTemplate(this.getRawTemplate(), context);
        await this.createOutputNote(file, rawRendered, context, outputFolder, ' raw');
      }

      if (this.settings.postProcessWithClaude) {
        const structured = await this.runClaudePostprocess(context.transcription);
        context = this.mergeStructuredContext(context, structured);
      }

      const template = await this.resolveTemplateContent();
      const rendered = this.renderTemplate(template, context);
      const suffix = this.settings.postProcessWithClaude ? ' structured' : '';
      const notePath = await this.createOutputNote(file, rendered, context, outputFolder, suffix);
      if (this.settings.openCreatedNote) {
        const created = this.app.vault.getAbstractFileByPath(notePath);
        if (created instanceof TFile) await this.app.workspace.getLeaf(true).openFile(created);
      }
      new Notice(`Note created: ${notePath}`);
    } catch (error) {
      console.error(error);
      new Notice(`Note generation failed: ${error.message}`);
    }
  }

  resolveOutputFolder(options = {}) {
    if (options.trigger === 'recording') return (this.settings.recordingNoteOutputFolder || this.settings.outputFolder || 'Generated Notes').trim();
    return (this.settings.outputFolder || 'Generated Notes').trim();
  }

  async requestTranscription(file, arrayBuffer) {
    const formData = new FormData();
    const blob = new Blob([arrayBuffer]);
    formData.append('file', blob, file.name);
    formData.append('language', this.settings.language);
    formData.append('model', this.settings.model);
    if (this.settings.prompt) formData.append('prompt', this.settings.prompt);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), this.settings.requestTimeoutMs);
    try {
      const response = await fetch(`${this.settings.serverUrl.replace(/\/$/, '')}/v1/transcriptions`, { method: 'POST', body: formData, signal: controller.signal });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      const result = await response.json();
      if (!result || typeof result.text !== 'string') throw new Error('Invalid transcription response: missing text');
      return result;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  buildTemplateContext(sourceFile, result) {
    const now = new Date();
    const date = this.formatDate(now);
    const datetime = this.formatDateTime(now);
    return {
      title: `${date} ${sourceFile.basename}`,
      date,
      datetime,
      audio_name: sourceFile.name,
      audio_base: sourceFile.basename,
      audio_path: sourceFile.path,
      language: result.language || this.settings.language,
      model: result.metadata?.model || this.settings.model,
      transcription: (result.text || '').trim(),
      raw_heading: this.settings.fallbackRawHeading || '## 원문 전사',
      segments_json: JSON.stringify(result.segments || [], null, 2),
      summary: '',
      key_points: '- ',
      decisions: '- ',
      action_items: '- ',
      open_questions: '- ',
    };
  }

  async runClaudePostprocess(transcriptionText) {
    const prompt = [
      'Return valid JSON only.',
      'Use this schema:',
      '{"summary":"","key_points":[],"decisions":[],"action_items":[{"owner":"","task":"","due_date":"","uncertain":false}],"open_questions":[]}',
      'Transcription:',
      transcriptionText,
    ].join('\n\n');
    const systemPrompt = await this.getClaudeGuardrails();
    try {
      const { stdout } = await execFileAsync(this.settings.claudeBinary || 'claude', ['-p', prompt, '--append-system-prompt', systemPrompt, '--output-format', 'json'], {
        timeout: this.settings.claudeTimeoutMs || 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const wrapped = JSON.parse(stdout);
      const resultText = typeof wrapped.result === 'string' ? wrapped.result : '{}';
      return JSON.parse(resultText);
    } catch (error) {
      console.error(error);
      new Notice('Claude post-processing failed. Falling back to transcription-only output.');
      return null;
    }
  }

  async getClaudeGuardrails() {
    const customPath = (this.settings.claudeGuardrailFilePath || '').trim();
    if (customPath) {
      const file = this.app.vault.getAbstractFileByPath(customPath);
      if (file instanceof TFile) return await this.app.vault.read(file);
    }
    return BUILTIN_GUARDRAILS;
  }

  mergeStructuredContext(context, structured) {
    if (!structured || typeof structured !== 'object') return context;
    return Object.assign({}, context, {
      summary: typeof structured.summary === 'string' ? structured.summary : '',
      key_points: this.renderBulletList(structured.key_points),
      decisions: this.renderBulletList(structured.decisions),
      action_items: this.renderActionItems(structured.action_items),
      open_questions: this.renderBulletList(structured.open_questions),
    });
  }

  renderBulletList(items) {
    if (!Array.isArray(items) || !items.length) return '- ';
    return items.map((item) => `- ${String(item ?? '').trim()}`).join('\n');
  }

  renderActionItems(items) {
    if (!Array.isArray(items) || !items.length) return '- ';
    return items.map((item) => {
      const owner = item?.owner || '';
      const task = item?.task || '';
      const dueDate = item?.due_date || '';
      const uncertain = item?.uncertain ? ' (uncertain)' : '';
      return `- 담당자: ${owner}${uncertain} | 일정: ${dueDate} | 내용: ${task}`;
    }).join('\n');
  }

  async resolveTemplateContent() {
    if (this.settings.templateMode === 'custom') {
      const file = this.app.vault.getAbstractFileByPath((this.settings.customTemplateFilePath || '').trim());
      if (file instanceof TFile) return await this.app.vault.read(file);
    }
    return this.getBuiltInTemplate(this.settings.templateMode);
  }

  getRawTemplate() {
    return ['# {{title}} 원문', '', '- 날짜: {{datetime}}', '- 원본 오디오: [[{{audio_path}}]]', '', '{{raw_heading}}', '{{transcription}}', ''].join('\n');
  }

  getBuiltInTemplate(mode) {
    if (mode === 'raw') return this.getRawTemplate();
    if (mode === 'interview') {
      return ['# {{title}} 인터뷰 정리', '', '## 인터뷰 정보', '- 날짜: {{datetime}}', '- 원본 오디오: [[{{audio_path}}]]', '', '## 핵심 요약', '{{summary}}', '', '## 주요 답변', '{{key_points}}', '', '## 인사이트/결정', '{{decisions}}', '', '## 열린 질문', '{{open_questions}}', '', '{{raw_heading}}', '{{transcription}}'].join('\n');
    }
    return ['# {{title}} 회의록', '', '## 회의 정보', '- 날짜: {{datetime}}', '- 원본 오디오: [[{{audio_path}}]]', '- 언어: {{language}}', '- 모델: {{model}}', '', '## 요약', '{{summary}}', '', '## 주요 논의 사항', '{{key_points}}', '', '## 결정 사항', '{{decisions}}', '', '## 액션 아이템', '{{action_items}}', '', '## 열린 질문', '{{open_questions}}', '', '{{raw_heading}}', '{{transcription}}', ''].join('\n');
  }

  renderTemplate(template, context) {
    let output = template;
    for (const [key, value] of Object.entries(context)) output = output.split(`{{${key}}}`).join(String(value ?? ''));
    return output.trimEnd() + '\n';
  }

  async createOutputNote(sourceFile, content, context, folderPathOverride = null, suffix = '') {
    const folderPath = (folderPathOverride || this.settings.outputFolder || 'Generated Notes').trim();
    await this.ensureFolderExists(folderPath);
    const fileNameBase = this.renderFileNamePattern(context);
    const safeBase = `${fileNameBase}${suffix}`.replace(/[^a-zA-Z0-9가-힣._ -]/g, '_');
    const notePath = this.getAvailableNotePath(`${folderPath}/${safeBase}.md`);
    await this.app.vault.create(notePath, content);
    return notePath;
  }

  renderFileNamePattern(context) {
    let output = this.settings.fileNamePattern || '{{date}} {{audio_base}}';
    for (const [key, value] of Object.entries(context)) output = output.split(`{{${key}}}`).join(String(value ?? ''));
    return output.trim();
  }

  formatDate(now) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  formatTime(now) {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${hh}-${mm}-${ss}`;
  }

  formatDateTime(now) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  getAvailableNotePath(initialPath) {
    if (!this.app.vault.getAbstractFileByPath(initialPath)) return initialPath;
    const lastDot = initialPath.lastIndexOf('.md');
    const base = initialPath.slice(0, lastDot);
    let index = 2;
    while (true) {
      const candidate = `${base} ${index}.md`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
      index += 1;
    }
  }

  async ensureFolderExists(folderPath) {
    const parts = folderPath.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
};

class TemplateDrivenSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: '설정 안내' });
    containerEl.createEl('p', { text: '전사 엔진, 마이크 녹음, Claude 후처리, 템플릿 기반 문서 생성을 이 화면에서 설정합니다.', cls: 'lightning-simulwhisper-setting-note' });
    new Setting(containerEl).setName('서버 URL').setDesc('bridge server 주소. 예: http://127.0.0.1:8765').addText((text) => text.setValue(this.plugin.settings.serverUrl).onChange(async (value) => { this.plugin.settings.serverUrl = value.trim() || DEFAULT_SETTINGS.serverUrl; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('언어').setDesc('전사 요청 기본 언어. 예: ko, en, auto').addText((text) => text.setValue(this.plugin.settings.language).onChange(async (value) => { this.plugin.settings.language = value.trim() || DEFAULT_SETTINGS.language; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('모델').setDesc('bridge server로 전달할 모델 이름. 예: medium').addText((text) => text.setValue(this.plugin.settings.model).onChange(async (value) => { this.plugin.settings.model = value.trim() || DEFAULT_SETTINGS.model; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('템플릿 모드').setDesc('기본 제공 템플릿 또는 사용자 템플릿 파일을 선택한다.').addDropdown((dropdown) => dropdown.addOption('meeting', '회의록').addOption('raw', '원문 전사').addOption('interview', '인터뷰 정리').addOption('custom', '사용자 템플릿').setValue(this.plugin.settings.templateMode).onChange(async (value) => { this.plugin.settings.templateMode = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('사용자 템플릿 파일 경로').setDesc('템플릿 모드가 사용자 템플릿일 때 사용할 Vault 내부 경로').addText((text) => text.setValue(this.plugin.settings.customTemplateFilePath).onChange(async (value) => { this.plugin.settings.customTemplateFilePath = value.trim() || DEFAULT_SETTINGS.customTemplateFilePath; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('일반 노트 저장 폴더').setDesc('기존 오디오 파일로 생성한 노트를 저장할 폴더').addText((text) => text.setValue(this.plugin.settings.outputFolder).onChange(async (value) => { this.plugin.settings.outputFolder = value.trim() || DEFAULT_SETTINGS.outputFolder; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('녹음 후 노트 저장 폴더').setDesc('마이크 녹음 종료 후 자동 생성되는 노트를 저장할 폴더').addText((text) => text.setValue(this.plugin.settings.recordingNoteOutputFolder).onChange(async (value) => { this.plugin.settings.recordingNoteOutputFolder = value.trim() || DEFAULT_SETTINGS.recordingNoteOutputFolder; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('노트 파일명 패턴').setDesc('예: {{date}} {{audio_base}}').addText((text) => text.setValue(this.plugin.settings.fileNamePattern).onChange(async (value) => { this.plugin.settings.fileNamePattern = value || DEFAULT_SETTINGS.fileNamePattern; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('녹음 파일 저장 폴더').setDesc('마이크로 녹음한 오디오 파일을 저장할 Vault 폴더').addText((text) => text.setValue(this.plugin.settings.recordingFolder).onChange(async (value) => { this.plugin.settings.recordingFolder = value.trim() || DEFAULT_SETTINGS.recordingFolder; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('녹음 파일명 패턴').setDesc('예: {{date}} {{time}} recording').addText((text) => text.setValue(this.plugin.settings.recordingFileNamePattern).onChange(async (value) => { this.plugin.settings.recordingFileNamePattern = value || DEFAULT_SETTINGS.recordingFileNamePattern; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('녹음 종료 후 자동 노트 생성').setDesc('녹음을 멈추면 자동으로 전사 및 노트 생성을 수행한다.').addToggle((toggle) => toggle.setValue(!!this.plugin.settings.autoGenerateNoteAfterRecording).onChange(async (value) => { this.plugin.settings.autoGenerateNoteAfterRecording = !!value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Claude 후처리 사용').setDesc('전사 후 Claude headless로 요약과 구조화 작업을 추가 수행한다.').addToggle((toggle) => toggle.setValue(!!this.plugin.settings.postProcessWithClaude).onChange(async (value) => { this.plugin.settings.postProcessWithClaude = !!value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Claude 실행 파일').setDesc('기본값은 claude. 다른 경로를 쓸 경우 실행 파일 경로를 입력한다.').addText((text) => text.setValue(this.plugin.settings.claudeBinary).onChange(async (value) => { this.plugin.settings.claudeBinary = value.trim() || DEFAULT_SETTINGS.claudeBinary; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Claude 타임아웃 (ms)').setDesc('Claude headless 후처리 최대 대기 시간').addText((text) => text.setValue(String(this.plugin.settings.claudeTimeoutMs)).onChange(async (value) => { const parsed = Number(value); this.plugin.settings.claudeTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.claudeTimeoutMs; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Claude 가드레일 파일 경로').setDesc('사용자 지정 환각 방지 지침 파일의 Vault 내부 경로').addText((text) => text.setValue(this.plugin.settings.claudeGuardrailFilePath).onChange(async (value) => { this.plugin.settings.claudeGuardrailFilePath = value.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Claude 전에 원문 노트 저장').setDesc('Claude 후처리 전에 전사 원문 노트를 먼저 저장한다.').addToggle((toggle) => toggle.setValue(!!this.plugin.settings.saveRawNoteBeforeClaude).onChange(async (value) => { this.plugin.settings.saveRawNoteBeforeClaude = !!value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('생성된 노트 자동 열기').setDesc('노트 생성 후 자동으로 새 노트를 연다.').addToggle((toggle) => toggle.setValue(!!this.plugin.settings.openCreatedNote).onChange(async (value) => { this.plugin.settings.openCreatedNote = !!value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('추가 프롬프트').setDesc('전사 요청 시 함께 보낼 선택 입력').addTextArea((text) => text.setValue(this.plugin.settings.prompt).onChange(async (value) => { this.plugin.settings.prompt = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('전사 요청 타임아웃 (ms)').setDesc('업로드와 전사 요청 최대 대기 시간').addText((text) => text.setValue(String(this.plugin.settings.requestTimeoutMs)).onChange(async (value) => { const parsed = Number(value); this.plugin.settings.requestTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.requestTimeoutMs; await this.plugin.saveSettings(); }));
  }
}
