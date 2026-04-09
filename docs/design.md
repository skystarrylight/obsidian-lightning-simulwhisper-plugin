# Obsidian Lightning-SimulWhisper Plugin 설계 문서

## 1. 목적

본 플러그인의 목적은 Obsidian에서 관리하는 음성 파일을 로컬 `Lightning-SimulWhisper` 기반 전사 파이프라인으로 보내고, 전사 결과를 다시 Obsidian 노트 자산으로 저장하는 것이다.

핵심 목표는 다음과 같다.

- Obsidian 내부에서 음성 파일을 쉽게 선택하거나 노트 링크를 기준으로 전사 실행
- `Lightning-SimulWhisper` 엔진과 플러그인을 직접 강결합하지 않고, 중간 브리지 HTTP 계약을 통해 연결
- 전사 결과를 현재 노트 삽입 또는 별도 Markdown 노트 생성으로 저장
- 이후 요약, 번역, 화자 분리 등 후속 기능 확장이 쉬운 구조 확보

## 2. 비목표

초기 버전에서 다음 범위는 제외한다.

- Obsidian 내부 녹음기 구현
- 플러그인 내부에서 직접 MLX/CoreML 모델 실행
- 모바일 지원
- 실시간 스트리밍 편집 UI
- 화자 분리, 요약, 번역의 내장 구현

## 3. 왜 브리지 서버 구조인가

`Lightning-SimulWhisper`는 Apple Silicon 최적화 로컬 엔진이며 실행 옵션, 모델 경로, CoreML 사용 여부 등 런타임 변수가 크다. 따라서 Obsidian 플러그인이 엔진 내부 구조를 직접 알기보다, 아래처럼 안정적인 HTTP 계약만 바라보는 것이 유지보수에 유리하다.

- 플러그인 책임
  - 파일 선택
  - 노트 링크 추출
  - 사용자 설정 관리
  - 결과 삽입과 노트 생성
- 브리지 서버 책임
  - 오디오 파일 수신
  - `Lightning-SimulWhisper` CLI 또는 서버 호출
  - JSON 결과 표준화 반환

## 4. 아키텍처

```text
Obsidian Note / Audio File
          │
          ▼
Obsidian Custom Plugin
  - commands
  - setting tab
  - vault file reader
  - result writer
          │   HTTP multipart/form-data
          ▼
Local Bridge Server
  - /health
  - /v1/transcriptions
  - engine adapter
          │
          ▼
Lightning-SimulWhisper
  - CLI mode or server mode
  - MLX / CoreML encoder
```

## 5. HTTP 계약

### 5.1 Health Check

- Method: `GET`
- Path: `/health`

응답 예시:

```json
{
  "status": "ok"
}
```

### 5.2 Transcription

- Method: `POST`
- Path: `/v1/transcriptions`
- Content-Type: `multipart/form-data`

폼 필드:

- `file`: 오디오 바이너리
- `language`: `ko`, `en`, `auto`
- `model`: 예: `base`, `medium`, `large-v3-turbo`
- `prompt`: 선택

응답 예시:

```json
{
  "text": "전사 결과 텍스트",
  "language": "ko",
  "segments": [
    {
      "start": 0.0,
      "end": 4.2,
      "text": "안녕하세요."
    }
  ],
  "metadata": {
    "engine": "lightning-simulwhisper",
    "model": "medium",
    "duration_sec": 4.2
  }
}
```

## 6. 사용자 시나리오

### 시나리오 A. Vault 오디오 파일 직접 선택

1. 사용자가 명령 팔레트에서 `Transcribe audio file from vault` 실행
2. 플러그인이 Vault 내 오디오 파일 목록 표시
3. 사용자가 파일 선택
4. 플러그인이 브리지 서버로 파일 업로드
5. 결과를 새 Markdown 노트 생성 또는 현재 노트에 삽입

### 시나리오 B. 현재 노트의 오디오 링크 전사

1. 현재 노트 본문에 `![[recordings/foo.m4a]]` 또는 `[[foo.wav]]` 존재
2. 사용자가 `Transcribe linked audio in active note` 실행
3. 플러그인이 첫 번째 오디오 링크를 찾음
4. 브리지 호출 후 결과를 본문 하단 `## Transcription` 아래 삽입

## 7. 플러그인 설정

- `serverUrl`: 기본값 `http://127.0.0.1:8765`
- `language`: 기본값 `ko`
- `model`: 기본값 `medium`
- `outputMode`: `append-to-active-note` 또는 `create-new-note`
- `outputFolder`: 기본값 `Transcriptions`
- `heading`: 기본값 `## Transcription`
- `noteTemplate`: 생성형 노트 템플릿
- `requestTimeoutMs`: 기본값 `120000`

## 8. 코드 구조

```text
root
├─ docs/
│  ├─ design.md
│  └─ quick-guide.md
├─ manifest.json
├─ package.json
├─ tsconfig.json
├─ esbuild.config.mjs
├─ versions.json
├─ styles.css
└─ main.ts
```

초기 버전에서는 파일 수를 과도하게 늘리지 않고 `main.ts` 단일 파일에 핵심 흐름을 집중한다. 이후 안정화되면 아래로 분리한다.

- `src/settings.ts`
- `src/transcription-client.ts`
- `src/audio-link-parser.ts`
- `src/output-writer.ts`

## 9. 검증 전략

### 9.1 정적 검증

- `manifest.json` 필수 필드 존재 여부 확인
- TypeScript strict mode 기준 문법 오류 제거
- Obsidian 샘플 플러그인 구조와 호환되는 빌드 스크립트 유지

### 9.2 기능 검증

- 설정 탭 저장과 재로드
- Health check 명령 성공과 실패 토스트
- Vault 오디오 파일 선택 후 multipart 업로드
- 현재 노트 오디오 링크 추출
- Append 모드와 New Note 모드 각각 결과 생성

### 9.3 통합 검증

브리지 서버 준비 후 아래를 확인한다.

1. `/health` 응답
2. 샘플 음성 파일 전사 성공
3. 한글 UTF-8 결과가 Obsidian 노트에 정상 저장
4. 서버 중단 시 오류 메시지 명확성

## 10. 향후 확장

- 여러 오디오 링크 일괄 전사
- 세그먼트 타임스탬프 삽입
- 요약과 번역 후처리 체인
- 회의록 템플릿 자동 생성
- 브리지 서버 자동 기동 스크립트 연계
