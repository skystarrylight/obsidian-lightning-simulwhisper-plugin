# Quick start

이 가이드는 **uv 기반 Python 가상환경**, **Lightning-SimulWhisper 설치와 단독 실행 확인**, **bridge server 실행**, **Obsidian 플러그인 설치**까지 한 번에 따라가기 위한 문서다.

## 1. 사전 준비

필수 도구:

- `uv`
- `python3`
- Obsidian Desktop
- macOS Apple Silicon 권장

## 2. Lightning-SimulWhisper 설치

### 2.1 저장소 준비

```bash
git clone https://github.com/altalt-org/Lightning-SimulWhisper.git
cd Lightning-SimulWhisper
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

### 2.2 Apple Silicon 권장 패키지

```bash
uv pip install coremltools ane_transformers
```

## 3. 엔진 단독 실행 확인

먼저 bridge server를 붙이기 전에 엔진이 단독으로 실행되는지 확인한다.

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

## 4. Bridge server 가상환경 준비

이 저장소 루트에서 실행한다.

```bash
make bridge-venv
```

위 명령은 내부적으로 아래를 수행한다.

- `uv venv .venv`
- `uv pip install --python .venv/bin/python -r packages/bridge-server/requirements.txt`

## 5. Bridge server 실행

```bash
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
export LIGHTNING_MODEL_PATH_MEDIUM=mlx_medium
export LIGHTNING_USE_COREML=true
make bridge-run
```

선택 환경변수:

```bash
export LIGHTNING_MODEL_PATH_BASE=mlx_base
export LIGHTNING_MODEL_PATH_SMALL=mlx_small
export LIGHTNING_MODEL_PATH_LARGE=mlx_large
export LIGHTNING_EXTRA_ARGS="--vac --vad_silence_ms 1000 --beams 3"
```

## 6. Bridge server 확인

### 6.1 Health check

```bash
make bridge-health
```

또는 직접 호출:

```bash
curl http://127.0.0.1:8765/health
```

### 6.2 전사 API 테스트

```bash
curl -X POST http://127.0.0.1:8765/v1/transcriptions \
  -F "file=@/absolute/path/to/test.mp3" \
  -F "language=ko" \
  -F "model=medium"
```

## 7. Obsidian plugin 설치

```bash
export OBSIDIAN_VAULT=/absolute/path/to/YourVault
make plugin-install
```

이 명령은 아래 파일을 복사한다.

- `packages/obsidian-plugin/main.js`
- `packages/obsidian-plugin/manifest.json`
- `packages/obsidian-plugin/styles.css`
- `packages/obsidian-plugin/versions.json`

복사 대상:

```text
<Vault>/.obsidian/plugins/lightning-simulwhisper-template-driven/
```

## 8. 템플릿 준비

```bash
make template-install
```

이 명령은 아래 샘플 템플릿을 Vault의 `Templates/` 경로로 복사한다.

- `templates/raw-transcription.sample.md`
- `templates/meeting-note.sample.md`
- `templates/interview-note.sample.md`

custom 모드를 쓸 경우 예를 들어 아래처럼 배치한다.

```text
Templates/custom-template.md
```

## 9. Obsidian 설정

플러그인 설정에서 아래를 맞춘다.

- Server URL: `http://127.0.0.1:8765`
- Language: `ko`
- Model: `medium`
- Template mode: `meeting`, `raw`, `interview`, `custom`
- Custom template file path: 필요 시 `Templates/custom-template.md`
- Output folder: 예 `Generated Notes`

## 10. 명령 실행

- `Check bridge server health`
- `Generate note from audio file`
- `Generate note from linked audio in active note`

## 11. 추천 점검 순서

1. Lightning-SimulWhisper 단독 실행 성공
2. `make bridge-venv` 성공
3. `make bridge-run` 성공
4. `make bridge-health` 성공
5. Obsidian에서 `make plugin-install` 결과 로드 성공
6. `make template-install` 후 템플릿 확인
7. 템플릿 기반 노트 생성 성공
