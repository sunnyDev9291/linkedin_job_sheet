import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { COUNTRIES } from "../shared/countries.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function countryValues(html: string): string[] {
  const select = html.match(/<select\b[^>]*\bid="country"[\s\S]*?<\/select>/);
  assert.ok(select, "country select is missing");
  return [...select[0].matchAll(/\bvalue="([^"]+)"/g)].map((match) => match[1] ?? "");
}

test("popup and options both contain the country select", () => {
  const popup = read("src/popup.html");
  const options = read("src/options.html");
  assert.deepEqual(countryValues(popup), [...COUNTRIES]);
  assert.deepEqual(countryValues(options), [...COUNTRIES]);
  assert.match(popup, /value="Argentina"[^>]*selected|selected[^>]*value="Argentina"/);
  assert.match(options, /id="api-base"/);
  assert.match(options, /id="extension-key"/);
  assert.match(options, /id="test-connection"/);
  assert.match(read("src/popup.ts"), /bindCountrySelect/);
  assert.match(read("src/options.ts"), /bindCountrySelect/);
  assert.match(read("src/options.ts"), /test-connection/);
  assert.match(read("src/options.ts"), /TEST_CONNECTION/);
  assert.match(read("src/background.ts"), /TEST_CONNECTION/);
});

test("Add panel shows persistent status and can send the current URL", () => {
  const content = read("src/content.ts");
  assert.match(content, /ADD_JOB_TO_SHEET/);
  assert.match(content, /CHECK_JOB_STATUS/);
  assert.match(content, /location\.href\.split\("#"\)/);
  assert.match(content, /Not yet/);
  assert.match(content, /In sheet/);
  assert.match(content, /statusCache/);
  assert.match(content, /isTopFrame/);
  assert.match(content, /top:\s*16px/);
  assert.match(content, /right:\s*16px/);
  assert.doesNotMatch(content, /reduceChord/);
  assert.doesNotMatch(content, /refreshStatus\(true\)/);
  assert.match(read("src/background.ts"), /addJobBody/);
  assert.match(read("src/background.ts"), /job-status/);
  assert.match(read("src/background.ts"), /X-Extension-Key/);
  assert.match(read("manifest.json"), /"all_frames": false/);

  const writer = read("backend/src/googleSheets.ts");
  assert.match(writer, /spreadsheets\.values\.batchUpdate/);
  assert.match(writer, /valueInputOption: "USER_ENTERED"/);
  assert.doesNotMatch(writer, /INSERT_ROWS|insertDimension|values\.append|spreadsheets\.batchUpdate/);
});

test("extension sources do not choose a platform or carry the service-account key", () => {
  const files = [
    "src/content.ts",
    "src/background.ts",
    "src/endpoint.ts",
    "src/popup.ts",
    "src/options.ts",
    "shared/countries.ts",
    "shared/addJobs.ts",
    "shared/sheetLogic.ts",
    "backend/src/app.ts",
    "backend/src/googleSheets.ts",
    "backend/src/server.ts",
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /Built In|HiringCafe|Workable/);
    assert.doesNotMatch(source, /BEGIN PRIVATE KEY/);
  }
  const packaged = read("scripts/extensionFiles.mjs") + read("scripts/build.mjs");
  assert.match(packaged, /src\/popup\.html/);
  assert.match(packaged, /src\/options\.html/);
  assert.doesNotMatch(packaged, /backend|\.env/);
});
