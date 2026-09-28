import { timingSafeEqual } from "node:crypto";

export type ServerConfig = {
  email: string;
  privateKey: string;
  spreadsheetId: string;
  extensionKey: string;
};

export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n");
}

export function readConfig(env: NodeJS.ProcessEnv):
  | { ok: true; config: ServerConfig }
  | { ok: false; error: string } {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const privateKeyRaw = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "";
  const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ?? "";
  const extensionKey = env.EXTENSION_API_KEY ?? "";
  const missing: string[] = [];
  if (!email) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!privateKeyRaw.trim()) missing.push("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!spreadsheetId) missing.push("GOOGLE_SHEETS_SPREADSHEET_ID");
  if (!extensionKey) missing.push("EXTENSION_API_KEY");
  if (missing.length > 0) {
    return { ok: false, error: `Server is missing ${missing.join(", ")}.` };
  }
  return {
    ok: true,
    config: {
      email,
      privateKey: normalizePrivateKey(privateKeyRaw),
      spreadsheetId,
      extensionKey,
    },
  };
}

export function keysMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
