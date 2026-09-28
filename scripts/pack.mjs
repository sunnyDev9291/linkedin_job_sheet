import { spawnSync } from "node:child_process";
import path from "node:path";

const build = spawnSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const destination = path.resolve("linkedin-job-sheet.zip");
const source = path.resolve("build/extension");
const quote = (value) => value.replaceAll("'", "''");
const command = [
  `if (Test-Path '${quote(destination)}') { Remove-Item -Force '${quote(destination)}' }`,
  `Compress-Archive -Path (Join-Path '${quote(source)}' '*') -DestinationPath '${quote(destination)}' -Force`,
].join("; ");

const zip = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-Command", command],
  { stdio: "inherit" },
);
if (zip.status !== 0) process.exit(zip.status ?? 1);
console.log(`Wrote ${destination}`);
