import "dotenv/config";
import crypto from "crypto";
import path from "path";
import express from "express";
import { Client } from "@notionhq/client";

import { getAuthorizeUrl, exchangeCodeForToken } from "./notionOAuth";
import { sign, verify } from "./token";
import { listAccessibleDatabases, connectExistingDatabase } from "./setup";
import {
  listPublishRecords,
  createPublishRecord,
  cancelPublishRecord,
  DbConfig,
} from "./publishRepository";

// 연결 정보는 서버에 저장하지 않고, 서명된 토큰으로 클라이언트(localStorage)가 들고 있는다.
// 이유 1) Render 무료 티어는 재시작/슬립마다 서버 쪽 저장을 날려버림.
// 이유 2) 쿠키(특히 iframe 안에서 쓰는 서드파티 쿠키)는 모바일 브라우저·앱 내장 웹뷰에서
//         점점 더 많이 차단되어, 제작자가 아닌 다른 사용자는 로그인 자체가 안 되는 문제가 있었음.
export interface UserNotionConnection {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  botId: string;
  userName?: string;
  databaseId?: string;
  titleProperty?: string;
  dateProperty?: string;
  checkboxProperty?: string;
}

const app = express();
app.use(express.json());
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// 위젯 화면(index.html + byline-widget.js) 서빙. 같은 서버가 API와 위젯을
// 함께 제공하므로 fetch()가 같은 origin(상대경로)으로 동작한다.
app.use(express.static(path.join(__dirname, "..", "public")));

function getConnection(req: express.Request): UserNotionConnection | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return verify<UserNotionConnection>(header.slice("Bearer ".length)) ?? undefined;
}

function requireConnection(req: express.Request, res: express.Response) {
  const conn = getConnection(req);
  if (!conn) {
    res.status(401).json({ error: "Notion 연결이 필요합니다.", needsAuth: true });
    return null;
  }
  return conn;
}

function buildConnectionFromToken(
  token: Awaited<ReturnType<typeof exchangeCodeForToken>>
): UserNotionConnection {
  return {
    accessToken: token.access_token,
    workspaceId: token.workspace_id,
    workspaceName: token.workspace_name,
    botId: token.bot_id,
    userName: token.owner?.type === "user" ? token.owner.user?.name : undefined,
  };
}

// 공통 페이지 스타일 — 에러/완료 화면에서 재사용 (LÉTRA 톤에 맞춘 최소한의 스타일)
function pageShell(bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family:'Cormorant Garamond',Georgia,serif;background:#F5F1E8;color:#111111;padding:3rem 2rem;text-align:center;">
${bodyHtml}
</body></html>`;
}

function renderErrorPage(message: string): string {
  return pageShell(`
<p style="font-size:16px;margin-bottom:20px;">${message}</p>
<a href="/auth/notion" style="display:inline-block;padding:10px 20px;background:#111111;color:#F5F1E8;text-decoration:none;font-family:sans-serif;font-weight:600;font-size:13px;">다시 연결하기</a>
`);
}

// 팝업(또는 팝업이 막혀 원래 창 자신)에서 실행되는 스크립트를 렌더링한다.
// [버그 1/추가 수정] 세 가지를 모두 시도해 어느 하나만 통해도 정상 반영되게 한다:
//   1) 지금 이 스크립트가 실행 중인 컨텍스트의 localStorage에 직접 저장.
//      window.open이 막혀 팝업 없이 원래 창(=Notion 안 iframe) 자신이 여기까지 왔다면,
//      "여기"가 곧 원본 위젯이므로 이 한 줄로 끝난다 — 해시 전달 같은 우회가 필요 없다.
//   2) BroadcastChannel — 진짜 팝업이 열렸고 opener는 끊겼지만 같은 브라우저/출처인 경우.
//   3) window.opener.postMessage — 진짜 팝업이고 opener가 살아있는 정상 경로.
// window.opener가 있으면(=진짜 팝업) 창을 닫고, 없으면(=원래 창 자신이었던 경우) 이미
// 로컬 저장까지 끝났으니 깨끗한 주소로 돌아가 위젯이 새로 뜨게 한다.
function renderAuthPopupCloser(connToken: string): string {
  const cleanUrl = process.env.ALLOWED_ORIGIN || "/";
  return pageShell(`
<p id="msg">연결이 완료됐습니다…</p>
<script>
  var token = ${JSON.stringify(connToken)};
  try { localStorage.setItem('byline_token', token); } catch (e) {}
  try {
    var bc = new BroadcastChannel('byline-auth');
    bc.postMessage({ token: token });
    bc.close();
  } catch (e) {}
  if (window.opener) {
    try { window.opener.postMessage({ source: 'byline-auth', token: token }, '*'); } catch (e) {}
    setTimeout(function () { window.close(); }, 600);
  } else {
    window.location.href = ${JSON.stringify(cleanUrl)};
  }
</script>
`);
}

// 1) 위젯에서 이 URL을 새 창(팝업)으로 연다 → Notion 로그인/승인 화면으로 리다이렉트.
//    iframe 안에서 직접 열지 않는 이유: Notion의 로그인 화면 자체가 iframe 안에서 렌더링을
//    거부할 수 있어(클릭재킹 방지 정책), 그 경우 iframe에서는 계속 실패/리다이렉트가 반복된다.
app.get("/auth/notion", (req, res) => {
  const state = sign({ ts: Date.now(), nonce: crypto.randomBytes(8).toString("hex") });
  res.redirect(getAuthorizeUrl(state));
});

// 2) Notion이 승인 후 여기로 돌아옴 → 토큰 교환 → 팝업을 연 원래 창(위젯)에 postMessage로
//    전달하고 팝업은 스스로 닫는다. (팝업이 막혀 일반 이동으로 열렸을 경우를 대비해
//    window.opener가 없으면 URL 해시에 토큰을 실어 리다이렉트하는 방식으로 폴백한다.)
app.get("/auth/notion/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || typeof code !== "string") {
    return res
      .status(400)
      .send(renderErrorPage("Notion에서 필요한 정보를 받지 못했어요. 연결을 다시 시도해주세요."));
  }
  const statePayload = typeof state === "string" ? verify<{ ts: number }>(state) : null;
  if (!statePayload || Date.now() - statePayload.ts > 30 * 60 * 1000) {
    return res
      .status(400)
      .send(renderErrorPage("연결 요청 시간이 지났어요(30분 제한). 아래 버튼으로 다시 시도해주세요."));
  }

  try {
    const token = await exchangeCodeForToken(code);
    const connToken = sign(buildConnectionFromToken(token));
    res.send(renderAuthPopupCloser(connToken));
  } catch (err) {
    console.error("[OAuth callback]", err);
    res
      .status(500)
      .send(renderErrorPage("Notion 연결 중 문제가 생겼어요. 잠시 후 다시 시도해주세요."));
  }
});

// 연결 상태 + (DB 설정 전이면) 선택 가능한 데이터베이스 목록
app.get("/api/status", async (req, res) => {
  const conn = getConnection(req);
  if (!conn) return res.json({ connected: false });

  if (!conn.databaseId) {
    const notion = new Client({ auth: conn.accessToken });
    const databases = await listAccessibleDatabases(notion);
    return res.json({ connected: true, needsDatabaseSetup: true, databases });
  }

  res.json({
    connected: true,
    needsDatabaseSetup: false,
    workspaceName: conn.workspaceName,
    userName: conn.userName,
  });
});

// 구매자가 위 목록에서 필사 일지(또는 같은 모양의) DB를 고르면 그 DB에 연결.
// 갱신된 연결 정보를 담은 새 토큰을 돌려주며, 클라이언트는 이 토큰으로 localStorage를 갱신해야 한다.
app.post("/api/setup/database", async (req, res) => {
  const conn = requireConnection(req, res);
  if (!conn) return;

  const { databaseId } = req.body ?? {};
  if (!databaseId) return res.status(400).json({ error: "databaseId가 필요합니다." });

  try {
    const notion = new Client({ auth: conn.accessToken });
    const dbConfig = await connectExistingDatabase(notion, databaseId);
    const updated: UserNotionConnection = { ...conn, ...dbConfig };
    res.status(201).json({ ok: true, token: sign(updated) });
  } catch (err) {
    console.error("[POST /api/setup/database]", err);
    const message = err instanceof Error ? err.message : "데이터베이스 연결 실패";
    res.status(422).json({ error: message });
  }
});

function toDbConfig(conn: UserNotionConnection): DbConfig | null {
  if (!conn.databaseId || !conn.titleProperty || !conn.dateProperty || !conn.checkboxProperty) {
    return null;
  }
  return {
    databaseId: conn.databaseId,
    titleProperty: conn.titleProperty,
    dateProperty: conn.dateProperty,
    checkboxProperty: conn.checkboxProperty,
  };
}

app.get("/api/records", async (req, res) => {
  const conn = requireConnection(req, res);
  if (!conn) return;
  const cfg = toDbConfig(conn);
  if (!cfg) return res.status(409).json({ error: "데이터베이스 설정이 아직 안 됐습니다." });

  try {
    const notion = new Client({ auth: conn.accessToken });
    res.json({ records: await listPublishRecords(notion, cfg) });
  } catch (err) {
    console.error("[GET /api/records]", err);
    res.status(500).json({ error: "발행 이력 조회 실패" });
  }
});

app.post("/api/publish", async (req, res) => {
  const conn = requireConnection(req, res);
  if (!conn) return;
  const cfg = toDbConfig(conn);
  if (!cfg) return res.status(409).json({ error: "데이터베이스 설정이 아직 안 됐습니다." });

  const date: string = req.body?.date ?? new Date().toISOString().slice(0, 10);
  try {
    const notion = new Client({ auth: conn.accessToken });
    res.status(201).json({ record: await createPublishRecord(notion, cfg, date) });
  } catch (err) {
    console.error("[POST /api/publish]", err);
    res.status(500).json({ error: "발행 기록 실패" });
  }
});

app.delete("/api/publish/:date", async (req, res) => {
  const conn = requireConnection(req, res);
  if (!conn) return;
  const cfg = toDbConfig(conn);
  if (!cfg) return res.status(409).json({ error: "데이터베이스 설정이 아직 안 됐습니다." });

  try {
    const notion = new Client({ auth: conn.accessToken });
    await cancelPublishRecord(notion, cfg, req.params.date);
    res.status(204).end();
  } catch (err) {
    console.error("[DELETE /api/publish/:date]", err);
    res.status(500).json({ error: "발행 취소 실패" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`BYLINE OAuth server listening on :${port}`);
});
