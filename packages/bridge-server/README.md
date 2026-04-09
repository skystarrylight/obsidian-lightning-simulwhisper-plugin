# packages/bridge-server

정본 브리지 서버 위치다.

## 실행 순서

1. Lightning-SimulWhisper 설치
2. 엔진 단독 실행 확인
3. 아래 명령으로 bridge server 실행

```bash
pip install -r packages/bridge-server/requirements.txt
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
uvicorn packages.bridge-server.app:app --host 127.0.0.1 --port 8765 --reload
```

## 엔드포인트

- `GET /health`
- `POST /v1/transcriptions`

자세한 전체 절차는 `docs/quick-start.md`를 본다.
