import { Client } from "@notionhq/client";

export interface DbConfig {
  databaseId: string;
  titleProperty: string;
  dateProperty: string;
  checkboxProperty: string;
}

export interface PublishRecord {
  pageId: string;
  date: string; // YYYY-MM-DD
}

// 멀티테넌트 구조라 client/databaseId를 매번 인자로 받음 (전역 싱글턴 금지).
// 요청마다 req.session에 저장된 사용자별 accessToken/databaseId로 client를 새로 만들어 넘겨줌.
//
// "발행"의 의미: 필사 일지 DB에서 해당 날짜 카드의 완료 체크박스를 켜는 것.
// 아직 그날 카드가 없으면 최소 카드(제목=날짜)를 새로 만들고 체크박스를 켠다 —
// 실제 원문/필사 내용은 사용자가 Notion에서 직접 채워 넣는다 (이 앱은 대신 쓰지 않음).
// "발행 취소"는 체크박스를 끄는 것뿐이며, 카드 자체는 절대 삭제/보관 처리하지 않는다 —
// 사용자가 이미 작성한 필사 내용을 보존하기 위함.

export async function listPublishRecords(
  notion: Client,
  cfg: DbConfig
): Promise<PublishRecord[]> {
  const records: PublishRecord[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: cfg.databaseId,
      start_cursor: cursor,
      filter: { property: cfg.checkboxProperty, checkbox: { equals: true } },
      sorts: [{ property: cfg.dateProperty, direction: "ascending" }],
    });

    for (const page of res.results) {
      if (!("properties" in page)) continue;
      const dateProp = page.properties[cfg.dateProperty];
      if (dateProp?.type === "date" && dateProp.date?.start) {
        records.push({ pageId: page.id, date: dateProp.date.start });
      }
    }

    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  return records;
}

export async function findRecordByDate(
  notion: Client,
  cfg: DbConfig,
  date: string
): Promise<PublishRecord | null> {
  const res = await notion.databases.query({
    database_id: cfg.databaseId,
    filter: { property: cfg.dateProperty, date: { equals: date } },
  });

  const page = res.results[0];
  if (!page || !("properties" in page)) return null;
  return { pageId: page.id, date };
}

export async function createPublishRecord(
  notion: Client,
  cfg: DbConfig,
  date: string
): Promise<PublishRecord> {
  const existing = await findRecordByDate(notion, cfg, date);

  if (existing) {
    await notion.pages.update({
      page_id: existing.pageId,
      properties: { [cfg.checkboxProperty]: { checkbox: true } },
    });
    return existing;
  }

  const page = await notion.pages.create({
    parent: { database_id: cfg.databaseId },
    properties: {
      [cfg.titleProperty]: { title: [{ text: { content: date } }] },
      [cfg.dateProperty]: { date: { start: date } },
      [cfg.checkboxProperty]: { checkbox: true },
    },
  });

  return { pageId: page.id, date };
}

export async function cancelPublishRecord(
  notion: Client,
  cfg: DbConfig,
  date: string
): Promise<void> {
  const existing = await findRecordByDate(notion, cfg, date);
  if (!existing) return;
  // 체크박스만 끈다 — 카드를 보관 처리하면 사용자가 써둔 필사 내용이 통째로 사라지므로 금지.
  await notion.pages.update({
    page_id: existing.pageId,
    properties: { [cfg.checkboxProperty]: { checkbox: false } },
  });
}
