# Quick start

이 가이드는 **사전 준비**, **두 저장소 설치와 역할 분리**, **CoreML encoder 준비**, **Lightning-SimulWhisper 단독 실행 확인**, **bridge server 실행**, **Obsidian 플러그인 설치**, **마이크 녹음 후 자동 전사 노트 생성**까지 한 번에 따라가기 위한 문서다.

## 0. 사전 준비 가이드

아래 항목을 먼저 준비한다.

### 0.1 운영 환경

- macOS
- Apple Silicon
- Obsidian Desktop 설치 완료
- 터미널 사용 가능
- full Xcode 설치 권장

### 0.2 필요한 도구 확인

```bash
python3 --version
uv --version
git --version
xcode-select -p
```

### 0.3 uv가 없다면 설치

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 0.4 Obsidian Vault 경로 확인

```bash
export OBSIDIAN_VAULT=/absolute/path/to/YourVault
```

### 0.5 full Xcode 확인

CoreML encoder 생성 단계에서는 `coremlc` 도구가 필요할 수 있으므로 full Xcode 설치가 안전하다.

확인:

```bash
ls /Applications/Xcode.app
xcode-select -p
xcrun --find coremlc
```

정상이라면 `xcrun --find coremlc`에서 경로가 나와야 한다.

full Xcode 설치 후에는 필요 시 아래처럼 active developer path를 맞춘다.

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

## 1. 두 저장소의 역할

이 구성은 저장소가 두 개 필요하다.

### 1.1 Lightning-SimulWhisper

역할:
- 실제 음성 전사 엔진 실행
- 오디오 파일을 입력받아 전사 텍스트 생성
- bridge server가 내부적으로 호출하는 대상

예시 경로:

```text
/Users/your-name/work/Lightning-SimulWhisper
```

### 1.2 whisper.cpp

역할:
- CoreML encoder 생성
- `generate-coreml-model.sh`를 이용해 encoder 아티팩트 생성

예시 경로:

```text
/Users/your-name/work/whisper.cpp
```

### 1.3 Obsidian 플러그인 저장소

역할:
- bridge server 실행
- Obsidian 플러그인 설치
- 템플릿 복사
- Obsidian에서 녹음, 전사, 노트 생성 연결

예시 경로:

```text
/Users/your-name/work/obsidian-lightning-simulwhisper-plugin
```

## 2. Lightning-SimulWhisper 설치

```bash
git clone https://github.com/altalt-org/Lightning-SimulWhisper.git
cd Lightning-SimulWhisper
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
uv pip install coremltools ane_transformers
```

설명:
- 이 저장소는 전사 엔진 실행용이다.
- 이후 `bridge server`가 이 저장소를 참조한다.
- 여기서 바로 Obsidian과 연결되는 것은 아니다.

## 3. whisper.cpp 설치 및 CoreML encoder 생성

CoreML encoder 생성은 `Lightning-SimulWhisper`가 아니라 `whisper.cpp` 공식 흐름을 기준으로 준비하는 것이 안전하다.

### 3.1 whisper.cpp 설치

```bash
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
```

### 3.2 CoreML encoder 생성용 가상환경 준비

권장 Python 버전은 3.11이다.

```bash
uv python install 3.11
uv venv --python 3.11 .venv
source .venv/bin/activate
```

설명:
- CoreML encoder 생성용 가상환경과 Lightning-SimulWhisper 실행용 가상환경은 같을 필요가 없다.
- 생성 단계와 실행 단계를 분리하는 편이 관리가 쉽다.

### 3.3 CoreML encoder 생성용 패키지 설치

```bash
uv pip install ane_transformers openai-whisper coremltools
```

설명:
- 이 패키지들은 encoder 생성 단계에서 사용된다.
- 여기서 `coremltools`는 경고를 출력할 수 있으나, 실제 실패 원인은 별도 로그를 확인해야 한다.

### 3.4 CoreML encoder 생성

예시로 `medium` 모델 encoder를 생성한다.

```bash
./models/generate-coreml-model.sh medium
```

다른 모델을 쓸 경우 예시:
- `base.en`
- `base`
- `small`
- `medium`
- `large-v3`

### 3.5 생성 결과 확인

정상 생성되면 보통 아래 형태의 결과물이 생긴다.

```text
models/ggml-medium-encoder.mlmodelc
```

확인 명령:

```bash
ls models/ggml-medium-encoder.mlmodelc
```

### 3.6 생성 실패 시 점검 포인트

가장 흔한 실패 원인은 아래와 같다.

- `xcrun: unable to find utility "coremlc"`
  - full Xcode 미설치 또는 active developer path 문제 가능성 큼
- `Torch version ... has not been tested with coremltools`
  - 경고일 수 있으나, 문제 계속되면 환경 버전 재조정 고려
- `portaudio.h` 관련 에러
  - 이것은 CoreML encoder 생성 문제가 아니라 PyAudio/PortAudio 설치 문제다

## 4. CoreML encoder와 Lightning-SimulWhisper 연동

이 단계가 중요하다.

- `whisper.cpp`는 CoreML encoder를 생성한다.
- `Lightning-SimulWhisper`는 생성된 encoder를 실제 전사 실행 시 사용한다.

즉 두 저장소는 아래처럼 연계된다.

```text
whisper.cpp
  └─ CoreML encoder 생성
       └─ models/ggml-medium-encoder.mlmodelc

Lightning-SimulWhisper
  └─ 위 결과물 경로를 --coreml_encoder_path 로 참조하여 실행
```

핵심은:
- 같은 가상환경일 필요는 없다.
- 중요한 것은 `Lightning-SimulWhisper`가 생성 결과물 경로를 볼 수 있어야 한다는 점이다.

## 5. Lightning-SimulWhisper 단독 실행 확인

여기서 **단독 실행**은 **Obsidian과 아직 연결하지 않은 상태에서 전사 엔진만 따로 검증하는 단계**를 뜻한다.

즉 아래를 확인하는 목적이다.
- 전사 엔진 자체가 정상 실행되는지
- 모델 경로가 맞는지
- CoreML encoder 경로가 맞는지
- 오디오 파일 하나를 넣었을 때 텍스트가 나오는지

이 단계는 아직 다음 기능과 연결되지 않는다.
- Obsidian 플러그인
- bridge server API 호출
- 템플릿 기반 노트 생성

### 5.1 Lightning-SimulWhisper 가상환경 활성화

```bash
cd /absolute/path/to/Lightning-SimulWhisper
source .venv/bin/activate
```

### 5.2 CoreML encoder 경로를 직접 지정해서 실행

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

설명:
- `--use_coreml`은 CoreML 사용 활성화
- `--coreml_encoder_path`는 `whisper.cpp`에서 생성한 encoder 결과물 경로
- `--coreml_compute_units CPU_AND_NE`는 Apple Silicon 환경 예시

### 5.3 이 단계에서 무엇을 확인해야 하는가

- 실행이 즉시 실패하지 않는지
- CoreML encoder path 관련 에러가 없는지
- 최종적으로 전사 텍스트가 출력되는지

여기서 전사 텍스트가 정상적으로 출력되면 엔진 검증은 통과한 것이다.

## 6. 왜 단독 실행 단계를 먼저 하는가

문제를 빠르게 분리하기 위해서다.

- 단독 실행 실패
  - 엔진, 모델, CoreML encoder 문제 가능성 큼
- 단독 실행 성공, bridge server 실패
  - API 또는 bridge 문제 가능성 큼
- bridge server 성공, Obsidian 실패
  - 플러그인 또는 설정 문제 가능성 큼

따라서 Obsidian까지 한 번에 붙이기 전에 단독 실행 확인을 먼저 하는 것이 좋다.

## 7. Bridge server 준비 및 실행

이제 플러그인 저장소 루트로 이동한다.

```bash
cd /absolute/path/to/obsidian-lightning-simulwhisper-plugin
make bridge-venv
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
export LIGHTNING_MODEL_PATH_MEDIUM=mlx_medium
export LIGHTNING_USE_COREML=true
make bridge-run
```

설명:
- `LIGHTNING_SIMULWHISPER_DIR`는 전사 엔진 저장소 경로다.
- bridge server는 이 경로를 이용해 내부적으로 전사 엔진을 호출한다.
- 즉 Obsidian은 직접 전사 엔진을 호출하지 않고, bridge server를 통해 호출한다.

확인:

```bash
make bridge-health
```

## 8. Obsidian plugin 설치

```bash
make plugin-install
```

플러그인 코드를 수정한 뒤 다시 반영할 때는:

```bash
make plugin-reinstall
```

## 9. 템플릿 준비

```bash
make template-install
```

## 10. Obsidian 설정

플러그인 설정에서 아래를 맞춘다.

- Server URL: `http://127.0.0.1:8765`
- Language: `ko`
- Model: `medium`
- Template mode: `meeting`, `raw`, `interview`, `custom`
- Output folder: 기존 오디오 파일용 노트 저장 경로
- Recording folder: 마이크 녹음 파일 저장 경로
- Recording note output folder: 녹음 종료 후 자동 생성되는 전사 노트 저장 경로
- Auto generate note after recording: 켜기 권장
- 필요 시 Claude 후처리 옵션 설정

## 11. 전체 연결 구조 요약

흐름은 아래와 같다.

1. `whisper.cpp`
   - CoreML encoder 생성
2. `Lightning-SimulWhisper`
   - 실제 전사 엔진 실행
3. `bridge server`
   - 전사 엔진을 API 형태로 감싸서 제공
4. `Obsidian plugin`
   - bridge server를 호출해 전사/녹음/노트 생성 수행

즉 CoreML encoder 생성 저장소와 전사 실행 저장소는 다를 수 있고,
최종 사용자 인터페이스는 Obsidian 플러그인이다.

## 12. 녹음형 워크플로우

- 리본의 마이크 아이콘으로 녹음을 시작 또는 종료할 수 있다.
- 녹음 중에는 상태바에 `● Recording mm:ss`가 표시된다.
- 녹음 파일은 `Recording folder`에 저장된다.
- 자동 전사가 켜져 있으면 템플릿 기반 노트가 `Recording note output folder`에 저장된다.

## 13. 추천 점검 순서

1. full Xcode 및 `coremlc` 확인 성공
2. `whisper.cpp`에서 CoreML encoder 생성 성공
3. `Lightning-SimulWhisper` 단독 실행 성공
4. `make bridge-venv` 성공
5. `make bridge-run` 성공
6. `make bridge-health` 성공
7. `make plugin-install` 성공
8. `make template-install` 성공
9. 기존 오디오 파일 기반 노트 생성 성공
10. 리본 아이콘으로 녹음 시작/종료 성공
11. 녹음 후 자동 전사 노트 생성 성공
