# Obsidian Lightning-SimulWhisper Plugin

이 저장소의 정본 구조는 **template-driven 단일 Obsidian 플러그인 + canonical bridge server + templates** 기준이다.

## Start here

처음 시작할 때는 아래 세 경로만 보면 된다.

- `packages/obsidian-plugin/`
- `packages/bridge-server/`
- `templates/`

## Canonical structure

```text
root
├─ docs/
├─ packages/
│  ├─ obsidian-plugin/
│  └─ bridge-server/
├─ templates/
└─ legacy/
```

## Recommended flow

### 1. Bridge server 준비

```bash
pip install -r packages/bridge-server/requirements.txt
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
uvicorn packages.bridge-server.app:app --host 127.0.0.1 --port 8765 --reload
```

### 2. Obsidian plugin 설치

아래 파일을 Vault에 복사한다.

```text
<Vault>/.obsidian/plugins/lightning-simulwhisper-template-driven/
  - main.js
  - manifest.json
  - styles.css
  - versions.json
```

복사 원본 경로:

```text
packages/obsidian-plugin/
```

### 3. Template 선택

샘플 템플릿:

- `templates/raw-transcription.sample.md`
- `templates/meeting-note.sample.md`
- `templates/interview-note.sample.md`

플러그인 설정에서 `templateMode`를 `meeting`, `raw`, `interview`, `custom` 중 하나로 선택한다.

## Canonical docs

- `docs/refactoring-plan.md`
- `docs/recommended-template-driven-architecture.md`
- `docs/quick-start.md`
- `packages/obsidian-plugin/README.md`
- `packages/bridge-server/README.md`

## Legacy notice

초기 실험 과정에서 만들어진 root 실행 파일, `examples/`, `release/` 하위 파일은 더 이상 정본이 아니며 legacy 취급한다.

새 작업과 신규 검토는 아래 경로를 기준으로 진행한다.

- `packages/obsidian-plugin/`
- `packages/bridge-server/`
- `templates/`
