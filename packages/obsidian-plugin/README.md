# packages/obsidian-plugin

정본 Obsidian 플러그인 위치다.

## 개념

- 전사는 하나의 공통 파이프라인으로 처리
- 문서 전략은 템플릿 모드로 처리
- built-in template: `meeting`, `raw`, `interview`
- custom template file path 지원

## 설치

아래 파일을 Vault에 복사한다.

```text
<Vault>/.obsidian/plugins/lightning-simulwhisper-template-driven/
  - main.js
  - manifest.json
  - styles.css
  - versions.json
```

## 주요 설정

- Server URL
- Language
- Model
- Template mode
- Custom template file path
- Output folder
- File name pattern

## 명령

- `Check bridge server health`
- `Generate note from audio file`
- `Generate note from linked audio in active note`
