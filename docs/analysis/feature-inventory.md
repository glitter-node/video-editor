# 기능 인벤토리 및 구현 상태

상태 의미:

- **구현 및 자동 테스트 확인**: 관련 코드와 정적·단위 테스트 근거가 모두 있음
- **구현 확인, 수동 검증 필요**: 코드와 테스트는 있으나 실제 브라우저 확인이 필요함
- **부분 구현**: 일부 경로만 구현되거나 브라우저/환경 의존성이 큼
- **미구현**: 현재 소스에서 기능을 확인하지 못함
- **소스만으로 판단 불가**: 운영 환경이나 실제 미디어 조건이 필요함

| 기능 | UI 위치 | 관련 소스 | 상태 및 근거 |
|---|---|---|---|
| 파일 선택 | Source Video | `editor.html`, `app.js`, `meta.js` | 구현 확인, 수동 검증 필요. `video/*` 선택과 메타데이터 로딩 코드가 있음 |
| 입력 미리보기 | Source Video | `app.js` | 구현 확인, 수동 검증 필요. Object URL과 HTMLVideoElement 사용 |
| 메타데이터 | Source Video | `meta.js`, `app.js` | 구현 및 자동 테스트 확인. 이름·형식·크기·해상도·길이 표시 |
| Canvas 썸네일 | Timeline | `thumbnails.js`, `timeline.js` | 구현 확인, 수동 검증 필요. 12개 기본 썸네일과 파일 세대 보호 코드 |
| Playhead | Timeline | `timeline.js`, `app.js` | 구현 및 자동 테스트 확인. E2E 명세와 Timeline 테스트가 있음; 이번 작업에서 브라우저 실행은 안 함 |
| Seek | Timeline | `timeline.js`, `app.js` | 구현 및 자동 테스트 확인. 클릭·드래그와 currentTime 동기화 |
| Zoom/Scroll | Timeline | `timeline.js` | 구현 및 자동 테스트 확인. 1x~16x와 Fit 관련 코드 및 단위 테스트 |
| Trim | Trim 그룹/Timeline | `app.js`, `timeline.js`, `video.py` | 구현 및 자동 테스트 확인. 순서·범위 검증 및 Recipe 반영 |
| Remove Segments | Remove Segments 그룹/Timeline | `app.js`, `timeline.js`, `video.py`, `plan.py` | 구현 및 자동 테스트 확인. 추가·병합·삭제·드래그·Plan 반영 |
| Loop Trim | Loop Playback | `app.js`, `timeline.js` | 구현 확인, 수동 검증 필요. 입력 미리보기 반복 재생이며 출력 Recipe와 분리 |
| Undo/Redo | Edit History | `app.js` | 구현 확인, 수동 검증 필요. 정규화 Recipe snapshot 기반 |
| Crop | Crop 그룹 | `app.js`, `video.py`, `plan.py` | 구현 확인, 수동 검증 필요. 픽셀 범위 정규화와 FFmpeg filter 생성 |
| Scale | Scale 그룹 | `app.js`, `video.py`, `plan.py` | 구현 확인, 수동 검증 필요. 비율 유지와 치수 검증 |
| Audio Keep/Mute | Audio 그룹 | `video.py`, `plan.py` | 구현 확인, 수동 검증 필요. 영상 Plan의 오디오 map 처리 |
| Audio Extract | Audio 그룹 | `video.py`, `plan.py`, `ffmpeg.js` | 구현 확인, 수동 검증 필요. aac/mp3/wav/flac/ogg 계획 생성 |
| Bitrate | Output 그룹 | `video.py`, `plan.py` | 구현 확인, 수동 검증 필요. 범위 검증 후 FFmpeg 인자로 변환 |
| Frame Capture | Frame Capture 그룹 | `video.py`, `plan.py` | 구현 확인, 수동 검증 필요. PNG 한 프레임 출력 |
| Output Container | Output 그룹 | `video.py`, `plan.py` | 구현 확인, 수동 검증 필요. mp4/webm/mkv 모델 정의 |
| Presets | Presets 그룹 | `video.py`, `app.js`, `db.py`, `models.py` | 구현 및 자동 테스트 확인. 내장 목록과 SQLite 사용자 정의 Preset 경로 |
| Validate | Process | `api.js`, `app.js`, `video.py` | 구현 및 자동 테스트 확인. `/api/recipe/validate` 호출 |
| Run | Process | `app.js`, `api.js`, `plan.py`, `ffmpeg.js` | 구현 확인, 수동 검증 필요. Plan 후 브라우저 FFmpeg 실행 |
| Progress/Log | Process | `app.js`, `ffmpeg.js` | 구현 확인, 수동 검증 필요. FFmpeg progress/log 이벤트 연결 |
| Cancel | Process | `app.js`, `ffmpeg.js` | 구현 확인, 수동 검증 필요. Worker terminate와 실행 토큰 무효화 |
| Output Preview/Download | Output Results | `app.js`, `filename.js` | 구현 확인, 수동 검증 필요. Blob URL, 결과 종류별 미리보기, source 기반 이름 |
| Keyboard Shortcuts | Keyboard Shortcuts | `shortcuts.js`, `app.js` | 구현 및 단위 테스트 확인 |
| ko/en 전환 | Header | `i18n.js`, `app.js` | 구현 및 단위 테스트 확인. 기본 ko, localStorage 저장 |
| Light/Dark | Header | `theme.js`, `app.css` | 구현 및 단위 테스트 확인. 기본 light, localStorage 저장 |
| 반응형 UI | 전체 | `app.css` | 구현 확인, 수동 검증 필요 |
| ARIA 접근성 | 전체 | `editor.html`, 정적 테스트 | 구현 및 정적 테스트 확인. 실제 Lighthouse는 별도 확인 필요 |
| robots/sitemap/favicon/SEO | HTTP/HTML | `router.py`, `editor.html`, 테스트 | 구현 및 자동 테스트 확인 |

## Recipe 모델에서 확인된 입력 범위

`VideoMeta.duration_ms`는 1~86400000, width/height는 1~16384, fps는 0 초과 240 이하로 정의되어 있다. Recipe의 Remove Segments는 최대 200개이며, 컨테이너는 `mp4`, `webm`, `mkv`다. 이 값은 API 모델의 검증 범위이지 모든 브라우저에서 실제 처리가 보장된다는 뜻은 아니다.

## 자동 테스트 근거

- Python: `tests/test_app.py`, `tests/test_standalone.py`, 정적 보안·ARIA·테마 관련 테스트
- JavaScript: `tests/test_timeline_time.mjs`, `tests/test_shortcuts.mjs`, `tests/test_theme.mjs`, `tests/test_i18n.mjs`, `tests/test_filename.mjs`
- 브라우저 E2E 명세: `tests/e2e/editor.spec.mjs`

브라우저 E2E 명세에는 썸네일, Playhead, Trim, Segment, Loop, Clear, FFmpeg Trim, Cancel/재실행 시나리오가 포함되어 있지만, 이번 분석 단계에서는 브라우저를 실행하지 않았다.
