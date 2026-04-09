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
├─ README.md
├─ Makefile
├─ docs/
├─ packages/
│  ├─ obsidian-plugin/
│  └─ bridge-server/
├─ templates/
└─ legacy/
```

## Recommended flow

### 1. uv 기반 bridge server 준비

```bash
make bridge-venv
```

### 2. Lightning-SimulWhisper 경로 설정 후 bridge server 실행

```bash
export LIGHTNING_SIMULWHISPER_DIR=/absolute/path/to/Lightning-SimulWhisper
make bridge-run
```

### 3. Obsidian plugin 설치

```bash
export OBSIDIAN_VAULT=/absolute/path/to/YourVault
make plugin-install
```

### 4. 샘플 템플릿 복사

```bash
make template-install
```

## Canonical docs

- `docs/refactoring-plan.md`
- `docs/recommended-template-driven-architecture.md`
- `docs/quick-start.md`
- `packages/obsidian-plugin/README.md`
- `packages/bridge-server/README.md`

## Makefile targets

- `make bridge-venv`
- `make bridge-run`
- `make bridge-health`
- `make plugin-install`
- `make template-install`

## Legacy notice

초기 실험 과정에서 만들어진 root 실행 파일, `examples/`, `release/` 하위 파일은 더 이상 정본이 아니며 legacy 취급한다.

새 작업과 신규 검토는 아래 경로를 기준으로 진행한다.

- `packages/obsidian-plugin/`
- `packages/bridge-server/`
- `templates/`
