import crypto from "crypto";

// 쿠키 대신, 서명된 토큰을 클라이언트(localStorage)에 들고 있게 하는 방식.
// 서버는 아무것도 저장하지 않는다 (Render 무료 티어의 재시작/슬립에도 영향받지 않음).
// 서드파티 쿠키가 막히는 모바일 브라우저·앱 내장 웹뷰에서도 동작하도록 하기 위한 선택.

function secret(): string {
  return process.env.SESSION_SECRET || "dev-secret-change-me";
}

export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verify<T>(token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as T;
  } catch {
    return null;
  }
}
