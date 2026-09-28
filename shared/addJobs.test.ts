import assert from "node:assert/strict";
import { test } from "node:test";
import type { Country } from "./countries.ts";
import { addJobsToCountry, type SheetIo, type ValueUpdate } from "./addJobs.ts";
import { startRowFromRange } from "./sheetLogic.ts";

const now = new Date("2026-09-27T15:00:00.000Z");

function memorySheet(): SheetIo & { updates: string[]; cell: (country: Country, row: number) => (string | number)[] | undefined } {
  const books = new Map<string, Map<number, (string | number)[]>>();
  const updates: string[] = [];

  function book(country: string): Map<number, (string | number)[]> {
    const existing = books.get(country);
    if (existing) return existing;
    const created = new Map<number, (string | number)[]>();
    books.set(country, created);
    return created;
  }

  function countryOf(range: string): string {
    const quoted = /^'((?:[^']|'')*)'!/.exec(range);
    if (!quoted?.[1]) throw new Error(`Bad range ${range}`);
    return quoted[1].replaceAll("''", "'");
  }

  const io: SheetIo = {
    async read(country) {
      const rows = book(country);
      const entries = [...rows.entries()].sort((left, right) => left[0] - right[0]);
      if (entries.length === 0) return { values: [], startRow: 1 };
      const startRow = entries[0][0];
      const endRow = entries[entries.length - 1][0];
      const values: string[][] = [];
      for (let row = startRow; row <= endRow; row += 1) {
        values.push((rows.get(row) ?? []).map((cell) => String(cell)));
      }
      return { values, startRow };
    },
    async update(ranges: ValueUpdate[]) {
      for (const range of ranges) {
        updates.push(range.range);
        assert.equal(range.values.length, 1);
        assert.equal(range.values[0]?.length, 6);
        book(countryOf(range.range)).set(startRowFromRange(range.range), range.values[0] ?? []);
      }
    },
  };

  return {
    ...io,
    updates,
    cell(country, row) {
      return books.get(country)?.get(row);
    },
  };
}

test("writes headers and one LinkedIn row, then skips the same URL", async () => {
  const sheet = memorySheet();
  const first = await addJobsToCountry(sheet, {
    country: "Argentina",
    now,
    jobs: [{ jobUrl: "https://WWW.LinkedIn.com/jobs/view/15/" }],
  });
  assert.deepEqual(first, {
    added: 1,
    skipped: 0,
    message: "Added 1 job to Argentina.",
  });
  assert.deepEqual(sheet.cell("Argentina", 1), ["No", "Date", "Day_Count", "Country", "Job_Platform", "Job_URL"]);
  assert.deepEqual(sheet.cell("Argentina", 2), [
    1,
    "2026-09-27",
    1,
    "Argentina",
    "LinkedIn",
    "https://www.linkedin.com/jobs/view/15",
  ]);

  const second = await addJobsToCountry(sheet, {
    country: "Argentina",
    now,
    jobs: [{ jobUrl: "https://www.linkedin.com/jobs/view/15" }],
  });
  assert.deepEqual(second, {
    added: 0,
    skipped: 1,
    message: "URL already on Argentina sheet.",
  });
  assert.equal(sheet.updates.length, 2);
});

test("Day_Count restarts on a new New York date and No keeps growing", async () => {
  const sheet = memorySheet();
  await sheet.update([
    {
      range: "'Dominican Republic'!A1:F1",
      values: [["No", "Date", "Day_Count", "Country", "Job_Platform", "Job_URL"]],
    },
    {
      range: "'Dominican Republic'!A2:F2",
      values: [[7, "2026-09-26", 3, "Dominican Republic", "LinkedIn", "https://www.linkedin.com/jobs/view/1"]],
    },
  ]);
  sheet.updates.length = 0;

  const result = await addJobsToCountry(sheet, {
    country: "Dominican Republic",
    now,
    jobs: [{ jobUrl: "https://www.linkedin.com/jobs/view/2" }],
  });
  assert.equal(result.message, "Added 1 job to Dominican Republic.");
  assert.deepEqual(sheet.updates, ["'Dominican Republic'!A3:F3"]);
  assert.deepEqual(sheet.cell("Dominican Republic", 3), [
    8,
    "2026-09-27",
    1,
    "Dominican Republic",
    "LinkedIn",
    "https://www.linkedin.com/jobs/view/2",
  ]);
});
