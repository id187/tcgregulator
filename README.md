# TCG REGULATOR Web

플레이: [https://id187.github.io/tcgregulator/](https://id187.github.io/tcgregulator/)

TCG REGULATOR의 공개 웹게임 배포 저장소 준비본입니다. 원본은 `TCG REGULATOR-DEV`에서 관리하며, `sync-web-git.ps1 -Apply`로 이 폴더를 갱신합니다.

`main` 브랜치에 푸시하면 GitHub Actions가 잠금된 Node 의존성을 설치하고 타입 검사·린트·테스트를 통과한 정적 Vite 빌드를 GitHub Pages에 배포합니다. 별도의 서버나 EXE는 포함하지 않습니다.

## 저장소를 만든 뒤

1. 이 폴더에서 Git 저장소를 초기화하거나 새 GitHub 저장소를 연결합니다.
2. 기본 브랜치를 `main`으로 둡니다.
3. GitHub 저장소의 **Settings → Pages → Source**를 **GitHub Actions**로 설정합니다.
4. 변경 사항을 `main`에 푸시합니다. 

## 구성

```text
.github/workflows/pages.yml   GitHub Pages 자동 빌드·배포
web/                          React/Vite 게임 원본과 테스트
```

게임 저장은 각 브라우저의 `localStorage`를 사용합니다.
