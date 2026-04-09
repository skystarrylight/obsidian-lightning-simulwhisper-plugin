# Meeting Notes Ready Bundle

This bundle is intended for the level where STT output is written into an Obsidian meeting note template.

## Files

- `manifest.json`
- `main.js`
- `styles.css`
- `meeting-note-template.sample.md`

## How to use

1. Copy `manifest.json`, `main.js`, and `styles.css` into:

```text
<Vault>/.obsidian/plugins/lightning-simulwhisper-meeting-notes/
```

2. Copy `meeting-note-template.sample.md` into your vault, for example:

```text
Templates/meeting-note-template.md
```

3. In plugin settings, set:

- Server URL: `http://127.0.0.1:8765`
- Template file path: `Templates/meeting-note-template.md`
- Output folder: `Meetings`

4. Run one of the commands:

- `Create meeting note from audio file`
- `Create meeting note from linked audio in active note`

## Supported template placeholders

- `{{title}}`
- `{{date}}`
- `{{audio_name}}`
- `{{audio_path}}`
- `{{language}}`
- `{{model}}`
- `{{transcription}}`
- `{{raw_heading}}`

## Current level

This bundle is designed so that when the bridge server returns real STT text, the plugin writes a meeting note using the template file path in the vault.

The meeting note structure is template-driven rather than hard-coded in the plugin.
