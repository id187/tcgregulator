# TCG REGULATOR

플레이: [https://id187.github.io/tcgregulator/](https://id187.github.io/tcgregulator/)

DAY 1부터 DAY 500까지 카드 발매와 금제를 운영하는 로컬 싱글플레이 TCG 메타 시뮬레이터입니다.

## 현재 구현 범위

- 전체 테마 150개, 시작 활성 테마 5개, 시작 활성 유저 10,000명
- 테마마다 14장의 카드가 준비되며 최초 5장, 지원마다 3장씩 실제 카드풀에 추가(최대 3회)
- DAY 1~31 사건형 인수인계(DAY 15 금제·16 시세 반응·22 사업·23 재무·30 발매·31 반응을 직접 수행하며 안내만 즉시 생략 가능)
- 1일 단위 결정론적 메타 시뮬레이션
- 30일마다 신테마·지원·범용 카드 발매 시안을 제시
- 시안에서 세 종류를 각각 1장 이상 포함해 4장을 직접 선택하고, 각 시안을 7단계(-3~+3)로 파워 조정
- 30일마다 지원 제안 1회, 다음 시안에 제안한 구테마 지원 보장
- DAY 15부터 60일마다 금제위원회 개최(DAY 435 최종 금제·DAY 450 최종 발매 후 DAY 500 결산)
- DAY 47부터 `월 1.45억 + 활성 유저당 2,500원`을 30일로 나눈 운영비가 매일 정산
- 시즌 전면 개편·해외판 동시 론칭·대표 세트 초판 증산 중 임기 1회만 선택하는 고위험 성장 프로젝트
- 프로젝트 집행 당시 환경·신뢰·최근 발매·금제 품질을 고정해 성공 확률과 성공·실패 커뮤니티 반응을 판정
- 파츠별 허용 매수 0~3장 조정
- 하루 20개씩 생성되는 날짜별 커뮤니티 게시글
- 테마 체급·지원 강도·구카드 교체율·금제 기간·해제 후 실제 성적을 교차한 상황별 반응
- 발매·금제 효과는 공표 다음 날부터 반영되고, 금제 후 3일간 관련 여론이 집중됨
- 점유율·승률·불쾌도·피로도·유저층·매출 변화
- 최종 운영자금과 환경 안정률을 교차한 9개 엔딩
- 최고 엔딩은 자금·환경과 장기 운영 기록을 함께 반영하며, 부족했던 방향은 결산 화면에서 다음 임기 힌트로 제공
- 검은 연꽃 운영 AI `L.O.T.U.S.`의 탭별 상황 안내
- WebView2 고정 로컬 주소의 `localStorage` 저장

## 개발 실행

Node.js `>=22.13.0`이 필요합니다.

```bash
npm install
npm run dev
```

Vite가 표시하는 로컬 주소에서 개발 화면을 확인합니다.

## 검증

```bash
npm run lint
npm test
```

`npm test`는 정적 프로덕션 빌드와 엔진·저장 스키마·일일 커뮤니티 테스트를 실행합니다.

## Windows 빌드

DEV 폴더에서 다음 스크립트를 실행하면 `web/dist`를 갱신하고 DEV 바로 아래의 로컬 실행용 EXE를 다시 만듭니다.

```powershell
.\build-windows.ps1
```

실행 시 Node.js나 로컬 서버는 필요하지 않습니다. DEV의 `TCG REGULATOR.exe`가 `web/dist`의 정적 파일을 WebView2로 직접 엽니다. 실행 PC에는 .NET 9 Desktop Runtime과 Microsoft Edge WebView2 Runtime이 필요합니다. 이 빌드는 형제 `TCG REGULATOR-GIT` 폴더를 읽거나 수정하지 않습니다.

## GitHub Pages 준비

형제 `TCG REGULATOR-GIT`은 EXE 배포 폴더가 아니라 별도의 웹게임 저장소 준비본입니다.

```powershell
.\sync-web-git.ps1 -Apply
```

이 명령은 웹 원본과 GitHub Actions 워크플로만 복사하며 `.git`, `node_modules`, `dist`, EXE는 복사하지 않습니다. 저장소와 원격 주소는 자동으로 만들지 않습니다.

## itch.io HTML5 업로드

```bash
npm run build
```

`dist` 폴더 자체가 아니라 그 안의 `index.html`과 `assets`가 ZIP 최상위에 오도록 압축해 업로드합니다. itch.io 프로젝트는 `HTML Game`으로 만들고 다음 설정을 권장합니다.

- 실행 방식: `Click to launch in fullscreen`
- Fullscreen Button: 켜기
- Scrollbars: 끄기
- Mobile Friendly: 실제 모바일 터치 QA 뒤에만 켜기

게임 화면은 iframe과 전체 화면의 가변 뷰포트에 맞춰집니다. 고정 임베드를 쓸 때도 별도 페이지 스크롤 대신 각 게임 패널 내부에서 스크롤되도록 구성되어 있습니다.

## 구조

- `app/game/content.ts`: 150개 테마와 2,100개 준비 파츠
- `app/game/engine.ts`: 순수 reducer 기반 일일 시뮬레이션
- `app/game/types.ts`: 직렬화 가능한 상태와 명령 타입
- `app/page.tsx`: 분포·테마·금제·발매·커뮤니티·재무 UI
- `tests/`: 엔진·저장·커뮤니티 검증
