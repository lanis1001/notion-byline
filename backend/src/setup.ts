import { Client } from "@notionhq/client";

// LÉTRA 필사 일지 DB(또는 같은 모양의 DB)를 자동으로 인식하기 위한 후보 속성명.
// 정확히 일치하는 이름이 없으면 같은 타입의 첫 번째 속성으로 대체 탐지한다.
const DATE_PROPERTY_CANDIDATES = ["날짜", "Date"];
const CHECKBOX_PROPERTY_CANDIDATES = ["필사 완료", "발행 완료", "완료", "Done", "Published"];

/**
 * OAuth 인증 직후, 사용자가 연결할 기존 데이터베이스를 고르게 하기 위한 목록 조회.
 * integration이 접근 가능한 모든 DB가 아니라, 날짜+체크박스 속성을 모두 가진(=필사
 * 일지 같은 모양의) DB만 추려서 보여준다 — 매체 가이드·어휘 노트처럼 무관한 DB나
 * 검색 결과 중복이 섞여 들어오는 것을 막기 위함. 제목 기준으로도 중복 제거한다.
 */
export async function listAccessibleDatabases(notion: Client) {
  const res = await notion.search({
    filter: { property: "object", value: "database" },
    page_size: 50,
  });

  const seenTitles = new Set<string>();
  const results: { id: string; title: string; url?: string }[] = [];

  for (const r of res.results) {
    if (r.object !== "database") continue;
    const db = r as unknown as {
      id: string;
      url?: string;
      title?: { plain_text: string }[];
      properties?: Record<string, { type: string }>;
    };

    const properties = db.properties ?? {};
    const hasDate = Object.values(properties).some((p) => p.type === "date");
    const hasCheckbox = Object.values(properties).some((p) => p.type === "checkbox");
    if (!hasDate || !hasCheckbox) continue; // 필사 일지 같은 모양이 아니면 목록에서 제외

    const title = Array.isArray(db.title) ? db.title.map((t) => t.plain_text).join("") : "(제목 없음)";
    if (seenTitles.has(title)) continue; // 제목 중복 제거
    seenTitles.add(title);

    results.push({ id: db.id, title, url: db.url });
  }

  return results;
}

function findProperty(
  properties: Record<string, { type: string }>,
  candidates: string[],
  type: string
): string | null {
  for (const name of candidates) {
    if (properties[name]?.type === type) return name;
  }
  const fallback = Object.entries(properties).find(([, prop]) => prop.type === type);
  return fallback ? fallback[0] : null;
}

/**
 * 새 DB를 만드는 대신, 사용자가 고른 기존 DB(예: LÉTRA 필사 일지)에 연결한다.
 * 날짜(date) 속성과 완료 체크박스(checkbox) 속성, title 속성을 자동으로 찾아 매핑한다.
 */
export async function connectExistingDatabase(notion: Client, databaseId: string) {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  const properties = (db as unknown as { properties: Record<string, { type: string }> }).properties;

  const dateProperty = findProperty(properties, DATE_PROPERTY_CANDIDATES, "date");
  const checkboxProperty = findProperty(properties, CHECKBOX_PROPERTY_CANDIDATES, "checkbox");
  const titleEntry = Object.entries(properties).find(([, prop]) => prop.type === "title");

  if (!dateProperty || !checkboxProperty || !titleEntry) {
    throw new Error(
      "이 데이터베이스에서 날짜 속성과 완료 체크박스 속성을 찾지 못했습니다. " +
        "필사 일지 DB에 날짜(date)와 필사 완료(checkbox) 속성이 있는지 확인해주세요."
    );
  }

  return {
    databaseId,
    titleProperty: titleEntry[0],
    dateProperty,
    checkboxProperty,
  };
}
