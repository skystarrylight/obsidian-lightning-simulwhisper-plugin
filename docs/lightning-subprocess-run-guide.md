# Lightning-SimulWhisper subprocess 브리지 실행 가이드

## 1. 목적

이 가이드는 `examples/bridge_server_fastapi_subprocess.py` 를 사용해 Obsidian 플러그인과 `Lightning-SimulWhisper` 를 실제로 연결하는 절차를 설명한다.

## 2. 사전 준비

### 2.1 엔진 저장소 준비

```bash
git clone https://github.com/altalt-org/Lightning-SimulWhisper.git
cd Lightning-SimulWhisper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

필요 시 CoreML 관련 패키지도 설치한다.

```bash
pip install coremltools ane_transformers
```

### 2.2 엔진 단독 확인

```bash
python simulstreaming_whisper.py test.mp3 \
  --language ko \
  --model_name medium \
  --model_path mlx_medium \
  --use_coreml \
  -l CRITICAL
```

여기서 먼저 전사가 되는지 확인한다.

## 3. 브리지 서버 실행

플러그인 저장소 루트에서 의존성 설치:

```bash
pip install -r examples/requirements.txt
```

환경변수 설정:

```bash
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
export LIGHTNING_MODEL_PATH_MEDIUM=mlx_medium
export LIGHTNING_USE_COREML=true
```

선택 환경변수:

```bash
export LIGHTNING_MODEL_PATH_BASE=mlx_base
export LIGHTNING_MODEL_PATH_SMALL=mlx_small
export LIGHTNING_MODEL_PATH_LARGE=mlx_large
export LIGHTNING_EXTRA_ARGS="--vac --vad_silence_ms 1000 --beams 3"
```

서버 실행:

```bash
uvicorn examples.bridge_server_fastapi_subprocess:app --host 127.0.0.1 --port 8765 --reload
```

## 4. 서버 테스트

헬스체크:

```bash
curl http://127.0.0.1:8765/health
```

전사 테스트:

```bash
curl -X POST http://127.0.0.1:8765/v1/transcriptions \
  -F "file=@/absolute/path/to/test.mp3" \
  -F "language=ko" \
  -F "model=medium"
```

## 5. Obsidian 연결

플러그인 설정:

- Server URL: `http://127.0.0.1:8765`
- Language: `ko`
- Model: `medium`

명령 순서:

1. `Check bridge server health`
2. `Transcribe audio file from vault`
3. 또는 `Transcribe linked audio in active note`

## 6. 주의사항

- 현재 subprocess 예제는 stdout 파싱 기반이다.
- upstream 출력 형식이 바뀌면 `extract_text()` 조정이 필요하다.
- `LIGHTNING_EXTRA_ARGS` 는 단순 split 처리이므로 복잡한 quoting 이 필요한 값은 피하는 편이 안전하다.
- prompt 값은 현재 메타데이터 수준으로만 전달 여부를 기록하며, upstream CLI 옵션이 명확해지면 실제 인자 전달로 확장하는 것이 좋다.

## 7. 추천 후속 작업

- stdout 대신 구조화된 결과를 내는 어댑터 추가
- segment, timestamp 파싱 지원
- 한국어 회의록 템플릿 자동 생성
- 오류 로그를 Obsidian Notice 와 함께 더 친절하게 출력
