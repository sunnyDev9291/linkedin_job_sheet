import { COUNTRIES, JOB_PLATFORM, isCountry, type Country } from "./countries.ts";

export const HEADERS = ["No", "Date", "Day_Count", "Country", "Job_Platform", "Job_URL"] as const;

export type ExistingSheet = {
  values: string[][];
  startRow: number;
};

export type PlannedWrite = {
  rangeA1: string;
  values: (string | number)[][];
};

export function formatNyDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Could not format the New York date.");
  }
  // YYYY-MM-DD so Google Sheets USER_ENTERED stores a real Date, not plain text.
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Normalize a sheet Date cell (text, locale format, or serial) to YYYY-MM-DD. */
export function sheetDateKey(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  let match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(text);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    // Sheets serial dates are days since 1899-12-30.
    if (Number.isFinite(serial) && serial >= 20000 && serial < 100000) {
      const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
      const utc = new Date(ms);
      const year = utc.getUTCFullYear();
      const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
      const day = String(utc.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

export function normalizeJobUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return trimmed.replace(/\/+$/, "");
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString().replace(/\/+$/, "");
}

export function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function sheetRange(tab: string, a1: string): string {
  return `'${tab.replaceAll("'", "''")}'!${a1}`;
}

export function startRowFromRange(range: string | null | undefined): number {
  if (!range) return 1;
  const match = /!\$?[A-Z]+\$?(\d+)/i.exec(range);
  if (!match) return 1;
  const row = Number(match[1]);
  return Number.isInteger(row) && row > 0 ? row : 1;
}

export function resultMessage(country: string, added: number, skipped: number): string {
  if (added > 0 && skipped === 0) {
    const noun = added === 1 ? "job" : "jobs";
    return `Added ${added} ${noun} to ${country}.`;
  }
  if (added === 0 && skipped === 1) {
    return `URL already on ${country} sheet.`;
  }
  if (added === 0 && skipped > 1) {
    return `${skipped} URLs already on ${country} sheet.`;
  }
  if (added > 0 && skipped > 0) {
    const noun = added === 1 ? "job" : "jobs";
    return `Added ${added} ${noun} to ${country}. Skipped ${skipped} already on the sheet.`;
  }
  return `Added 0 jobs to ${country}.`;
}

const MAX_JOBS = 25;
const MAX_URL_LENGTH = 2000;

export function parseAddJobRequest(body: unknown):
  | { ok: true; country: Country; jobs: { jobUrl: string }[] }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const record = body as { country?: unknown; jobs?: unknown };
  if (!isCountry(record.country)) {
    return {
      ok: false,
      error: `Country must be one of: ${COUNTRIES.join(", ")}.`,
    };
  }
  if (!Array.isArray(record.jobs) || record.jobs.length === 0) {
    return { ok: false, error: "jobs must be a non-empty array." };
  }
  if (record.jobs.length > MAX_JOBS) {
    return { ok: false, error: `jobs cannot contain more than ${MAX_JOBS} URLs.` };
  }
  const jobs: { jobUrl: string }[] = [];
  for (const item of record.jobs) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "Each job needs an http(s) jobUrl." };
    }
    const jobUrl = (item as { jobUrl?: unknown }).jobUrl;
    if (typeof jobUrl !== "string" || jobUrl.trim().length > MAX_URL_LENGTH || !isHttpUrl(jobUrl)) {
      return { ok: false, error: "Each job needs an http(s) jobUrl." };
    }
    jobs.push({ jobUrl: jobUrl.trim() });
  }
  return { ok: true, country: record.country, jobs };
}

function parseNo(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const no = Number(text);
  return Number.isSafeInteger(no) ? no : null;
}

export function planSheetWrites(input: {
  existing: ExistingSheet;
  jobs: { jobUrl: string }[];
  country: Country;
  today: string;
}): { writes: PlannedWrite[]; added: number; skipped: number } {
  const startRow = input.existing.startRow > 0 ? input.existing.startRow : 1;
  const occupied = new Map<number, string[]>();
  input.existing.values.forEach((row, index) => {
    occupied.set(
      startRow + index,
      (row ?? []).map((cell) => String(cell ?? "")),
    );
  });

  const seen = new Set<string>();
  let maxNo = 0;
  let todayCount = 0;
  let lastUsedRow = 1;

  for (const [rowNumber, row] of occupied) {
    if (!row.some((cell) => cell.trim() !== "")) continue;
    if (rowNumber > lastUsedRow) lastUsedRow = rowNumber;
    if (rowNumber === 1) continue;
    const no = parseNo(row[0] ?? "");
    if (no !== null && no > maxNo) maxNo = no;
    if (sheetDateKey(row[1] ?? "") === input.today) todayCount += 1;
    const url = (row[5] ?? "").trim();
    if (url) seen.add(normalizeJobUrl(url));
  }

  const headerRow = occupied.get(1);
  const headerMissing = !headerRow || headerRow.every((cell) => cell.trim() === "");
  const dataWrites: PlannedWrite[] = [];
  let nextRow = Math.max(lastUsedRow + 1, 2);
  let added = 0;
  let skipped = 0;

  for (const job of input.jobs) {
    const normalized = normalizeJobUrl(job.jobUrl);
    if (seen.has(normalized)) {
      skipped += 1;
      continue;
    }
    maxNo += 1;
    todayCount += 1;
    added += 1;
    dataWrites.push({
      rangeA1: `A${nextRow}:F${nextRow}`,
      values: [[maxNo, input.today, todayCount, input.country, JOB_PLATFORM, normalized]],
    });
    seen.add(normalized);
    nextRow += 1;
  }

  const writes = headerMissing && dataWrites.length > 0
    ? [{ rangeA1: "A1:F1", values: [Array.from(HEADERS)] }, ...dataWrites]
    : dataWrites;

  return { writes, added, skipped };
}

export function sheetHasJobUrl(existing: ExistingSheet, jobUrl: string): boolean {
  const target = normalizeJobUrl(jobUrl);
  if (!target) return false;
  const startRow = existing.startRow > 0 ? existing.startRow : 1;
  for (let index = 0; index < existing.values.length; index += 1) {
    const rowNumber = startRow + index;
    if (rowNumber === 1) continue;
    const row = existing.values[index] ?? [];
    const url = String(row[5] ?? "").trim();
    if (url && normalizeJobUrl(url) === target) return true;
  }
  return false;
}

export function parseJobStatusRequest(body: unknown):
  | { ok: true; country: Country; jobUrl: string }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const record = body as { country?: unknown; jobUrl?: unknown };
  if (!isCountry(record.country)) {
    return {
      ok: false,
      error: `Country must be one of: ${COUNTRIES.join(", ")}.`,
    };
  }
  if (typeof record.jobUrl !== "string" || record.jobUrl.trim().length > MAX_URL_LENGTH || !isHttpUrl(record.jobUrl)) {
    return { ok: false, error: "jobUrl must be an http(s) URL." };
  }
  return { ok: true, country: record.country, jobUrl: record.jobUrl.trim() };
}
