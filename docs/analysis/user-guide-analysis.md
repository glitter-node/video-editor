# 사용자 설명서 작성용 분석

## 시작 전 준비

JavaScript와 WebAssembly를 실행할 수 있는 최신 브라우저가 필요하다. 입력 파일은 브라우저의 영상 디코더와 FFmpeg WASM이 읽을 수 있어야 한다. 실제 브라우저별 코덱 호환성은 소스만으로 확정하지 않고 Chrome 수동 확인이 필요하다.

## 기본 사용 순서

1. `/t/app`에 접속한다.
2. `Choose a video file`에서 원본 영상을 선택한다.
3. Source Video에서 파일명, 형식, 크기, 해상도, 재생시간을 확인한다.
4. 입력 미리보기와 Timeline에서 영상 상태를 확인한다.
5. 필요하면 Trim, Remove Segments, Crop, Scale, Audio, Output 옵션을 설정한다.
6. `Validate`를 눌러 Recipe를 검증한다.
7. `Run`을 눌러 브라우저에서 FFmpeg 처리를 시작한다.
8. Process 상태와 진행률, 로그를 확인한다.
9. 완료 후 Output Results에서 결과를 미리보고 `Download`로 저장한다.

파일을 바꾸면 이전 입력 Object URL, 썸네일, 편집 상태가 정리되고 새 파일 기준으로 화면이 갱신된다. `Clear`는 입력, 편집 설정, 결과와 관련 화면을 초기화한다.

## Source Video

파일 선택 전에는 Empty Preview가 표시되고 입력 플레이어와 Timeline은 숨겨진 상태다. 파일을 선택하면 `HTMLVideoElement`가 표시되고 다음 정보가 나타난다.

- File Name
- File Type
- File Size
- Resolution
- Duration

파일 선택은 템플릿의 `accept="video/*"`를 사용한다. 이 속성은 선택 UI의 안내 범위이며, 실제 디코딩 가능 여부를 보장하는 형식 목록은 아니다.

## Timeline 사용법

- Track을 클릭하면 해당 시점으로 Seek한다.
- Playhead를 드래그하면 입력 영상의 현재 위치가 바뀐다.
- `Trim Start`와 `Trim End` 핸들은 Trim 입력값과 양방향 동기화된다.
- `Zoom In`, `Zoom Out`, `Fit`으로 Timeline 배율을 조절한다.
- 확대 상태에서는 가로 스크롤로 세부 구간을 확인한다.
- Remove Segment 오버레이는 제거 대상 구간을 나타낸다.
- 영상 재생 중 Playhead는 현재 재생 위치를 따라간다.

Timeline 내부 좌표는 밀리초와 영상 전체 길이를 기준으로 계산되며, 실제 입력 영상의 `currentTime`과 동기화된다.

## Trim

`Trim Start`와 `Trim End`는 밀리초 단위다. Start는 End보다 작아야 하며 영상 길이를 벗어날 수 없다. 입력값을 직접 넣거나 Timeline 핸들을 움직일 수 있다.

예시 절차:

1. `Trim Start`에 `500`을 입력한다.
2. `Trim End`에 `2500`을 입력한다.
3. `Validate`를 실행한다.
4. `Run`으로 결과를 생성한다.

서버 검증 모델의 기본 영상 메타데이터 범위는 길이 1ms 이상 24시간 이하이며, Trim 자체는 시작 0 이상, 종료 0 이상과 순서 검사를 적용한다.

## Remove Segments

1. `Segment Start`와 `Segment End`에 밀리초를 입력한다.
2. `Add Segment`를 누른다.
3. 목록과 Timeline 오버레이에서 제거 구간을 확인한다.
4. 오버레이 본문을 드래그하거나 양쪽 핸들로 구간을 조정한다.
5. 필요하면 항목별 `Remove` 또는 `Clear Segments`를 사용한다.

겹치는 구간은 프런트엔드와 서버 Recipe 검증에서 병합된다. 모든 구간을 제거하여 남는 영상이 없으면 Validate/Plan 단계에서 오류가 발생한다.

## Loop Playback

`Loop Trim`을 선택하면 출력 Recipe를 변경하지 않고 입력 미리보기의 Trim 범위를 반복 재생한다. 영상이 Trim End에 도달하면 Trim Start로 되돌아간다. Pause, Clear, 파일 교체 시 상태가 정리된다.

## Crop, Scale, Audio, Output

- Crop: X, Y, Width, Height를 픽셀 단위로 설정한다. 영상 범위를 벗어나는 값은 서버 검증에서 영상 크기에 맞게 정규화된다.
- Scale: Width와 Height를 설정하며 `Keep Aspect Ratio`를 사용할 수 있다. 비율 유지 해제 시 두 치수가 필요하다.
- Audio: `Keep`, `Mute`, `Extract`가 있다. Extract는 `aac`, `mp3`, `wav`, `flac`, `ogg` 형식을 지원한다. 입력에 오디오가 없으면 추출은 검증 오류가 된다.
- Output: `mp4`, `webm`, `mkv` 컨테이너가 Recipe 모델에 정의되어 있다.
- Bitrate: Video는 100~200000 kbps, Audio는 32~512 kbps 범위가 모델에 정의되어 있다.
- Frame Capture: 지정한 밀리초에서 PNG 프레임을 하나 생성한다. Audio Extract와 동시에 사용할 수 없다.

실제 브라우저에서 각 컨테이너와 코덱 조합이 재생되는지는 별도 수동 검증이 필요하다.

## Presets와 편집 이력

내장 Preset은 `Web 1080p`, `Web 720p`, `Mute Audio`, `Extract MP3`다. Preset은 Recipe patch를 적용하며, 적용 후 Undo/Redo가 가능하다. 사용자 정의 Preset 저장·삭제 API는 설정과 인증 키가 활성화된 경우에만 동작한다.

## 키보드 단축키

- `Space`: 재생/일시정지
- `ArrowLeft` / `ArrowRight`: 1초 Seek
- `Shift + ArrowLeft` / `Shift + ArrowRight`: 100ms Seek
- `Home` / `End`: 시작/끝으로 이동
- `I` / `O`: 현재 위치를 Trim Start/End로 지정
- `Ctrl/Cmd + Z`: Undo
- `Ctrl/Cmd + Y` 또는 `Ctrl/Cmd + Shift + Z`: Redo

입력 필드, Select, 버튼 등 편집 가능한 요소에 포커스가 있으면 기존 브라우저 조작을 방해하지 않도록 단축키 처리가 제한된다.

## 처리 중 취소와 초기화

처리 중 `Cancel`은 FFmpeg Worker를 종료하고 실행 토큰을 무효화한다. 이후 다시 `Run`할 수 있도록 상태를 복구하는 코드가 있다. `Clear`는 입력 Object URL과 결과 Blob URL을 해제하고 Timeline, 썸네일, 편집 상태를 초기화한다.
