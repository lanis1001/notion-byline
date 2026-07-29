# BYLINE — Notion OAuth 연동 백엔드 ("Connect to Notion" 방식)

구매자가 `.env`를 직접 채우는 대신, 위젯에서 **"Notion에 연결하기"** 버튼 한 번으로
자기 워크스페이스를 인증·연결하게 하는 방식입니다. 서버는 제작자(당신)가 하나만
운영하면 되고, 구매자별 토큰/DB 설정은 서버가 자동으로 저장/구분합니다.

## 흐름

```
1. 위젯 → GET /auth/notion               (Notion 로그인/승인 화면으로 이동)
2. Notion → GET /auth/notion/callback     (승인 후 자동 리다이렉트, 토큰 저장)
3. 위젯 → GET /api/status                 (연결됐는지 + DB 설정 필요한지 확인 → 연결 가능한 DB 목록 반환)
4. 위젯 → POST /api/setup/database        (필사 일지 DB 선택 → 그 DB에 연결. 새 DB를 만들지 않고
                                            날짜(date) 속성 + 완료(checkbox) 속성을 자동으로 찾아 매핑)
5. 위젯 → GET /api/records, POST /api/publish, DELETE /api/publish/:date  (평소 사용)
```

`발행` = 그날 필사 카드의 완료 체크박스를 켜는 것. 카드가 아직 없으면 최소 카드(제목=날짜)만
새로 만들고, 원문·필사 내용은 사용자가 Notion에서 직접 채워 넣습니다. `발행 취소`는 체크박스를
끄는 것뿐이며, 카드 자체는 절대 삭제/보관 처리하지 않습니다 (이미 써둔 필사 내용 보존).

## 사전 준비 (제작자가 1회만 할 일)

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration
2. **Distribution** 탭에서 "Public integration"으로 전환 (구매자 각자의 워크스페이스에
   연결하려면 필수 — Internal integration은 본인 워크스페이스에만 연결 가능)
3. Capabilities: Read/Insert/Update content 체크
4. Redirect URIs에 `.env`의 `NOTION_REDIRECT_URI`와 **정확히 동일한** 값 등록
5. 발급된 `Client ID`/`Client Secret`을 `.env`에 채움 (`.env.example` 참고)

## 설치 및 실행

```bash
cp .env.example .env   # 값 채우기
npm install
npm run dev
```

## 주의할 점

- `data/connections.json`은 세션 ID → Notion 연결 정보를 저장하는 최소 구현입니다.
  실제 배포에서는 반드시 Postgres/SQLite 등 real DB로 교체하고, 세션도 서버 재시작에도
  살아남도록 `connect-pg-simple` 같은 세션 스토어를 붙이세요 (지금은 메모리 세션이라
  서버 재시작하면 로그인 상태가 끊깁니다).
- 쿠키에 `secure: true`가 걸려 있어 **HTTPS 환경에서만** 세션이 유지됩니다. 로컬
  테스트는 `secure: false`로 잠깐 바꾸거나 ngrok 등으로 HTTPS 터널을 쓰세요.
- 위젯은 Notion 페이지에 iframe으로 임베드되므로 `sameSite: "none"` + `secure: true`
  조합이 필요합니다 (서드파티 쿠키 이슈 있으면 별도 토큰 기반 인증으로 바꾸는 것도 고려).
- `NOTION_CLIENT_SECRET`은 서버에만 두고 절대 프론트엔드/GitHub에 노출하지 마세요.
