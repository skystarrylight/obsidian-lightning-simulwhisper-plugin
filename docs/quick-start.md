# Quick start

이 가이드는 **사전 준비**, **uv 기반 Python 가상환경**, **Lightning-SimulWhisper 설치와 단독 실행 확인**, **CoreML encoder 준비**, **bridge server 실행**, **Obsidian 플러그인 설치**, **마이크 녹음 후 자동 전사 노트 생성**까지 한 번에 따라가기 위한 문서다.

## 0. 사전 준비 가이드

아래 항목을 먼저 준비한다.

### 0.1 운영 환경

- macOS
- Apple Silicon
- Obsidian Desktop 설치 완료
- 터미널 사용 가능

### 0.2 필요한 도구 확인

```bash
python3 --version
uv --version
git --version
```

### 0.3 uv가 없다면 설치

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 0.4 Obsidian Vault 경로 확인

```bash
export OBSIDIAN_VAULT=/absolute/path/to/YourVault
```

## 1. Lightning-SimulWhisper 설치

```bash
git clone https://github.com/altalt-org/Lightning-SimulWhisper.git
cd Lightning-SimulWhisper
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
uv pip install coremltools ane_transformers
```

## 2. CoreML encoder 준비

CoreML encoder 생성은 `Lightning-SimulWhisper`가 아니라 `whisper.cpp` 공식 흐름을 기준으로 준비하는 것이 안전하다.

```bash
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp

uv python install 3.11
uv venv --python 3.11 .venv
source .venv/bin/activate

uv pip install ane_transformers openai-whisper coremltools
./models/generate-coreml-model.sh medium
```

정상 생성되면 보통 아래 형태의 결과물이 생긴다.

```text
models/ggml-medium-encoder.mlmodelc
```

## 3. 엔진 단독 실행 확인

필요하면 생성한 CoreML encoder 경로를 직접 지정한다.

```bash
python simulstreaming_whisper.py test.mp3 \
  --language ko \
  --model_name medium \
  --model_path mlx_medium \
  --use_coreml \
  --coreml_encoder_path /absolute/path/to/whisper.cpp/models/ggml-medium-encoder.mlmodelc \
  --coreml_compute_units CPU_AND_NE \
  -l CRITICAL
```

## 4. Bridge server 준비 및 실행

플러그인 저장소 루트에서:

```bash
make bridge-venv
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
export LIGHTNING_MODEL_PATH_MEDIUM=mlx_medium
export LIGHTNING_USE_COREML=true
make bridge-run
```

확인:

```bash
make bridge-health
```

## 5. Obsidian plugin 설치

```bash
make plugin-install
```

플러그인 코드를 수정한 뒤 다시 반영할 때는:

```bash
make plugin-reinstall
```

## 6. 템플릿 준비

```bash
make template-install
```

## 7. Obsidian 설정

플러그인 설정에서 아래를 맞춘다.

- Server URL: `http://127.0.0.1:8765`
- Language: `ko`
- Model: `medium`
- Template mode: `meeting`, `raw`, `interview`, `custom`
- Output folder: 기존 오디오 파일용 노트 저장 경로
- Recording folder: 마이크 녹음 파일 저장 경로
- Recording note output folder: 녹음 종료 후 자동 생성되는 전사 노트 저장 경로
- Auto generate note after recording: 켜기 권장

## 8. 녹음형 워크플로우

- 리본의 마이크 아이콘으로 녹음을 시작 또는 종료할 수 있다.
- 녹음 중에는 상태바에 `● Recording mm:ss`가 표시된다.
- 녹음 파일은 `Recording folder`에 저장된다.
- 자동 전사가 켜져 있으면 템플릿 기반 노트가 `Recording note output folder`에 저장된다.

## 9. 추천 점검 순서

1. CoreML encoder 생성 성공
2. 엔진 단독 실행 성공
3. `make bridge-venv` 성공
4. `make bridge-run` 성공
5. `make bridge-health` 성공
6. `make plugin-install` 성공
7. `make template-install` 성공
8. 기존 오디오 파일 기반 노트 생성 성공
9. 리본 아이콘으로 녹음 시작/종료 성공
10. 녹음 후 자동 전사 노트 생성 성공
