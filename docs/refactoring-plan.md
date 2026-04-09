# 리팩토링 기준안

## 권장 구조

```text
root
├─ docs/
├─ packages/
│  ├─ obsidian-plugin/
│  └─ bridge-server/
├─ templates/
└─ legacy/
```

## 원칙

- STT 요청 로직은 하나의 공통 파이프라인으로 유지한다.
- 문서 출력 전략은 템플릿으로 처리한다.
- Obsidian 플러그인은 템플릿 모드와 커스텀 템플릿 파일 경로를 지원한다.
- 브리지 서버는 canonical subprocess 예제 하나를 기준으로 유지한다.
- 기존 root, release, examples 하위 산출물은 legacy 취급한다.

## packages/obsidian-plugin 역할

- health check
- 오디오 파일 선택
- active note 링크 추출
- bridge 호출
- template context 생성
- template 렌더링
- 새 노트 생성

## packages/bridge-server 역할

- /health
- /v1/transcriptions
- Lightning-SimulWhisper subprocess 호출
- stdout / json 결과 정규화

## templates 역할

- raw transcription
- meeting note
- interview note
- custom template 시작점
