# Video Editor 프로젝트 개요 분석

## 분석 범위

이 문서는 `/t/app` 화면과 현재 소스코드를 기준으로 작성한 구현 분석이다. README의 설명은 소스와 테스트로 대조했으며, 브라우저에서 직접 실행하지 않은 항목은 별도로 표시했다.

## 프로젝트 목적

Video Editor는 브라우저에서 로컬 영상 파일을 선택하고, 타임라인과 편집 입력을 사용해 편집 Recipe를 구성한 뒤 FFmpeg WebAssembly로 결과를 생성하는 웹 애플리케이션이다. FastAPI 서버는 브라우저에 페이지와 정적 리소스를 제공하고, Recipe 검증 및 FFmpeg 실행 계획을 반환한다.

확인 근거:

- `app/web/templates/editor.html`
- `app/web/static/js/app/app.js`
- `app/web/static/js/app/ffmpeg.js`
- `app/api/video.py`
- `app/api/plan.py`
- `README.md`

## 기술 구성

| 영역 | 확인된 구성 |
|---|---|
| 백엔드 | Python 3.11 이상, FastAPI, Uvicorn |
| 데이터 모델 | Pydantic Recipe/Plan 모델 |
| 저장소 | SQLAlchemy를 통한 SQLite Preset 저장 |
| 프런트엔드 | HTML, CSS, Vanilla JavaScript ES modules |
| 영상 처리 | 브라우저에 제공되는 FFmpeg WebAssembly와 Worker |
| 실행 주소 | 개발 기본값 `127.0.0.1:8011` |
| 주 화면 | `/t/app` |

## 아키텍처와 역할 분담

1. 사용자가 `/t/app`을 열고 파일을 선택한다.
2. 브라우저가 `File` 객체, Object URL, HTMLVideoElement로 입력 영상을 읽는다.
3. 브라우저에서 영상 메타데이터를 추출하고 Timeline을 갱신한다.
4. 편집 입력은 Recipe 형태로 구성된다.
5. `/api/recipe/validate`가 메타데이터와 Recipe를 검증하고 정규화한다.
6. `/api/plan`이 정규화된 Recipe를 FFmpeg 인자와 출력 설명으로 변환한다.
7. 브라우저의 `ffmpeg.wasm`이 입력 파일을 가상 파일시스템에 기록하고 실행한다.
8. 결과 바이트를 브라우저 Blob과 Object URL로 만들고 미리보기와 다운로드를 제공한다.

소스상 영상 파일을 서버 API로 업로드하는 경로는 확인되지 않았다. 서버 API에 전달되는 것은 메타데이터와 Recipe/Plan 요청이며, 이 판단은 현재 프런트엔드와 API 라우터의 구현 범위에 한정한다.

## 주요 화면 영역

- Header: Video Editor 제목, 파일 상태, Language, Theme
- Source Video: 파일 선택, 메타데이터, 입력 미리보기
- Timeline: 썸네일, Ruler, Playhead, Trim 핸들, Remove Segment, Zoom
- Editing Controls: Trim, Remove Segments, Loop Playback, Edit History, Presets, Crop, Scale, Audio, Output, Frame Capture
- Process: Validate, Run, Cancel, Clear, 상태, 진행률, 로그
- Output Results: 결과 영상·오디오·이미지 미리보기와 다운로드

## 실제 구현으로 확인된 특징

- 브라우저 기반 입력 영상 미리보기
- Canvas 기반 Timeline 썸네일 생성
- Playhead Seek 및 재생 동기화
- Timeline Zoom과 가로 스크롤
- Trim 및 Remove Segments
- Crop, Scale, Audio, Bitrate, Frame Capture
- Preset 적용과 Undo/Redo
- Loop Trim 미리보기
- FFmpeg WASM 결과 미리보기와 다운로드
- Cancel 및 Clear 상태 정리
- 한국어/영어 전환과 Light/Dark 테마
- 키보드 단축키

이 목록은 UI와 관련 코드에 존재하는 기능을 뜻한다. 각 항목의 자동·수동 검증 상태는 `feature-inventory.md`에서 구분한다.

## 실행 방식

README 기준 개발 실행 명령은 `./tools/dev-server.sh`이며, 동등한 Uvicorn 실행은 `127.0.0.1:8011`을 사용한다. 운영 서비스는 별도 systemd/Nginx 구성과 연계된다. 이번 분석에서는 실행 중인 서버와 배포 설정을 변경하지 않았다.

## 문서 작성 시 주의할 표현

“모든 브라우저에서 모든 형식을 지원한다”, “무제한 영상 처리”, “항상 빠르다”와 같은 표현은 소스와 현재 테스트만으로 입증되지 않는다. 지원 범위는 브라우저 디코더, FFmpeg 코덱, 메모리와 파일 크기에 따라 달라질 수 있다.
