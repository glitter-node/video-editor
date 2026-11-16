# 제한사항 및 추가 검증 항목

## 소스에서 확인된 제한

- 입력 파일의 실제 지원 범위는 `accept="video/*"`와 브라우저/FFmpeg 디코더의 조합으로 결정된다. 확장자만으로 모든 형식을 보장할 수 없다.
- API 모델은 입력 영상 길이를 최대 24시간, 해상도 각 축을 최대 16384로 제한하지만, 실제 브라우저 메모리와 WASM 처리 가능 범위는 더 좁을 수 있다.
- FFmpeg WASM은 큰 파일이나 긴 영상에서 브라우저 메모리와 처리 시간의 영향을 받는다. 정해진 성능 보장은 코드에서 확인되지 않는다.
- Crop, Scale, Bitrate, 컨테이너 조합이 모든 브라우저에서 재생된다는 보장은 없다.
- Frame Capture는 PNG 한 프레임 출력이며, Audio Extract와 동시에 사용할 수 없다.
- 사용자 Preset 저장은 설정과 App Key가 활성화된 경우에만 가능하다.
- 새로고침 후 현재 영상 File 객체와 편집 상태가 유지된다는 영속성 코드는 확인되지 않았다. Preset 저장과 영상 작업 상태 저장은 별개다.
- 처리 중 브라우저 탭을 닫거나 새로고침하면 현재 브라우저 작업은 유지되지 않을 수 있다.

## 브라우저 수동 검증이 필요한 항목

다음은 코드와 자동 테스트 명세만으로 현재 환경에서 PASS라고 보고하지 않는다.

1. Chrome에서 MP4 선택 후 메타데이터·썸네일·미리보기 확인
2. Timeline Playhead, Seek, Zoom, 모바일 Pointer 조작
3. 다양한 길이와 해상도에서 Trim/Remove Segments 결과 확인
4. WebM/MKV 출력의 실제 재생성 및 다운로드 파일 유효성
5. Audio Extract 형식별 결과와 오디오 코덱 호환성
6. Crop/Scale 결과의 실제 해상도와 화면 비율
7. Frame Capture PNG의 실제 픽셀 결과
8. 메모리 부족, 디코더 실패, FFmpeg 로딩 실패 복구
9. Cancel 후 즉시 재실행 시 이전 Worker 이벤트 혼입 여부
10. 한국어/영어 전환과 Light/Dark 전환 중 재생 위치·편집 상태 보존
11. Lighthouse 및 실제 접근성 도구 결과

## 테스트 상태 해석

`tests/e2e/editor.spec.mjs`에는 브라우저 기반 검증 시나리오가 존재한다. 그러나 현재 작업 제한에 따라 Playwright/Chromium을 실행하지 않았다. 따라서 해당 명세의 존재는 테스트 가능성을 보여주지만, 이번 분석 시점의 브라우저 통과 결과는 아니다.

Python API·정적 테스트와 JavaScript 단위 테스트는 실행 결과를 최종 보고에 별도로 기록한다. 영상 변환을 포함하는 무거운 native/브라우저 테스트는 이번 문서 분석 범위에서 실행하지 않는다.

## README와 소스의 문서화 주의점

README의 “브라우저에서 처리”, “선택 파일은 장치에 유지” 설명은 현재 프런트엔드와 API 구조와 부합한다. 다만 브라우저별 형식 지원, 오디오 트랙 탐지, 코덱 호환성은 README도 수동 확인이 필요하다고 표시하므로 확정적 홍보 문구로 확대하면 안 된다.

현재 소스에는 `/robots.txt`, `/sitemap.xml`, favicon, canonical, meta description이 구현되어 있다. 이 항목들은 과거 문서나 외부 배포 상태와 다를 수 있으므로 공개 사이트 확인 시 실제 HTTP 응답도 확인해야 한다.

## 운영 환경에서 확인할 사항

- 실제 HTTPS 응답의 보안 헤더와 HSTS
- Nginx가 애플리케이션 응답을 변경하거나 캐시하는지
- 공개 Origin과 Trusted Host 설정
- SQLite 경로와 백업 정책
- 운영 브라우저의 FFmpeg WASM 로딩 및 Worker 정책
- 실제 도메인에서 canonical, robots, sitemap 응답
