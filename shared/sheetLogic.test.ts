import assert from "node:assert/strict";
import { test } from "node:test";
import { COUNTRIES, DEFAULT_COUNTRY, JOB_PLATFORM } from "./countries.ts";
import { toastForSheetResult } from "./messages.ts";
import {
  formatNyDate,
  normalizeJobUrl,
  parseAddJobRequest,
  planSheetWrites,
  sheetDateKey,
  sheetHasJobUrl,
  sheetRange,
  startRowFromRange,
} from "./sheetLogic.ts";

const today = "2026-09-27";

test("countries and platform are fixed", () => {
  assert.deepEqual(COUNTRIES, [
    "Brazil",
    "Argentina",
    "Colombia",
    "Dominican Republic",
  ]);
  assert.equal(DEFAULT_COUNTRY, "Argentina");
  assert.equal(JOB_PLATFORM, "LinkedIn");
});

test("formats America/New_York dates as YYYY-MM-DD", () => {
  assert.equal(formatNyDate(new Date("2026-09-27T15:00:00.000Z")), "2026-09-27");
  assert.equal(formatNyDate(new Date("2026-01-05T15:00:00.000Z")), "2026-01-05");
  assert.equal(formatNyDate(new Date("2026-01-01T04:30:00.000Z")), "2025-12-31");
});

test("sheet date keys match across text formats", () => {
  assert.equal(sheetDateKey("2026/9/27"), "2026-09-27");
  assert.equal(sheetDateKey("9/27/2026"), "2026-09-27");
  assert.equal(sheetDateKey("2026-09-27"), "2026-09-27");
});

test("normalizes host case, hash, and trailing slash", () => {
  const canonical = "https://www.linkedin.com/jobs/view/9?trk=1";
  assert.equal(normalizeJobUrl("HTTPS://WWW.LinkedIn.com/jobs/view/9/?trk=1#apply"), canonical);
  assert.equal(normalizeJobUrl(` ${canonical}/ `), canonical);
  assert.equal(normalizeJobUrl("https://www.linkedin.com/"), "https://www.linkedin.com");
});

test("quotes sheet names", () => {
  assert.equal(sheetRange("Dominican Republic", "A2:F2"), "'Dominican Republic'!A2:F2");
  assert.equal(sheetRange("O'Hare", "A1:F1"), "'O''Hare'!A1:F1");
  assert.equal(startRowFromRange("'Dominican Republic'!A5:F9"), 5);
});

test("parse rejects a bad country or URL and drops client platform", () => {
  const badCountry = parseAddJobRequest({
    country: "argentina",
    jobs: [{ jobUrl: "https://www.linkedin.com/jobs/view/1" }],
  });
  assert.equal(badCountry.ok, false);

  const badUrl = parseAddJobRequest({
    country: "Argentina",
    jobs: [{ jobUrl: "javascript:alert(1)" }],
  });
  assert.equal(badUrl.ok, false);

  const parsed = parseAddJobRequest({
    country: "Colombia",
    jobs: [{ jobUrl: " https://www.linkedin.com/jobs/view/3 ", platform: "NotUsed" }],
  });
  assert.deepEqual(parsed, {
    ok: true,
    country: "Colombia",
    jobs: [{ jobUrl: "https://www.linkedin.com/jobs/view/3" }],
  });
});

test("plans the next A-F row with LinkedIn, No, and Day_Count", () => {
  const plan = planSheetWrites({
    country: "Argentina",
    today,
    jobs: [{ jobUrl: "https://WWW.LinkedIn.com/jobs/view/8/" }],
    existing: {
      startRow: 1,
      values: [
        ["No", "Date", "Day_Count", "Country", "Job_Platform", "Job_URL"],
        ["1", "2026/9/26", "4", "Argentina", "LinkedIn", "https://www.linkedin.com/jobs/view/1"],
        ["", "", "", "", "", ""],
        ["4", today, "1", "Argentina", "LinkedIn", "https://www.linkedin.com/jobs/view/4"],
      ],
    },
  });

  assert.equal(plan.added, 1);
  assert.equal(plan.skipped, 0);
  assert.deepEqual(plan.writes, [
    {
      rangeA1: "A5:F5",
      values: [[5, today, 2, "Argentina", "LinkedIn", "https://www.linkedin.com/jobs/view/8"]],
    },
  ]);
});

test("sheetHasJobUrl matches normalized URLs", () => {
  assert.equal(
    sheetHasJobUrl(
      {
        startRow: 1,
        values: [
          ["No", "Date", "Day_Count", "Country", "Job_Platform", "Job_URL"],
          ["1", "2026-09-27", "1", "Brazil", "LinkedIn", "https://www.linkedin.com/jobs/view/4"],
        ],
      },
      "https://WWW.LinkedIn.com/jobs/view/4/",
    ),
    true,
  );
  assert.equal(
    sheetHasJobUrl(
      {
        startRow: 1,
        values: [["No", "Date", "Day_Count", "Country", "Job_Platform", "Job_URL"]],
      },
      "https://www.linkedin.com/jobs/view/4",
    ),
    false,
  );
});

test("skips a duplicate URL on the same tab", () => {
  const plan = planSheetWrites({
    country: "Brazil",
    today,
    jobs: [{ jobUrl: "https://WWW.LinkedIn.com/jobs/view/4/" }],
    existing: {
      startRow: 1,
      values: [
        ["No", "Date", "Day_Count", "Country", "Job_Platform", "Job_URL"],
        ["4", today, "1", "Brazil", "LinkedIn", "https://www.linkedin.com/jobs/view/4"],
      ],
    },
  });
  assert.equal(plan.added, 0);
  assert.equal(plan.skipped, 1);
  assert.deepEqual(plan.writes, []);
});

test("toast text for add and duplicate", () => {
  assert.deepEqual(toastForSheetResult("Argentina", 1, 0), {
    text: "Added to Argentina",
    variant: "added",
  });
  assert.deepEqual(toastForSheetResult("Argentina", 0, 1), {
    text: "Already on sheet",
    variant: "duplicate",
  });
});
