const { Plugin, PluginSettingTab, Setting, Notice, FuzzySuggestModal, TFile } = require('obsidian');

const DEFAULT_SETTINGS = {
  serverUrl: 'http://127.0.0.1:8765',
  language: 'ko',
  model: 'medium',
  prompt: '',
  outputFolder: 'Meetings',
  requestTimeoutMs: 120000,
  templateFilePath: 'Templates/meeting-note-template.md',
  fallbackHeadingRaw: '## 원문 전사',
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

module.exports = class LightningSimulWhisperMeetingNotesPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MeetingNotesSettingTab(this.app, this));

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
      id: 'create-meeting-note-from-audio-file',
      name: 'Create meeting note from audio file',
      callback: async () => {
        const files = this.getAudioFiles();
        if (!files.length) {
          new Notice('No audio files found in vault.');
          return;
        }
        new AudioFileSuggestModal(this.app, files, async (file) => {
          await this.transcribeToMeetingNote(file);
        }).open();
      },
    });

    this.addCommand({
      id: 'create-meeting-note-from-linked-audio',
      name: 'Create meeting note from linked audio in active note',
      callback: async () => {
        const file = this.findAudioFileFromActiveNote();
        if (!file) {
          new Notice('No linked audio file found in active note.');
          return;
        }
        await this.transcribeToMeetingNote(file);
      },
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
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

  async transcribeToMeetingNote(file) {
    new Notice(`Transcribing to meeting note: ${file.path}`);
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const result = await this.requestTranscription(file, arrayBuffer);
      const notePath = await this.createMeetingNote(file, result);
      new Notice(`Meeting note created: ${notePath}`);
    } catch (error) {
      console.error(error);
      new Notice(`Meeting note creation failed: ${error.message}`);
    }
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

  async createMeetingNote(sourceFile, result) {
    const folderPath = (this.settings.outputFolder || 'Meetings').trim();
    await this.ensureFolderExists(folderPath);

    const template = await this.loadTemplateContent();
    const content = this.renderMeetingTemplate(template, sourceFile, result);
    const baseName = sourceFile.basename.replace(/[^a-zA-Z0-9가-힣._ -]/g, '_');
    const datePrefix = this.getTodayString();
    const notePath = this.getAvailableNotePath(`${folderPath}/${datePrefix} ${baseName} 회의록.md`);
    await this.app.vault.create(notePath, content);
    return notePath;
  }

  async loadTemplateContent() {
    const templatePath = (this.settings.templateFilePath || '').trim();
    if (!templatePath) {
      return this.getFallbackTemplate();
    }
    const abstractFile = this.app.vault.getAbstractFileByPath(templatePath);
    if (!(abstractFile instanceof TFile)) {
      return this.getFallbackTemplate();
    }
    return await this.app.vault.read(abstractFile);
  }

  getFallbackTemplate() {
    return [
      '# {{title}}',
      '',
      '## 회의 정보',
      '- 날짜: {{date}}',
      '- 원본 오디오: [[{{audio_path}}]]',
      '- 언어: {{language}}',
      '- 모델: {{model}}',
      '',
      '## 요약',
      '- ',
      '',
      '## 주요 논의 사항',
      '- ',
      '',
      '## 액션 아이템',
      '- 담당자: ',
      '',
      '{{raw_heading}}',
      '{{transcription}}',
      '',
    ].join('\n');
  }

  renderMeetingTemplate(template, sourceFile, result) {
    const title = `${this.getTodayString()} ${sourceFile.basename} 회의록`;
    const replacements = {
      '{{title}}': title,
      '{{date}}': this.getNowString(),
      '{{audio_name}}': sourceFile.name,
      '{{audio_path}}': sourceFile.path,
      '{{language}}': result.language || this.settings.language,
      '{{model}}': result.metadata?.model || this.settings.model,
      '{{transcription}}': (result.text || '').trim(),
      '{{raw_heading}}': this.settings.fallbackHeadingRaw || '## 원문 전사',
    };

    let output = template;
    for (const [key, value] of Object.entries(replacements)) {
      output = output.split(key).join(String(value ?? ''));
    }
    return output.trimEnd() + '\n';
  }

  getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getNowString() {
    const now = new Date();
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

class MeetingNotesSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Meeting Notes Settings' });
    containerEl.createEl('p', {
      text: 'Read a template Markdown file from your vault and create a meeting note after transcription.',
      cls: 'lightning-simulwhisper-setting-note',
    });

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc('Example: http://127.0.0.1:8765')
      .addText((text) => text.setValue(this.plugin.settings.serverUrl).onChange(async (value) => {
        this.plugin.settings.serverUrl = value.trim() || DEFAULT_SETTINGS.serverUrl;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Language')
      .setDesc('ko, en, or auto')
      .addText((text) => text.setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.settings.language = value.trim() || DEFAULT_SETTINGS.language;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Model name forwarded to the bridge server')
      .addText((text) => text.setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value.trim() || DEFAULT_SETTINGS.model;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Template file path')
      .setDesc('Example: Templates/meeting-note-template.md')
      .addText((text) => text.setValue(this.plugin.settings.templateFilePath).onChange(async (value) => {
        this.plugin.settings.templateFilePath = value.trim() || DEFAULT_SETTINGS.templateFilePath;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Output folder')
      .setDesc('Folder where meeting note files are created')
      .addText((text) => text.setValue(this.plugin.settings.outputFolder).onChange(async (value) => {
        this.plugin.settings.outputFolder = value.trim() || DEFAULT_SETTINGS.outputFolder;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Prompt')
      .setDesc('Optional prompt sent with transcription request')
      .addTextArea((text) => text.setValue(this.plugin.settings.prompt).onChange(async (value) => {
        this.plugin.settings.prompt = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Request timeout (ms)')
      .setDesc('Timeout for upload and transcription request')
      .addText((text) => text.setValue(String(this.plugin.settings.requestTimeoutMs)).onChange(async (value) => {
        const parsed = Number(value);
        this.plugin.settings.requestTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.requestTimeoutMs;
        await this.plugin.saveSettings();
      }));
  }
}
