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
- File name pattern

## 명령

- `Check bridge server health`
- `Generate note from audio file`
- `Generate note from linked audio in active note`
