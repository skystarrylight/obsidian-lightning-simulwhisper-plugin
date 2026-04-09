# packages/bridge-server

정본 브리지 서버 위치다.

## 실행

```bash
pip install -r packages/bridge-server/requirements.txt
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
uvicorn packages.bridge-server.app:app --host 127.0.0.1 --port 8765 --reload
```

## 엔드포인트

- `GET /health`
- `POST /v1/transcriptions`

## 목적

- Obsidian 플러그인이 호출하는 canonical bridge
- Lightning-SimulWhisper subprocess 실행
- stdout/json 결과 정규화
