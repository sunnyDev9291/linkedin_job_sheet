import type { Country } from "./countries.ts";
import {
  formatNyDate,
  planSheetWrites,
  resultMessage,
  sheetHasJobUrl,
  sheetRange,
  type ExistingSheet,
} from "./sheetLogic.ts";

export type ValueUpdate = {
  range: string;
  values: (string | number)[][];
};

export type SheetIo = {
  read(country: Country): Promise<ExistingSheet>;
  update(ranges: ValueUpdate[]): Promise<void>;
};

export async function addJobsToCountry(
  io: SheetIo,
  input: { country: Country; jobs: { jobUrl: string }[]; now?: Date },
): Promise<{ added: number; skipped: number; message: string }> {
  const existing = await io.read(input.country);
  const plan = planSheetWrites({
    existing,
    jobs: input.jobs,
    country: input.country,
    today: formatNyDate(input.now ?? new Date()),
  });
  if (plan.writes.length > 0) {
    await io.update(
      plan.writes.map((write) => ({
        range: sheetRange(input.country, write.rangeA1),
        values: write.values,
      })),
    );
  }
  return {
    added: plan.added,
    skipped: plan.skipped,
    message: resultMessage(input.country, plan.added, plan.skipped),
  };
}

export async function checkJobOnCountry(
  io: SheetIo,
  input: { country: Country; jobUrl: string },
): Promise<{ present: boolean }> {
  const existing = await io.read(input.country);
  return { present: sheetHasJobUrl(existing, input.jobUrl) };
}
