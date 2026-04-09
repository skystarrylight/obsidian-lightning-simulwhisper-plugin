# Quick start

## 1. Bridge server

```bash
pip install -r packages/bridge-server/requirements.txt
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
uvicorn packages.bridge-server.app:app --host 127.0.0.1 --port 8765 --reload
```

## 2. Obsidian plugin

Copy these files into:

```text
<Vault>/.obsidian/plugins/lightning-simulwhisper-template-driven/
```

Files:

- `packages/obsidian-plugin/main.js`
- `packages/obsidian-plugin/manifest.json`
- `packages/obsidian-plugin/styles.css`
- `packages/obsidian-plugin/versions.json`

## 3. Templates

Use one of these sample templates in your vault:

- `templates/raw-transcription.sample.md`
- `templates/meeting-note.sample.md`
- `templates/interview-note.sample.md`

## 4. Commands

- `Check bridge server health`
- `Generate note from audio file`
- `Generate note from linked audio in active note`
