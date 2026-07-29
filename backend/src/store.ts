import fs from "fs";
import path from "path";

// 최소 구현: JSON 파일에 사용자별(세션별) Notion 연결 정보를 저장.
// 실제 운영에서는 이 부분을 Postgres/SQLite 등 real DB로 교체할 것.
// (여러 서버 인스턴스로 스케일하면 파일 기반은 동작하지 않음)

export interface UserNotionConnection {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  botId: string;
  databaseId?: string;
  titleProperty?: string;
  dateProperty?: string;
  checkboxProperty?: string;
}

const STORE_PATH = path.join(__dirname, "..", "data", "connections.json");

function readAll(): Record<string, UserNotionConnection> {
  if (!fs.existsSync(STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
}

function writeAll(data: Record<string, UserNotionConnection>): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export function getConnection(sessionId: string): UserNotionConnection | undefined {
  return readAll()[sessionId];
}

export function saveConnection(sessionId: string, connection: UserNotionConnection): void {
  const all = readAll();
  all[sessionId] = { ...all[sessionId], ...connection };
  writeAll(all);
}

export function deleteConnection(sessionId: string): void {
  const all = readAll();
  delete all[sessionId];
  writeAll(all);
}
