# 기술 구조 분석

## 백엔드 진입점과 라우팅

`app/main.py`가 FastAPI 앱을 생성하고 `/static`을 `app/web/static`에 마운트한다. `app/web/router.py`는 페이지와 SEO/정적 보조 엔드포인트를 제공하고, `app/api/video.py`와 `app/api/plan.py`가 `/api` 라우터를 제공한다.

주요 경로:

- `GET /`: 기본 안내 페이지
- `GET /t/app`: 전체 Video Editor
- `GET /t/min`: 최소 페이지
- `GET /healthz`: 상태 확인
- `GET /api/presets`: Preset 목록
- `POST /api/recipe/validate`: Recipe 검증·정규화
- `POST /api/plan`: FFmpeg 실행 계획 생성
- `POST/DELETE /api/presets/custom...`: 설정과 키가 허용할 때 사용자 Preset 변경
- `GET /favicon.ico`, `/robots.txt`, `/sitemap.xml`

## Recipe와 Plan

`Recipe`는 편집 의도를 표현하는 Pydantic 모델이다. Trim, Remove Segments, Crop, Scale, Bitrate, Audio, Frame Capture, Container를 포함한다. `/api/recipe/validate`는 영상 메타데이터를 기준으로 Trim 종료, 제거 구간 병합, Crop 범위, Scale 조건 등을 정규화한다.

`/api/plan`은 검증 결과를 사용해 `ffmpeg_args`, `container`, `mode`, `outputs`를 반환한다. 제거 구간은 유지할 구간으로 변환되어 concat filter를 구성한다. Crop/Scale은 video filter chain으로 변환된다.

## FFmpeg WebAssembly 흐름

`app/web/static/js/app/ffmpeg.js`는 `/static/ffmpeg/index.js`의 FFmpeg 클래스를 사용한다.

1. Core JS, WASM, Worker를 `/static/ffmpeg/`에서 로드한다.
2. 입력 `File`을 `arrayBuffer()`로 읽어 Uint8Array로 변환한다.
3. FFmpeg 가상 파일시스템에 입력 파일을 기록한다.
4. Plan의 인자와 임시 입력·출력 파일명으로 `ffmpeg.exec()`를 호출한다.
5. 출력 파일을 읽어 앱에 전달한다.
6. `finally`에서 가상 파일을 삭제한다.
7. 취소 시 `terminate()`와 실행 ID 비교로 이전 작업을 무효화한다.

사용자에게 제공되는 결과 이름은 `filename.js`의 `buildOutputFilename()`으로 원본 stem에 `_edited`를 붙인다. 내부 가상 파일명과 사용자 다운로드 파일명은 분리되어 있다.

## 프런트엔드 상태 관리

`app.js`는 파일, 메타데이터, Recipe draft/normalized, Remove Segments, Undo/Redo, 실행 상태, Loop 상태, 현재 상태 메시지를 한 상태 객체에서 관리한다. `timeline.js`는 Timeline 표시와 Pointer 조작을 담당하고, Seek·Trim·Segment 변경을 콜백으로 `app.js`에 전달한다.

`meta.js`는 입력 영상 메타데이터를 읽고, `thumbnails.js`는 별도 영상 요소와 Canvas로 프레임을 추출한다. 파일 교체와 Clear에는 세대·취소 보호 및 Object URL 정리가 있다.

## Preset과 SQLite

SQLite 데이터베이스는 `app/core/db.py`에서 SQLite만 허용하며, 시작 시 테이블을 생성한다. `VeditPreset`은 key, label, JSON recipe_patch, 생성·수정 시각을 저장한다. 기본 Preset은 코드에 있고, DB Preset이 같은 key를 덮어쓸 수 있다.

사용자 Preset 변경은 `preset_write_enabled`와 `X-App-Key` 검사를 통과해야 한다. 기본 설정에서는 쓰기가 비활성화되어 있다. 영상 파일이나 FFmpeg 결과 Blob은 SQLite 모델에 저장되지 않는다.

## 보안 헤더와 CSP

`app/main.py`의 보안 미들웨어는 다음을 설정한다.

- CSP: self 기반 리소스, `object-src 'none'`, `frame-ancestors 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, Worker/미디어 Blob 허용
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- COOP `same-origin`
- CORP `same-origin`

CORS는 설정에 명시된 Origin만 허용하며 기본값은 비어 있다. `allow_origins=["*"]` 기본 정책은 사용하지 않는다. 운영 Nginx가 추가하는 헤더나 HTTPS/HSTS 상태는 이 저장소의 애플리케이션 코드만으로 확정할 수 없다.

## 개인정보와 파일 처리

확인된 프런트엔드 경로에는 영상 파일을 `fetch`나 multipart 업로드로 서버에 보내는 코드가 없다. 입력 영상은 `URL.createObjectURL(file)`과 브라우저 메모리, FFmpeg WASM 가상 파일시스템에서 사용된다. 결과도 Blob URL로 브라우저에 생성된다.

다만 “영상이 절대 외부로 전송되지 않는다”는 운영 환경 전체에 대한 보장은 브라우저 확장, 프록시, 서버 설정까지 포함한 관찰 없이는 할 수 없다. 문서에는 “현재 애플리케이션 코드상 영상 업로드 경로가 확인되지 않는다” 정도로 표현하는 것이 안전하다.

## 정적 자산과 SEO

`editor.html`은 기본 `lang="ko"`, 영어 meta description, canonical, favicon 링크를 포함하며 i18n 전환 시 `document.documentElement.lang`을 갱신한다. `/robots.txt`와 `/sitemap.xml`은 `router.py`의 응답 라우트다. Sitemap에는 공개 앱 URL `/t/app`만 포함된다.
