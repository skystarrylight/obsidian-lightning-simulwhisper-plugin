# Obsidian Lightning-SimulWhisper Plugin

Obsidian desktop plugin for transcribing vault audio files through a local bridge server powered by `Lightning-SimulWhisper`.

## What this plugin does

- Select an audio file from your Obsidian vault and transcribe it
- Extract the first linked audio file from the active note and transcribe it
- Append the result into the active note or create a separate Markdown note
- Check whether the local bridge server is reachable before running large jobs

## Why a bridge server

This plugin does not run `Lightning-SimulWhisper` inside Obsidian directly.

Instead, it uploads the chosen audio file to a local bridge server. That bridge server is responsible for calling `Lightning-SimulWhisper` in CLI mode or server mode and returning a normalized JSON response.

This keeps the plugin simpler and makes the engine layer replaceable.

## Expected bridge API

### `GET /health`

```json
{ "status": "ok" }
```

### `POST /v1/transcriptions`

Multipart form fields:

- `file`: audio binary
- `language`: `ko`, `en`, or `auto`
- `model`: model name
- `prompt`: optional

Response example:

```json
{
  "text": "transcribed text",
  "language": "ko",
  "segments": [],
  "metadata": {
    "engine": "lightning-simulwhisper",
    "model": "medium"
  }
}
```

## Development

```bash
npm install
npm run build
```

Copy these files into your test vault:

- `main.js`
- `manifest.json`
- `styles.css`

Target path:

```text
<YourVault>/.obsidian/plugins/lightning-simulwhisper/
```

## Commands

- **Check bridge server health**
- **Transcribe audio file from vault**
- **Transcribe linked audio in active note**

## Notes

- Desktop only
- Best paired with Apple Silicon and a local `Lightning-SimulWhisper` bridge

## Repo docs

- `docs/design.md`
- `docs/quick-guide.md`
