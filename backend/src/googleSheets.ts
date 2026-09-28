import { google } from "googleapis";
import { COUNTRIES, type Country } from "../../shared/countries.ts";
import { addJobsToCountry, type SheetIo } from "../../shared/addJobs.ts";
import { sheetRange, startRowFromRange, type ExistingSheet } from "../../shared/sheetLogic.ts";
import { readConfig } from "./env.ts";
import { HttpError } from "./httpError.ts";

type SheetsApi = ReturnType<typeof google.sheets>;

function createClient(): { spreadsheetId: string; sheets: SheetsApi } {
  const config = readConfig(process.env);
  if (!config.ok) throw new HttpError(500, config.error);
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.config.email,
      private_key: config.config.privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return {
    spreadsheetId: config.config.spreadsheetId,
    sheets: google.sheets({ version: "v4", auth }),
  };
}

function googleStatus(error: unknown): number {
  if (typeof error !== "object" || error === null) return 500;
  const record = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  for (const value of [record.response?.status, record.status, record.code]) {
    if (typeof value === "number") return value;
  }
  return 500;
}

function explainGoogleError(error: unknown, country: string): HttpError {
  const message = error instanceof Error ? error.message : "Google Sheets request failed.";
  const status = googleStatus(error);
  if (/exceeds grid limits/i.test(message)) {
    return new HttpError(
      400,
      "No empty row is left to update. Add empty rows at the bottom of that country tab in Google Sheets, then try again.",
    );
  }
  if (/Unable to parse range/i.test(message)) {
    return new HttpError(400, `Sheet tab "${country}" was not found. Create a tab with that exact name.`);
  }
  if (status === 404 || /Requested entity was not found/i.test(message)) {
    return new HttpError(500, "Spreadsheet was not found. Check GOOGLE_SHEETS_SPREADSHEET_ID.");
  }
  if (status === 403 || /The caller does not have permission/i.test(message)) {
    return new HttpError(
      500,
      "The service account cannot edit this spreadsheet. Share the spreadsheet with the service account email as Editor.",
    );
  }
  return new HttpError(status >= 400 && status < 600 ? status : 500, message);
}

function asTable(values: unknown[] | null | undefined): string[][] {
  if (!Array.isArray(values)) return [];
  return values.map((row) => {
    if (!Array.isArray(row)) return [];
    return row.map((cell) => (cell == null ? "" : String(cell)));
  });
}

function googleIo(): SheetIo {
  const { sheets, spreadsheetId } = createClient();
  return {
    async read(country: Country): Promise<ExistingSheet> {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: sheetRange(country, "A:F"),
          majorDimension: "ROWS",
          valueRenderOption: "FORMATTED_VALUE",
        });
        return {
          values: asTable(response.data.values),
          startRow: startRowFromRange(response.data.range),
        };
      } catch (error) {
        throw explainGoogleError(error, country);
      }
    },
    async update(ranges) {
      if (ranges.length === 0) return;
      try {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: "RAW",
            data: ranges.map((item) => ({
              range: item.range,
              values: item.values,
            })),
          },
        });
      } catch (error) {
        throw explainGoogleError(error, "sheet");
      }
    },
  };
}

export async function addJobsWithGoogle(input: {
  country: Country;
  jobs: { jobUrl: string }[];
}): Promise<{ added: number; skipped: number; message: string }> {
  return addJobsToCountry(googleIo(), input);
}

export async function checkGoogleConnection(): Promise<string> {
  const { sheets, spreadsheetId } = createClient();
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties.title,sheets.properties.title",
    });
    const titles = new Set(
      (meta.data.sheets ?? [])
        .map((sheet) => sheet.properties?.title)
        .filter((title): title is string => Boolean(title)),
    );
    const missing = COUNTRIES.filter((country) => !titles.has(country));
    if (missing.length > 0) {
      throw new HttpError(400, `Missing sheet tabs: ${missing.join(", ")}.`);
    }
    return `Connected to ${meta.data.properties?.title ?? "spreadsheet"}.`;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw explainGoogleError(error, "spreadsheet");
  }
}
