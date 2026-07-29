import "dotenv/config";
import crypto from "crypto";
import path from "path";
import express from "express";
import session from "express-session";
import { Client } from "@notionhq/client";

import { getAuthorizeUrl, exchangeCodeForToken } from "./notionOAuth";
import { getConnection, saveConnection, deleteConnection } from "./store";
import { listAccessibleDatabases, connectExistingDatabase } from "./setup";
import {
  listPublishRecords,
  createPublishRecord,
  cancelPublishRecord,
  DbConfig,
} from "./publishRepository";

declare module "express-session" {
  interface SessionData {
    oauthState?: string;
  }
}

const app = express();
app.use(express.json());
app.set("trust proxy", 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: "none", // 위젯이 Notion 페이지 iframe 안에서 호출하므로 필요
      secure: true, // 배포 시 HTTPS 필수 (secure 쿠키는 HTTP에서 저장 안 됨)
    },
  })
);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// 위젯 화면(index.html + byline-widget.js) 서빙. 같은 서버가 API와 위젯을
// 함께 제공하므로 fetch()가 같은 origin(상대경로)으로 동작한다.
app.use(express.static(path.join(__dirname, "..", "public")));

function requireConnection(req: express.Request, res: express.Response) {
  const conn = getConnection(req.sessionID);
  if (!conn) {
    res.status(401).json({ error: "Notion 연결이 필요합니다.", needsAuth: true });
    return null;
  }
  return conn;
}

// 1) 구매자가 위젯에서 이 URL로 이동 → Notion 로그인/승인 화면으로 리다이렉트
app.get("/auth/notion", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  res.redirect(getAuthorizeUrl(state));
});

// 2) Notion이 승인 후 여기로 돌아옴 → 토큰 교환 → 세션에 저장
app.get("/auth/notion/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || typeof code !== "string") {
    return res.status(400).send("code가 없습니다.");
  }
  if (state !== req.session.oauthState) {
    return res.status(400).send("state 불일치 (CSRF 의심). 다시 시도해주세요.");
  }

  try {
    const token = await exchangeCodeForToken(code);
    saveConnection(req.sessionID, {
      accessToken: token.access_token,
      workspaceId: token.workspace_id,
      workspaceName: token.workspace_name,
      botId: token.bot_id,
    });

    // 배포 시: 프론트엔드의 "설정 완료" 화면으로 리다이렉트
    res.redirect((process.env.ALLOWED_ORIGIN || "/") + "?connected=1");
  } catch (err) {
    console.error("[OAuth callback]", err);
    res.status(500).send("Notion 연결 중 오류가 발생했습니다.");
  }
});

// 연결 상태 + (DB 설정 전이면) 선택 가능한 데이터베이스 목록
app.get("/api/status", async (req, res) => {
  const conn = getConnection(req.sessionID);
  if (!conn) return res.json({ connected: false });

  if (!conn.databaseId) {
    const notion = new Client({ auth: conn.accessToken });
    const databases = await listAccessibleDatabases(notion);
    return res.json({ connected: true, needsDatabaseSetup: true, databases });
  }

  res.json({ connected: true, needsDatabaseSetup: false, workspaceName: conn.workspaceName });
});

// 구매자가 위 목록에서 필사 일지(또는 같은 모양의) DB를 고르면 그 DB에 연결
app.post("/api/setup/database", async (req, res) => {
  const conn = requireConnection(req, res);
  if (!conn) return;

  const { databaseId } = req.body ?? {};
  if (!databaseId) return res.status(400).json({ error: "databaseId가 필요합니다." });

  try {
    const notion = new Client({ auth: conn.accessToken });
    const dbConfig = await connectExistingDatabase(notion, databaseId);
    saveConnection(req.sessionID, { ...conn, ...dbConfig });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/setup/database]", err);
    const message = err instanceof Error ? err.message : "데이터베이스 연결 실패";
    res.status(422).json({ error: message });
  }
});

function toDbConfig(conn: NonNullable<ReturnType<typeof getConnection>>): DbConfig | null {
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

app.post("/auth/disconnect", (req, res) => {
  deleteConnection(req.sessionID);
  res.status(204).end();
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`BYLINE OAuth server listening on :${port}`);
});
