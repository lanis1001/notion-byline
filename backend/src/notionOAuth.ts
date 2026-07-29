// Notion OAuth 2.0 흐름 (public integration 전용).
// 참고: https://developers.notion.com/docs/authorization

const NOTION_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name}이 설정되지 않았습니다. .env.example을 참고해 .env를 채워주세요.`
    );
  }
  return value;
}

/** "Notion에 연결하기" 버튼이 이동할 URL. state는 CSRF 방지용 임의값(세션 ID와 묶어서 사용). */
export function getAuthorizeUrl(state: string): string {
  const clientId = requireEnv("NOTION_CLIENT_ID");
  const redirectUri = requireEnv("NOTION_REDIRECT_URI");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    owner: "user",
    redirect_uri: redirectUri,
    state,
  });

  return `${NOTION_AUTHORIZE_URL}?${params.toString()}`;
}

export interface NotionOAuthTokenResult {
  access_token: string;
  workspace_id: string;
  workspace_name: string;
  bot_id: string;
}

/** 콜백에서 받은 code를 access_token으로 교환 */
export async function exchangeCodeForToken(code: string): Promise<NotionOAuthTokenResult> {
  const clientId = requireEnv("NOTION_CLIENT_ID");
  const clientSecret = requireEnv("NOTION_CLIENT_SECRET");
  const redirectUri = requireEnv("NOTION_REDIRECT_URI");

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion OAuth 토큰 교환 실패 (${res.status}): ${text}`);
  }

  return res.json() as Promise<NotionOAuthTokenResult>;
}
