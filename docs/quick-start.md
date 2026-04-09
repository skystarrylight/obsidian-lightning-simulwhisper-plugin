# Quick start

이 가이드는 **사전 준비**, **uv 기반 Python 가상환경**, **Lightning-SimulWhisper 설치와 단독 실행 확인**, **CoreML encoder 준비**, **bridge server 실행**, **Obsidian 플러그인 설치**까지 한 번에 따라가기 위한 문서다.

## 0. 사전 준비 가이드

아래 항목을 먼저 준비한다.

### 0.1 운영 환경

권장 환경은 다음과 같다.

- macOS
- Apple Silicon
- Obsidian Desktop 설치 완료
- 터미널 사용 가능

이 프로젝트는 로컬 STT 엔진을 직접 실행하고 Obsidian Vault에 파일을 복사하는 흐름이므로, 모바일 환경이나 브라우저만 있는 환경보다는 데스크톱 환경이 적합하다.

### 0.2 필요한 도구 확인

아래 명령으로 기본 도구가 있는지 확인한다.

```bash
python3 --version
uv --version
git --version
```

확인 포인트:

- `python3` 명령이 동작해야 한다.
- `uv` 명령이 동작해야 한다.
- `git` 명령이 동작해야 한다.

### 0.3 uv가 없다면 설치

macOS에서 예시는 아래처럼 진행할 수 있다.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

설치 후 새 터미널을 열고 다시 확인한다.

```bash
uv --version
```

### 0.4 Obsidian Vault 경로 확인

나중에 플러그인을 설치할 때 Vault 절대 경로가 필요하다.

예시:

```text
/Users/your-name/Documents/MyVault
```

이 경로는 이후 아래 환경변수에 사용한다.

```bash
export OBSIDIAN_VAULT=/absolute/path/to/YourVault
```

### 0.5 작업 디렉토리 구분

이번 절차에서는 두 개의 저장소 경로를 구분해서 사용한다.

1. `Lightning-SimulWhisper` 저장소 경로
2. 현재 Obsidian 플러그인 저장소 경로

예시:

```text
/Users/your-name/work/Lightning-SimulWhisper
/Users/your-name/work/obsidian-lightning-simulwhisper-plugin
```

Bridge server 실행 단계에서는 두 번째 저장소 루트에서 실행하고, 엔진 단독 실행 단계에서는 첫 번째 저장소 루트에서 실행한다.

## 1. Lightning-SimulWhisper 설치

### 1.1 저장소 준비

```bash
git clone https://github.com/altalt-org/Lightning-SimulWhisper.git
cd Lightning-SimulWhisper
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

여기서 하는 일은 다음과 같다.

- 저장소를 클론한다.
- `.venv` 가상환경을 만든다.
- 가상환경을 활성화한다.
- README 기준 의존성을 설치한다.

### 1.2 Apple Silicon 권장 패키지

```bash
uv pip install coremltools ane_transformers
```

이 단계는 Apple Silicon에서 CoreML 가속을 사용할 때 권장된다.

## 2. CoreML encoder 준비

공식 README 기준으로 CoreML 가속을 권장한다. CoreML encoder를 쓰려면 `whisper.cpp`를 클론하고 encoder를 생성한다.

```bash
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
./scripts/generate_coreml_encoder.sh medium
```

설명:

- `medium`은 예시 모델명이다.
- 다른 모델을 쓰려면 아래처럼 바꿀 수 있다.
  - `base`
  - `small`
  - `medium`
  - `large-v3`
  - `large-v3-turbo`

생성 후 사용할 모델 경로 이름 예시는 다음처럼 맞춘다.

- `mlx_base`
- `mlx_small`
- `mlx_medium`
- `mlx_large`

실제 사용 시에는 `--model_name`과 `--model_path`를 같은 계열로 맞추는 편이 안전하다.

## 3. 엔진 단독 실행 확인

먼저 bridge server를 붙이기 전에 엔진이 단독으로 실행되는지 확인한다.

### 3.1 한국어 예시

`Lightning-SimulWhisper` 저장소 루트에서 실행:

```bash
python simulstreaming_whisper.py test.mp3 \
  --language ko \
  --model_name medium \
  --model_path mlx_medium \
  --use_coreml \
  -l CRITICAL
```

### 3.2 CIF 모델과 beam 사용 예시

```bash
python simulstreaming_whisper.py test.mp3 \
  --language ko \
  --model_name medium \
  --model_path mlx_medium \
  --use_coreml \
  --beams 3 \
  --cif_ckpt_path cif_model/medium.npz \
  -l CRITICAL
```

### 3.3 영문 예시

```bash
python simulstreaming_whisper.py jfk.wav \
  --language en \
  --model_name base \
  --model_path mlx_base \
  --use_coreml \
  -l CRITICAL
```

확인 포인트:

- 명령이 즉시 실패하지 않아야 한다.
- stderr만 계속 쏟아지지 않아야 한다.
- 최종적으로 전사 텍스트가 출력되어야 한다.

여기서 전사 결과가 정상 출력되어야 다음 단계로 넘어가는 것이 좋다.

## 4. Bridge server 가상환경 준비

이제 현재 플러그인 저장소 루트로 이동한다.

```bash
cd /absolute/path/to/obsidian-lightning-simulwhisper-plugin
make bridge-venv
```

위 명령은 내부적으로 아래를 수행한다.

- `uv venv .venv`
- `uv pip install --python .venv/bin/python -r packages/bridge-server/requirements.txt`

## 5. Bridge server 실행

먼저 환경변수를 지정한다.

```bash
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
export LIGHTNING_MODEL_PATH_MEDIUM=mlx_medium
export LIGHTNING_USE_COREML=true
```

그 다음 실행한다.

```bash
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

정상이라면 JSON 응답이 와야 한다.

### 6.2 전사 API 테스트

```bash
curl -X POST http://127.0.0.1:8765/v1/transcriptions \
  -F "file=@/absolute/path/to/test.mp3" \
  -F "language=ko" \
  -F "model=medium"
```

확인 포인트:

- HTTP 200 응답
- `text` 필드 존재
- 필요 시 `segments` 필드 포함

## 7. Obsidian plugin 설치

Vault 경로를 지정한다.

```bash
export OBSIDIAN_VAULT=/absolute/path/to/YourVault
```

그 다음 플러그인을 설치한다.

```bash
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

Obsidian에서 Community Plugins를 새로고침하고 플러그인을 활성화한 뒤, 플러그인 설정에서 아래를 맞춘다.

- Server URL: `http://127.0.0.1:8765`
- Language: `ko`
- Model: `medium`
- Template mode: `meeting`, `raw`, `interview`, `custom`
- Custom template file path: 필요 시 `Templates/custom-template.md`
- Output folder: 예 `Generated Notes`

## 10. 명령 실행

아래 명령을 순서대로 점검한다.

- `Check bridge server health`
- `Generate note from audio file`
- `Generate note from linked audio in active note`

## 11. 추천 점검 순서

1. `uv --version` 확인
2. Lightning-SimulWhisper 설치 성공
3. CoreML encoder 준비 성공
4. 엔진 단독 실행 성공
5. `make bridge-venv` 성공
6. `make bridge-run` 성공
7. `make bridge-health` 성공
8. `make plugin-install` 성공
9. `make template-install` 성공
10. Obsidian에서 템플릿 기반 노트 생성 성공
