const { Plugin, PluginSettingTab, Setting, Notice, FuzzySuggestModal, TFile } = require('obsidian');

const DEFAULT_SETTINGS = {
  serverUrl: 'http://127.0.0.1:8765',
  language: 'ko',
  model: 'medium',
  prompt: '',
  outputMode: 'append-to-active-note',
  outputFolder: 'Transcriptions',
  heading: '## Transcription',
  requestTimeoutMs: 120000,
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

module.exports = class LightningSimulWhisperPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new LightningSimulWhisperSettingTab(this.app, this));

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
      id: 'transcribe-audio-file-from-vault',
      name: 'Transcribe audio file from vault',
      callback: async () => {
        const files = this.getAudioFiles();
        if (!files.length) {
          new Notice('No audio files found in vault.');
          return;
        }
        new AudioFileSuggestModal(this.app, files, async (file) => {
          await this.transcribeFile(file);
        }).open();
      },
    });

    this.addCommand({
      id: 'transcribe-linked-audio-in-active-note',
      name: 'Transcribe linked audio in active note',
      callback: async () => {
        const file = this.findAudioFileFromActiveNote();
        if (!file) {
          new Notice('No linked audio file found in active note.');
          return;
        }
        await this.transcribeFile(file);
      },
    });
  }

  onunload() {}

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

  async transcribeFile(file) {
    new Notice(`Transcribing: ${file.path}`);
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const result = await this.requestTranscription(file, arrayBuffer);
      await this.writeTranscriptionResult(file, result);
      new Notice(`Transcription completed: ${file.name}`);
    } catch (error) {
      console.error(error);
      new Notice(`Transcription failed: ${error.message}`);
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

  buildTranscriptionBlock(sourceFile, result) {
    const parts = [];
    parts.push(this.settings.heading || '## Transcription');
    parts.push('');
    parts.push(`Source: [[${sourceFile.path}]]`);
    if (result.language) parts.push(`Language: ${result.language}`);
    if (result.metadata?.model) parts.push(`Model: ${result.metadata.model}`);
    parts.push('');
    parts.push(result.text.trim());
    parts.push('');
    return parts.join('\n');
  }

  async writeTranscriptionResult(sourceFile, result) {
    const block = this.buildTranscriptionBlock(sourceFile, result);
    if (this.settings.outputMode === 'create-new-note') {
      await this.createNewNote(sourceFile, block);
    } else {
      await this.appendToActiveNote(block);
    }
  }

  async appendToActiveNote(block) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) throw new Error('No active note to append transcription into');
    const original = await this.app.vault.read(activeFile);
    const next = original.trimEnd() + '\n\n' + block + '\n';
    await this.app.vault.modify(activeFile, next);
  }

  async createNewNote(sourceFile, block) {
    const folderPath = (this.settings.outputFolder || 'Transcriptions').trim();
    await this.ensureFolderExists(folderPath);
    const baseName = sourceFile.basename.replace(/[^a-zA-Z0-9가-힣._ -]/g, '_');
    const notePath = this.getAvailableNotePath(`${folderPath}/${baseName} transcription.md`);
    await this.app.vault.create(notePath, block + '\n');
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

class LightningSimulWhisperSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Lightning SimulWhisper Settings' });
    containerEl.createEl('p', {
      text: 'Configure the local bridge server that wraps Lightning-SimulWhisper.',
      cls: 'lightning-simulwhisper-setting-note',
    });

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc('Example: http://127.0.0.1:8765')
      .addText((text) => text
        .setPlaceholder('http://127.0.0.1:8765')
        .setValue(this.plugin.settings.serverUrl)
        .onChange(async (value) => {
          this.plugin.settings.serverUrl = value.trim() || DEFAULT_SETTINGS.serverUrl;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Language')
      .setDesc('ko, en, or auto')
      .addText((text) => text
        .setValue(this.plugin.settings.language)
        .onChange(async (value) => {
          this.plugin.settings.language = value.trim() || DEFAULT_SETTINGS.language;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Model name forwarded to the bridge server')
      .addText((text) => text
        .setValue(this.plugin.settings.model)
        .onChange(async (value) => {
          this.plugin.settings.model = value.trim() || DEFAULT_SETTINGS.model;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Prompt')
      .setDesc('Optional prompt sent with transcription request')
      .addTextArea((text) => text
        .setValue(this.plugin.settings.prompt)
        .onChange(async (value) => {
          this.plugin.settings.prompt = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Output mode')
      .setDesc('Append to active note or create a separate note')
      .addDropdown((dropdown) => dropdown
        .addOption('append-to-active-note', 'Append to active note')
        .addOption('create-new-note', 'Create new note')
        .setValue(this.plugin.settings.outputMode)
        .onChange(async (value) => {
          this.plugin.settings.outputMode = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Output folder')
      .setDesc('Used only when output mode is Create new note')
      .addText((text) => text
        .setValue(this.plugin.settings.outputFolder)
        .onChange(async (value) => {
          this.plugin.settings.outputFolder = value.trim() || DEFAULT_SETTINGS.outputFolder;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Heading')
      .setDesc('Heading inserted before transcription text')
      .addText((text) => text
        .setValue(this.plugin.settings.heading)
        .onChange(async (value) => {
          this.plugin.settings.heading = value || DEFAULT_SETTINGS.heading;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Request timeout (ms)')
      .setDesc('Timeout for upload and transcription request')
      .addText((text) => text
        .setValue(String(this.plugin.settings.requestTimeoutMs))
        .onChange(async (value) => {
          const parsed = Number(value);
          this.plugin.settings.requestTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.requestTimeoutMs;
          await this.plugin.saveSettings();
        }));
  }
}
