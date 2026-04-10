# packages/obsidian-plugin

정본 Obsidian 플러그인 위치다.

## 설치

```bash
export OBSIDIAN_VAULT=/absolute/path/to/YourVault
make plugin-install
```

수정 후 다시 반영할 때는:

```bash
make plugin-reinstall
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

- 리본의 마이크 아이콘으로 녹음을 토글할 수 있다.
- 녹음 중에는 상태바와 리본 아이콘이 활성 상태로 보인다.
- 녹음 파일은 `Recording folder` 아래에 저장된다.
- 자동 전사가 켜져 있으면 생성 노트는 `Recording note output folder`에 저장된다.
