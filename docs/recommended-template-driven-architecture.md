# 권장 구조: Template-Driven 단일 플러그인

## 핵심 방향

Obsidian 플러그인의 목적은 단순 STT 자체가 아니라, STT 결과를 문서로 생성하는 것이다. 따라서 `기본 전사 플러그인`과 `회의록 특화 플러그인`을 나누기보다, 하나의 전사 파이프라인 위에 여러 템플릿 출력 전략을 올리는 구조가 더 적절하다.

```text
Audio Input
  -> Common Transcription Pipeline
  -> Template Context Builder
  -> Template Renderer
  -> Markdown Note Output
```

## 권장 디렉토리 구조

```text
root
├─ docs/
├─ packages/
│  ├─ obsidian-plugin/
│  └─ bridge-server/
├─ templates/
└─ legacy/
```

## 권장 설정 모델

- `serverUrl`
- `language`
- `model`
- `prompt`
- `requestTimeoutMs`
- `outputFolder`
- `templateMode`
- `customTemplateFilePath`
- `fileNamePattern`
- `fallbackRawHeading`
- `openCreatedNote`

## templateMode 예시

- `raw`
- `meeting`
- `interview`
- `custom`
