# packages/bridge-server

정본 브리지 서버 위치다.

## uv 기반 준비

```bash
make bridge-venv
```

## 실행

```bash
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
make bridge-run
```

## 확인

```bash
make bridge-health
```

자세한 전체 절차는 `docs/quick-start.md`를 본다.

## 엔드포인트

- `GET /health`
- `POST /v1/transcriptions`
