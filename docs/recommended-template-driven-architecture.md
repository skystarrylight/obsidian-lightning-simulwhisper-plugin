# 권장 구조: Template-Driven 단일 플러그인

## 1. 핵심 방향

Obsidian 플러그인의 목적은 단순 STT 자체가 아니라, STT 결과를 문서로 생성하는 것이다. 따라서 `기본 전사 플러그인` 과 `회의록 특화 플러그인` 을 나누기보다, 하나의 전사 파이프라인 위에 여러 템플릿 출력 전략을 올리는 구조가 더 적절하다.

즉 구조는 아래처럼 본다.

```text
Audio Input
  -> Common Transcription Pipeline
  -> Template Context Builder
  -> Template Renderer
  -> Markdown Note Output
```

## 2. 권장 디렉토리 구조

```text
root
├─ docs/
│  ├─ design.md
│  ├─ bridge-server-guide.md
│  ├─ lightning-subprocess-run-guide.md
│  └─ recommended-template-driven-architecture.md
├─ examples/
│  ├─ bridge_server_fastapi.py
│  ├─ bridge_server_fastapi_subprocess.py
│  ├─ bridge_server_fastapi_subprocess_v2.py
│  ├─ requirements.txt
│  └─ README.md
├─ release/
│  └─ template-driven-unified/
│     ├─ manifest.json
│     ├─ main.js
│     ├─ styles.css
│     ├─ versions.json
│     ├─ README.md
│     └─ templates/
│        ├─ raw-transcription.sample.md
│        ├─ meeting-note.sample.md
│        └─ interview-note.sample.md
├─ README.md
└─ package.json
```

## 3. 왜 이 구조가 좋은가

### 3.1 공통 STT 로직 재사용

- health check
- 오디오 파일 선택
- active note 링크 추출
- bridge server 호출
- 응답 검증

위 흐름은 모든 문서 출력 전략에서 공통이다.

### 3.2 차이는 템플릿에서만 발생

실제 사용자가 원하는 것은 다음과 같다.

- 원문 전사 저장
- 회의록 생성
- 인터뷰 정리
- 강의 노트 정리
- 사용자 정의 템플릿 기반 문서 생성

이 차이는 전사 방식이 아니라 문서 렌더링 방식의 차이이다.

### 3.3 유지보수성 향상

플러그인이 하나로 합쳐지면 다음이 쉬워진다.

- STT 요청부 수정 시 한 군데만 변경
- 설정 UI 중복 제거
- 템플릿 추가만으로 문서 전략 확장
- release 번들 하나로 사용 가능

## 4. 권장 설정 모델

```text
serverUrl
language
model
prompt
requestTimeoutMs
outputFolder
templateMode
customTemplateFilePath
fileNamePattern
fallbackRawHeading
openCreatedNote
```

### templateMode 예시

- `raw`
- `meeting`
- `interview`
- `custom`

## 5. 템플릿 컨텍스트

모든 템플릿은 아래 공통 컨텍스트를 사용할 수 있게 설계한다.

- `{{title}}`
- `{{date}}`
- `{{audio_name}}`
- `{{audio_path}}`
- `{{language}}`
- `{{model}}`
- `{{transcription}}`
- `{{raw_heading}}`

추후 확장 가능 컨텍스트:

- `{{summary}}`
- `{{action_items}}`
- `{{segments_json}}`

## 6. 코드 구조 권장안

하나의 `main.js` 안에 유지하더라도 내부 함수는 아래 역할로 분리하는 것이 좋다.

- `getAudioFiles()`
- `findAudioFileFromActiveNote()`
- `checkHealth()`
- `requestTranscription()`
- `buildTemplateContext()`
- `resolveTemplateContent()`
- `renderTemplate()`
- `createOutputNote()`

## 7. 결론

권장안은 `기본 전사` 와 `회의록 특화` 를 따로 유지하는 것이 아니라, `template-driven-unified` 번들 하나로 통합하고, 템플릿 모드로 출력 전략을 나누는 방식이다.
