# 소개글 및 사용자 문서 구성안

이번 문서는 최종 홍보문이 아니라, 향후 글 작성에 사용할 목차와 검증 근거다.

## 1. 일반 사용자용 짧은 소개

### 구성

1. 한 문장 가치 제안
2. 브라우저에서 파일을 선택하는 방식
3. Timeline 기반 Trim/구간 제거
4. 로컬 브라우저 처리와 결과 다운로드
5. 지원 언어와 테마
6. 사용 전 제한사항

### 사용할 수 있는 근거

- `/t/app`의 Source Video, Timeline, Process, Output Results UI
- `app.js`의 Object URL·Blob 처리
- `ffmpeg.js`의 FFmpeg WASM 실행 흐름
- `i18n.js`, `theme.js`

## 2. 커뮤니티 게시글

### 구성

1. 어떤 문제를 해결하는 도구인지
2. 실제 사용 흐름의 짧은 예시
3. Trim, Remove Segments, Crop/Scale, Audio Extract, Frame Capture
4. Undo/Redo, 단축키, Loop Playback
5. 브라우저/메모리/코덱 제한
6. 자동 테스트와 수동 검증의 구분

기술적 장점은 “설치 없이 브라우저에서 시작할 수 있음”으로 표현할 수 있으나, 모든 환경에서 설치가 전혀 필요 없다고 단정하지 않는다.

## 3. 프로젝트 홈페이지 소개

### 구성

1. 서비스 제목과 meta description
2. 핵심 기능 카드
3. Timeline 작업 흐름
4. 브라우저 로컬 처리 구조
5. 언어·테마·접근성
6. 시작 버튼 `/t/app`
7. 지원 범위와 주의사항

Canonical과 Sitemap은 현재 `/t/app`을 공개 진입점으로 가리킨다.

## 4. GitHub README 소개

### 구성

1. 프로젝트 목적
2. 기술 스택
3. 로컬 실행 방법
4. 디렉터리 구조
5. API 목록
6. 브라우저 처리 구조
7. 설정과 SQLite Preset
8. 테스트 명령
9. 보안 및 배포 주의사항

README의 기존 실행 방식과 설정 설명을 우선 기준으로 삼고, 이 분석 문서와 충돌하면 실제 소스를 다시 확인한다.

## 5. 상세 사용자 설명서

### 구성

1. 접속과 파일 선택
2. Source Video 정보 읽기
3. Timeline Seek/Zoom/Playhead
4. Trim
5. Remove Segments
6. Loop Playback
7. Crop/Scale
8. Audio/Output/Bitrate
9. Frame Capture
10. Preset과 Undo/Redo
11. Validate/Run/Cancel/Clear
12. 결과 미리보기와 다운로드
13. 오류와 지원 범위
14. 개인정보 및 파일 처리 안내

각 절차에는 실제 UI 명칭과 밀리초·픽셀·kbps 단위를 그대로 사용한다.

## 6. 기술 소개 문서

### 구성

1. FastAPI와 정적 자산 구조
2. Recipe 검증과 Plan 생성
3. FFmpeg WebAssembly Worker
4. 브라우저 파일·Blob·Object URL 수명주기
5. SQLite Preset 저장
6. CSP, CORS, COOP/CORP
7. 테스트 계층
8. 운영 배포와 Nginx 경계
9. 알려진 브라우저 의존성

## 검증된 핵심 문장 후보

아래 문장은 현재 코드로 뒷받침할 수 있는 범위에서만 사용할 수 있다.

- “Video Editor는 브라우저에서 영상 편집 Recipe를 구성하고 FFmpeg WebAssembly로 결과를 생성합니다.”
- “Timeline에서 재생 위치를 확인하고 Trim 및 제거 구간을 조정할 수 있습니다.”
- “Recipe 검증과 FFmpeg 실행 계획 생성은 FastAPI API가 담당합니다.”
- “현재 프런트엔드 코드에는 원본 영상을 서버로 업로드하는 처리 경로가 확인되지 않습니다.”
- “결과는 브라우저 Blob으로 미리보고 다운로드할 수 있습니다.”
- “한국어·영어 전환, Light·Dark 테마, Undo/Redo와 키보드 단축키가 구현되어 있습니다.”

## 홍보 문구로 사용하기 전에 확인할 사항

- 모든 브라우저와 모든 입력 형식 지원
- 모든 출력 컨테이너의 브라우저 재생 보장
- 대용량·장시간 영상의 안정적 처리
- 처리 속도나 품질의 정량 보장
- 서버·네트워크·브라우저 확장을 포함한 절대적 개인정보 보호
- 새로고침 후 편집 상태 영속성
