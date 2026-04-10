# Quick start

이 가이드는 **사전 준비**, **uv 기반 Python 가상환경**, **Lightning-SimulWhisper 설치와 단독 실행 확인**, **CoreML encoder 준비**, **bridge server 실행**, **Obsidian 플러그인 설치**, **마이크 녹음 후 자동 전사 노트 생성**까지 한 번에 따라가기 위한 문서다.

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

### 0.3 uv가 없다면 설치

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 0.4 Obsidian Vault 경로 확인

```bash
export OBSIDIAN_VAULT=/absolute/path/to/YourVault
```

### 0.5 작업 디렉토리 구분

1. `Lightning-SimulWhisper` 저장소 경로
2. 현재 Obsidian 플러그인 저장소 경로

## 1. Lightning-SimulWhisper 설치

```bash
git clone https://github.com/altalt-org/Lightning-SimulWhisper.git
cd Lightning-SimulWhisper
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

Apple Silicon 권장 패키지:

```bash
uv pip install coremltools ane_transformers
```

## 2. CoreML encoder 준비

```bash
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
./scripts/generate_coreml_encoder.sh medium
```

## 3. 엔진 단독 실행 확인

```bash
python simulstreaming_whisper.py test.mp3 \
  --language ko \
  --model_name medium \
  --model_path mlx_medium \
  --use_coreml \
  -l CRITICAL
```

전사 결과가 정상 출력되어야 다음 단계로 넘어간다.

## 4. Bridge server 가상환경 준비

플러그인 저장소 루트에서 실행한다.

```bash
cd /absolute/path/to/obsidian-lightning-simulwhisper-plugin
make bridge-venv
```

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

```bash
make bridge-health
```

또는:

```bash
curl http://127.0.0.1:8765/health
```

전사 API 테스트:

```bash
curl -X POST http://127.0.0.1:8765/v1/transcriptions \
  -F "file=@/absolute/path/to/test.mp3" \
  -F "language=ko" \
  -F "model=medium"
```

## 7. Obsidian plugin 설치

```bash
make plugin-install
```

## 8. 템플릿 준비

```bash
make template-install
```

## 9. Obsidian 설정

플러그인 설정에서 아래를 맞춘다.

- Server URL: `http://127.0.0.1:8765`
- Language: `ko`
- Model: `medium`
- Template mode: `meeting`, `raw`, `interview`, `custom`
- Custom template file path: 필요 시 `Templates/custom-template.md`
- Output folder: 기존 오디오 파일용 노트 저장 경로
- Recording folder: 마이크 녹음 파일 저장 경로
- Recording note output folder: 녹음 종료 후 자동 생성되는 전사 노트 저장 경로
- Auto generate note after recording: 켜기 권장

## 10. 명령 실행

- `Check bridge server health`
- `Generate note from audio file`
- `Generate note from linked audio in active note`
- `Start microphone recording`
- `Stop microphone recording`
- `Toggle microphone recording`

## 11. 녹음형 워크플로우

1. `Start microphone recording` 실행
2. 마이크 권한 허용
3. Obsidian 하단 상태바에 `Recording mm:ss` 표시 확인
4. 녹음 종료 시 `Stop microphone recording` 실행
5. 녹음 파일이 `Recording folder`에 저장됨
6. 자동 전사가 켜져 있으면 템플릿 기반 노트가 `Recording note output folder`에 저장됨

## 12. 추천 점검 순서

1. `uv --version` 확인
2. Lightning-SimulWhisper 설치 성공
3. CoreML encoder 준비 성공
4. 엔진 단독 실행 성공
5. `make bridge-venv` 성공
6. `make bridge-run` 성공
7. `make bridge-health` 성공
8. `make plugin-install` 성공
9. `make template-install` 성공
10. 기존 오디오 파일 기반 노트 생성 성공
11. 마이크 녹음 후 자동 전사 노트 생성 성공
