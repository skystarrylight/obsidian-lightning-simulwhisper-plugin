const { Plugin, PluginSettingTab, Setting, Notice, FuzzySuggestModal, TFile } = require('obsidian');

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
};

const AUDIO_EXTENSIONS = new Set(['mp3','wav','m4a','mp4','mpeg','mpga','webm','ogg','flac','aac','opus']);

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
    this.updateRecordingStatusBar();

    this.addSettingTab(new TemplateDrivenSettingTab(this.app, this));

    this.addCommand({
      id: 'check-bridge-server-health',
      name: 'Check bridge server health',
      callback: async () => {
        try {
          const result = await this.checkHealth();
          new Notice(`Bridge server OK: ${result.status || 'ok'}`);
        } catch (error) {
          console.error(error);
          new Notice(`Bridge server health check failed: ${error.message}`);
        }
      },
    });

    this.addCommand({
      id: 'generate-note-from-audio-file',
      name: 'Generate note from audio file',
      callback: async () => {
        const files = this.getAudioFiles();
        if (!files.length) {
          new Notice('No audio files found in vault.');
          return;
        }
        new AudioFileSuggestModal(this.app, files, async (file) => {
          await this.generateDocumentFromAudio(file);
        }).open();
      },
    });

    this.addCommand({
      id: 'generate-note-from-linked-audio',
      name: 'Generate note from linked audio in active note',
      callback: async () => {
        const file = this.findAudioFileFromActiveNote();
        if (!file) {
          new Notice('No linked audio file found in active note.');
          return;
        }
        await this.generateDocumentFromAudio(file);
      },
    });

    this.addCommand({
      id: 'start-microphone-recording',
      name: 'Start microphone recording',
      callback: async () => {
        await this.startRecording();
      },
    });

    this.addCommand({
      id: 'stop-microphone-recording',
      name: 'Stop microphone recording',
      callback: async () => {
        await this.stopRecording();
      },
    });

    this.addCommand({
      id: 'toggle-microphone-recording',
      name: 'Toggle microphone recording',
      callback: async () => {
        if (this.isRecording()) {
          await this.stopRecording();
        } else {
          await this.startRecording();
        }
      },
    });
  }

  onunload() {
    this.clearRecordingTimer();
    this.stopRecordingTracks();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  isRecording() {
    return !!this.mediaRecorder && this.mediaRecorder.state === 'recording';
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

  startRecordingTimer() {
    this.clearRecordingTimer();
    this.recordingTimerId = window.setInterval(() => this.updateRecordingStatusBar(), 1000);
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
        try {
          track.stop();
        } catch (error) {
          console.error(error);
        }
      }
    }
    this.recordingStream = null;
  }

  getSupportedRecordingMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];
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
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      this.mediaRecorder.onerror = (event) => {
        console.error(event);
        new Notice('Recording error occurred. See console for details.');
      };
      this.mediaRecorder.start();
      this.recordingStartedAt = Date.now();
      this.startRecordingTimer();
      this.updateRecordingStatusBar();
      new Notice('Microphone recording started.');
    } catch (error) {
      console.error(error);
      this.stopRecordingTracks();
      this.mediaRecorder = null;
      this.recordedChunks = [];
      this.recordingStartedAt = null;
      this.clearRecordingTimer();
      this.updateRecordingStatusBar();
      new Notice(`Failed to start microphone recording: ${error.message}`);
    }
  }

  async stopRecording() {
    if (!this.isRecording()) {
      new Notice('No active recording.');
      return;
    }

    const recorder = this.mediaRecorder;
    await new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = reject;
      recorder.stop();
    }).catch((error) => {
      console.error(error);
      new Notice(`Failed to stop recording: ${error.message}`);
    });

    this.clearRecordingTimer();
    this.stopRecordingTracks();
    this.mediaRecorder = null;
    this.updateRecordingStatusBar();

    try {
      const mimeType = recorder.mimeType || this.getSupportedRecordingMimeType() || 'audio/webm';
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      this.recordedChunks = [];
      const audioFile = await this.saveRecordingBlob(blob, mimeType);
      this.recordingStartedAt = null;
      new Notice(`Recording saved: ${audioFile.path}`);
      if (this.settings.autoGenerateNoteAfterRecording) {
        await this.generateDocumentFromAudio(audioFile, { trigger: 'recording' });
      }
    } catch (error) {
      console.error(error);
      new Notice(`Failed to save recording: ${error.message}`);
    } finally {
      this.recordingStartedAt = null;
      this.updateRecordingStatusBar();
    }
  }

  async saveRecordingBlob(blob, mimeType) {
    const folderPath = (this.settings.recordingFolder || 'Recordings').trim();
    await this.ensureFolderExists(folderPath);
    const now = new Date();
    const context = {
      date: this.formatDate(now),
      time: this.formatTime(now),
      datetime: this.formatDateTime(now),
    };
    const baseName = this.renderRecordingFileNamePattern(context).replace(/[^a-zA-Z0-9가-힣._ -]/g, '_');
    const ext = this.getExtensionForMimeType(mimeType);
    const path = this.getAvailableBinaryPath(`${folderPath}/${baseName}.${ext}`);
    const arrayBuffer = await blob.arrayBuffer();
    return await this.app.vault.createBinary(path, arrayBuffer);
  }

  renderRecordingFileNamePattern(context) {
    let output = this.settings.recordingFileNamePattern || '{{date}} {{time}} recording';
    for (const [key, value] of Object.entries(context)) {
      output = output.split(`{{${key}}}`).join(String(value ?? ''));
    }
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

  getAudioFiles() {
    return this.app.vault.getFiles().filter((file) => AUDIO_EXTENSIONS.has((file.extension || '').toLowerCase()));
  }

  findAudioFileFromActiveNote() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return null;
    const cache = this.app.metadataCache.getFileCache(activeFile);
    const links = cache?.links || [];
    for (const link of links) {
      const destination = this.app.metadataCache.getFirstLinkpathDest(link.link, activeFile.path);
      if (destination instanceof TFile && AUDIO_EXTENSIONS.has((destination.extension || '').toLowerCase())) {
        return destination;
      }
    }
    return null;
  }

  async checkHealth() {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${this.settings.serverUrl.replace(/\/$/, '')}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
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
      const context = this.buildTemplateContext(file, transcription);
      const template = await this.resolveTemplateContent();
      const rendered = this.renderTemplate(template, context);
      const outputFolder = this.resolveOutputFolder(options);
      const notePath = await this.createOutputNote(file, rendered, context, outputFolder);
      if (this.settings.openCreatedNote) {
        const created = this.app.vault.getAbstractFileByPath(notePath);
        if (created instanceof TFile) {
          await this.app.workspace.getLeaf(true).openFile(created);
        }
      }
      new Notice(`Note created: ${notePath}`);
    } catch (error) {
      console.error(error);
      new Notice(`Note generation failed: ${error.message}`);
    }
  }

  resolveOutputFolder(options = {}) {
    if (options.trigger === 'recording') {
      return (this.settings.recordingNoteOutputFolder || this.settings.outputFolder || 'Generated Notes').trim();
    }
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
      const response = await fetch(`${this.settings.serverUrl.replace(/\/$/, '')}/v1/transcriptions`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      const result = await response.json();
      if (!result || typeof result.text !== 'string') {
        throw new Error('Invalid transcription response: missing text');
      }
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
      action_items: '',
    };
  }

  async resolveTemplateContent() {
    if (this.settings.templateMode === 'custom') {
      const file = this.app.vault.getAbstractFileByPath((this.settings.customTemplateFilePath || '').trim());
      if (file instanceof TFile) return await this.app.vault.read(file);
    }
    return this.getBuiltInTemplate(this.settings.templateMode);
  }

  getBuiltInTemplate(mode) {
    if (mode === 'raw') {
      return [
        '# {{title}}',
        '',
        '- 날짜: {{datetime}}',
        '- 원본 오디오: [[{{audio_path}}]]',
        '- 언어: {{language}}',
        '- 모델: {{model}}',
        '',
        '{{raw_heading}}',
        '{{transcription}}',
        '',
      ].join('\n');
    }
    if (mode === 'interview') {
      return [
        '# {{title}} 인터뷰 정리',
        '',
        '## 인터뷰 정보',
        '- 날짜: {{datetime}}',
        '- 원본 오디오: [[{{audio_path}}]]',
        '',
        '## 핵심 요약',
        '- ',
        '',
        '## 주요 답변',
        '- ',
        '',
        '## 인사이트',
        '- ',
        '',
        '{{raw_heading}}',
        '{{transcription}}',
      ].join('\n');
    }
    return [
      '# {{title}} 회의록',
      '',
      '## 회의 정보',
      '- 날짜: {{datetime}}',
      '- 원본 오디오: [[{{audio_path}}]]',
      '- 언어: {{language}}',
      '- 모델: {{model}}',
      '',
      '## 참석자',
      '- ',
      '',
      '## 안건',
      '- ',
      '',
      '## 주요 논의 사항',
      '- ',
      '',
      '## 결정 사항',
      '- ',
      '',
      '## 액션 아이템',
      '- 담당자: ',
      '- 마감일: ',
      '- 내용: ',
      '',
      '{{raw_heading}}',
      '{{transcription}}',
      '',
    ].join('\n');
  }

  renderTemplate(template, context) {
    let output = template;
    for (const [key, value] of Object.entries(context)) {
      output = output.split(`{{${key}}}`).join(String(value ?? ''));
    }
    return output.trimEnd() + '\n';
  }

  async createOutputNote(sourceFile, content, context, folderPathOverride = null) {
    const folderPath = (folderPathOverride || this.settings.outputFolder || 'Generated Notes').trim();
    await this.ensureFolderExists(folderPath);
    const fileNameBase = this.renderFileNamePattern(context);
    const safeBase = fileNameBase.replace(/[^a-zA-Z0-9가-힣._ -]/g, '_');
    const notePath = this.getAvailableNotePath(`${folderPath}/${safeBase}.md`);
    await this.app.vault.create(notePath, content);
    return notePath;
  }

  renderFileNamePattern(context) {
    let output = this.settings.fileNamePattern || '{{date}} {{audio_base}}';
    for (const [key, value] of Object.entries(context)) {
      output = output.split(`{{${key}}}`).join(String(value ?? ''));
    }
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
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
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
    containerEl.createEl('h2', { text: 'Template Driven Settings' });
    containerEl.createEl('p', {
      text: 'Use one transcription pipeline, microphone recording, and template-driven markdown generation.',
      cls: 'lightning-simulwhisper-setting-note',
    });

    new Setting(containerEl).setName('Server URL').setDesc('Example: http://127.0.0.1:8765').addText((text) => text.setValue(this.plugin.settings.serverUrl).onChange(async (value) => { this.plugin.settings.serverUrl = value.trim() || DEFAULT_SETTINGS.serverUrl; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Language').setDesc('ko, en, or auto').addText((text) => text.setValue(this.plugin.settings.language).onChange(async (value) => { this.plugin.settings.language = value.trim() || DEFAULT_SETTINGS.language; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Model').setDesc('Model name forwarded to the bridge server').addText((text) => text.setValue(this.plugin.settings.model).onChange(async (value) => { this.plugin.settings.model = value.trim() || DEFAULT_SETTINGS.model; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Template mode').setDesc('Built-in raw, meeting, interview, or custom template file').addDropdown((dropdown) => dropdown.addOption('meeting', 'Meeting').addOption('raw', 'Raw').addOption('interview', 'Interview').addOption('custom', 'Custom').setValue(this.plugin.settings.templateMode).onChange(async (value) => { this.plugin.settings.templateMode = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Custom template file path').setDesc('Used when template mode is Custom').addText((text) => text.setValue(this.plugin.settings.customTemplateFilePath).onChange(async (value) => { this.plugin.settings.customTemplateFilePath = value.trim() || DEFAULT_SETTINGS.customTemplateFilePath; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Output folder').setDesc('Folder for notes generated from existing audio files').addText((text) => text.setValue(this.plugin.settings.outputFolder).onChange(async (value) => { this.plugin.settings.outputFolder = value.trim() || DEFAULT_SETTINGS.outputFolder; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Recording note output folder').setDesc('Folder for template-based notes generated after microphone recording stops').addText((text) => text.setValue(this.plugin.settings.recordingNoteOutputFolder).onChange(async (value) => { this.plugin.settings.recordingNoteOutputFolder = value.trim() || DEFAULT_SETTINGS.recordingNoteOutputFolder; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('File name pattern').setDesc('Example: {{date}} {{audio_base}}').addText((text) => text.setValue(this.plugin.settings.fileNamePattern).onChange(async (value) => { this.plugin.settings.fileNamePattern = value || DEFAULT_SETTINGS.fileNamePattern; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Recording folder').setDesc('Vault folder where recorded audio files are saved').addText((text) => text.setValue(this.plugin.settings.recordingFolder).onChange(async (value) => { this.plugin.settings.recordingFolder = value.trim() || DEFAULT_SETTINGS.recordingFolder; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Recording file name pattern').setDesc('Example: {{date}} {{time}} recording').addText((text) => text.setValue(this.plugin.settings.recordingFileNamePattern).onChange(async (value) => { this.plugin.settings.recordingFileNamePattern = value || DEFAULT_SETTINGS.recordingFileNamePattern; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Auto generate note after recording').setDesc('Automatically transcribe and create note when recording stops').addToggle((toggle) => toggle.setValue(!!this.plugin.settings.autoGenerateNoteAfterRecording).onChange(async (value) => { this.plugin.settings.autoGenerateNoteAfterRecording = !!value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Open created note').setDesc('Open generated note after creation').addToggle((toggle) => toggle.setValue(!!this.plugin.settings.openCreatedNote).onChange(async (value) => { this.plugin.settings.openCreatedNote = !!value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Prompt').setDesc('Optional prompt sent with transcription request').addTextArea((text) => text.setValue(this.plugin.settings.prompt).onChange(async (value) => { this.plugin.settings.prompt = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Request timeout (ms)').setDesc('Timeout for upload and transcription request').addText((text) => text.setValue(String(this.plugin.settings.requestTimeoutMs)).onChange(async (value) => { const parsed = Number(value); this.plugin.settings.requestTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.requestTimeoutMs; await this.plugin.saveSettings(); }));
  }
}
