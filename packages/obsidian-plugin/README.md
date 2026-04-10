# packages/obsidian-plugin

정본 Obsidian 플러그인 위치다.

## 설치

```bash
export OBSIDIAN_VAULT=/absolute/path/to/YourVault
make plugin-install
```

## 전제 조건

- Lightning-SimulWhisper 설치 완료
- bridge server 실행 완료

자세한 절차는 `docs/quick-start.md`를 본다.

## 주요 설정

- Server URL
- Language
- Model
- Template mode
- Custom template file path
- Output folder
- Recording note output folder
- Recording folder
- Recording file name pattern
- Auto generate note after recording
- File name pattern

## 명령

- `Check bridge server health`
- `Generate note from audio file`
- `Generate note from linked audio in active note`
- `Start microphone recording`
- `Stop microphone recording`
- `Toggle microphone recording`

## 녹음 동작

- 녹음 시작 시 마이크 권한을 요청한다.
- 녹음 중에는 Obsidian 하단 상태바에 `Recording mm:ss` 형태로 표시된다.
- 녹음 파일은 `Recording folder` 아래에 저장된다.
- 녹음 종료 후 `Auto generate note after recording`이 켜져 있으면 자동 전사와 노트 생성이 이어진다.
- 이때 생성되는 템플릿 기반 전사 노트는 `Recording note output folder`에 저장된다.
