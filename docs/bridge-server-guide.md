# 브리지 서버 및 Lightning-SimulWhisper 연결 가이드

## 1. 개요

이 플러그인은 `Lightning-SimulWhisper`를 직접 내장하지 않고, 로컬 브리지 서버를 통해 연결한다.

구성은 아래와 같다.

```text
Obsidian Plugin
  -> GET  /health
  -> POST /v1/transcriptions

Local Bridge Server
  -> subprocess 로 Lightning-SimulWhisper 실행
  -> 결과를 JSON 으로 정규화
```

## 2. 권장 환경

- macOS
- Apple Silicon
- Python 3.10+
- Obsidian Desktop

## 3. Lightning-SimulWhisper 설치

### 3.1 저장소 준비

```bash
git clone https://github.com/altalt-org/Lightning-SimulWhisper.git
cd Lightning-SimulWhisper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3.2 CoreML 권장 설치

```bash
pip install coremltools ane_transformers
```

### 3.3 엔진 단독 실행 확인

영문 샘플 예시:

```bash
python3 simulstreaming_whisper.py jfk.wav \
  --model_name base \
  --model_path mlx_base \
  --use_coreml \
  --language en \
  --log-level CRITICAL
```

한국어 예시:

```bash
python simulstreaming_whisper.py test.mp3 \
  --language ko \
  --vac \
  --vad_silence_ms 1000 \
  --beams 3 \
  -l CRITICAL \
  --cif_ckpt_path cif_model/medium.npz \
  --model_name medium \
  --model_path mlx_medium \
  --use_coreml
```

먼저 위처럼 엔진 단독 실행이 되는지 확인한 뒤 브리지 서버를 붙이는 것이 좋다.

## 4. 브리지 서버 예제 사용

이 저장소에는 `examples/bridge_server_fastapi.py` 예제가 포함되어 있다.

필요 패키지:

```bash
pip install fastapi uvicorn python-multipart
```

실행:

```bash
uvicorn examples.bridge_server_fastapi:app --host 127.0.0.1 --port 8765 --reload
```

헬스체크:

```bash
curl http://127.0.0.1:8765/health
```

예상 응답:

```json
{"status":"ok"}
```

## 5. 플러그인과 연결

Obsidian 플러그인 설정에서 아래처럼 맞춘다.

- Server URL: `http://127.0.0.1:8765`
- Language: `ko` 또는 `auto`
- Model: `medium`
- Output mode: 원하는 방식 선택

그 다음 명령 팔레트에서 아래 순서로 테스트한다.

1. `Check bridge server health`
2. `Transcribe audio file from vault`
3. 또는 `Transcribe linked audio in active note`

## 6. 테스트 순서

### 6.1 브리지 서버만 테스트

```bash
curl -X POST http://127.0.0.1:8765/v1/transcriptions \
  -F "file=@/absolute/path/to/test.mp3" \
  -F "language=ko" \
  -F "model=medium"
```

정상 응답 예시:

```json
{
  "text": "전사 결과",
  "language": "ko",
  "segments": [],
  "metadata": {
    "engine": "lightning-simulwhisper",
    "model": "medium"
  }
}
```

### 6.2 Obsidian 연결 테스트

- 테스트 오디오 파일을 Vault에 넣는다.
- 플러그인을 로드한다.
- `Check bridge server health` 명령으로 연결을 확인한다.
- `Transcribe audio file from vault` 명령으로 전사를 실행한다.
- 결과가 현재 노트 append 또는 새 노트 생성되는지 확인한다.

## 7. 트러블슈팅

### 7.1 health check 실패

- 브리지 서버가 실제로 8765 포트에서 실행 중인지 확인
- 방화벽 또는 localhost 바인딩 여부 확인
- 플러그인 설정의 Server URL 오타 확인

### 7.2 전사 요청 실패

- 브리지 서버 로그 확인
- `LIGHTNING_SIMULWHISPER_DIR` 환경변수가 올바른지 확인
- 모델 경로와 이름이 실제 엔진 환경과 맞는지 확인
- 오디오 포맷이 지원 범위인지 확인

### 7.3 Obsidian에 결과가 안 써짐

- Append 모드일 때 활성 노트가 열려 있는지 확인
- New note 모드일 때 Output folder 경로가 유효한지 확인
- 콘솔 오류 로그 확인

## 8. 다음 권장 작업

- 브리지 서버에서 CLI 옵션을 더 세분화
- 세그먼트 타임스탬프 저장 지원
- 요약/번역 후처리 체인 추가
- 회의록 템플릿 자동 생성 추가
