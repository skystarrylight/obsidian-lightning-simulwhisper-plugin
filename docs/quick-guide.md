# 빠른 시작 가이드

## 1. 플러그인 설치

아래 파일을 Obsidian Vault 경로에 복사한다.

```text
<Vault>/.obsidian/plugins/lightning-simulwhisper/
  - main.js
  - manifest.json
  - styles.css
```

Obsidian에서 Community Plugins를 새로고침한 뒤 플러그인을 활성화한다.

## 2. 브리지 서버 실행

예제 서버 의존성 설치:

```bash
pip install -r examples/requirements.txt
```

환경변수 설정:

```bash
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
```

서버 실행:

```bash
uvicorn examples.bridge_server_fastapi:app --host 127.0.0.1 --port 8765 --reload
```

## 3. 플러그인 설정

- Server URL: `http://127.0.0.1:8765`
- Language: `ko`
- Model: `medium`
- Output mode: `append-to-active-note` 또는 `create-new-note`

## 4. 동작 확인

명령 팔레트에서 아래 순서로 실행한다.

1. `Check bridge server health`
2. `Transcribe audio file from vault`

또는 현재 노트 안에 오디오 링크가 있다면:

3. `Transcribe linked audio in active note`

## 5. 현재 예제 서버 상태

현재 저장소의 예제 서버는 실제 `Lightning-SimulWhisper` 서브프로세스 호출 지점을 남겨둔 연결용 골격이다.

즉,

- `/health` 확인 가능
- 파일 업로드 확인 가능
- 플러그인과의 HTTP 연동 테스트 가능
- 실제 엔진 결과 반환은 후속 구현 필요

## 6. 다음 권장 작업

- 예제 서버의 `run_engine_stub`를 실제 subprocess 호출로 교체
- 모델별 옵션을 환경변수로 세분화
- 결과 세그먼트와 타임스탬프 저장 추가
