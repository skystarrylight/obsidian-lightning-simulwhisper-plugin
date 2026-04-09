# Examples

This folder contains local bridge server examples for connecting the Obsidian plugin to a local transcription engine.

Recommended example:

- `bridge_server_fastapi.py`

Run:

```bash
pip install fastapi uvicorn python-multipart
uvicorn examples.bridge_server_fastapi:app --host 127.0.0.1 --port 8765 --reload
```
