// 홈 화면에 추가했을 때 "설치 가능한 앱"으로 인식되려면(안드로이드 크롬 기준) 서비스
// 워커가 있어야 한다. 캐싱은 일부러 안 한다 — 이 위젯은 발행 상태가 실시간으로 바뀌는
// 화면이라, 뭔가를 캐싱하면 오히려 오래된 화면이 보이는 문제를 새로 만들 수 있다.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
