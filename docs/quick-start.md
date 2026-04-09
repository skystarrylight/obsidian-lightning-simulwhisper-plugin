# Quick start

이 가이드는 **Lightning-SimulWhisper 설치부터 엔진 단독 실행 확인, 브리지 서버 실행, Obsidian 플러그인 연결까지** 한 번에 따라가기 위한 문서다.

## 1. Lightning-SimulWhisper 설치

### 1.1 저장소 준비

```bash
git clone https://github.com/altalt-org/Lightning-SimulWhisper.git
cd Lightning-SimulWhisper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 1.2 Apple Silicon 권장 패키지

```bash
pip install coremltools ane_transformers
```

## 2. 엔진 단독 실행 확인

먼저 브리지 서버를 붙이기 전에 엔진이 단독으로 실행되는지 확인한다.

한국어 예시:

```bash
python simulstreaming_whisper.py test.mp3 \
  --language ko \
  --model_name medium \
  --model_path mlx_medium \
  --use_coreml \
  -l CRITICAL
```

영문 예시:

```bash
python simulstreaming_whisper.py jfk.wav \
  --language en \
  --model_name base \
  --model_path mlx_base \
  --use_coreml \
  -l CRITICAL
```

여기서 전사 결과가 정상 출력되어야 다음 단계로 넘어가는 것이 좋다.

## 3. Bridge server 실행

이 저장소 루트로 이동한 뒤 실행한다.

```bash
pip install -r packages/bridge-server/requirements.txt
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
export LIGHTNING_MODEL_PATH_MEDIUM=mlx_medium
export LIGHTNING_USE_COREML=true
uvicorn packages.bridge-server.app:app --host 127.0.0.1 --port 8765 --reload
```

선택 환경변수:

```bash
export LIGHTNING_MODEL_PATH_BASE=mlx_base
export LIGHTNING_MODEL_PATH_SMALL=mlx_small
export LIGHTNING_MODEL_PATH_LARGE=mlx_large
export LIGHTNING_EXTRA_ARGS="--vac --vad_silence_ms 1000 --beams 3"
```

## 4. Bridge server 확인

### 4.1 Health check

```bash
curl http://127.0.0.1:8765/health
```

### 4.2 전사 API 테스트

```bash
curl -X POST http://127.0.0.1:8765/v1/transcriptions \
  -F "file=@/absolute/path/to/test.mp3" \
  -F "language=ko" \
  -F "model=medium"
```

## 5. Obsidian plugin 설치

아래 파일을 Vault에 복사한다.

```text
<Vault>/.obsidian/plugins/lightning-simulwhisper-template-driven/
  - main.js
  - manifest.json
  - styles.css
  - versions.json
```

복사 원본:

- `packages/obsidian-plugin/main.js`
- `packages/obsidian-plugin/manifest.json`
- `packages/obsidian-plugin/styles.css`
- `packages/obsidian-plugin/versions.json`

## 6. 템플릿 준비

샘플 템플릿 중 하나를 Vault 안으로 복사해서 사용한다.

- `templates/raw-transcription.sample.md`
- `templates/meeting-note.sample.md`
- `templates/interview-note.sample.md`

custom 모드를 쓸 경우 예를 들어 아래처럼 배치한다.

```text
Templates/custom-template.md
```

## 7. Obsidian 설정

플러그인 설정에서 아래를 맞춘다.

- Server URL: `http://127.0.0.1:8765`
- Language: `ko`
- Model: `medium`
- Template mode: `meeting`, `raw`, `interview`, `custom`
- Custom template file path: 필요 시 `Templates/custom-template.md`
- Output folder: 예 `Generated Notes`

## 8. 명령 실행

- `Check bridge server health`
- `Generate note from audio file`
- `Generate note from linked audio in active note`

## 9. 추천 점검 순서

1. Lightning-SimulWhisper 단독 실행 성공
2. 브리지 서버 `/health` 성공
3. 브리지 서버 `/v1/transcriptions` 성공
4. Obsidian 플러그인에서 health check 성공
5. 템플릿 기반 노트 생성 성공
