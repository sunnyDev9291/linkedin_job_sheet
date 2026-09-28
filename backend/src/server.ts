import dotenv from "dotenv";
import { createApp } from "./app.ts";
import { readConfig } from "./env.ts";
import { addJobsWithGoogle, checkGoogleConnection, checkJobWithGoogle } from "./googleSheets.ts";
import { HttpError } from "./httpError.ts";

dotenv.config({ path: "backend/.env" });
dotenv.config();

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer.");
}

const app = createApp({
  resolveKey() {
    const config = readConfig(process.env);
    if (!config.ok) throw new HttpError(500, config.error);
    return config.config.extensionKey;
  },
  addJob(input) {
    return addJobsWithGoogle(input);
  },
  jobStatus(input) {
    return checkJobWithGoogle(input);
  },
  health() {
    return checkGoogleConnection();
  },
});

app.listen(port, host, () => {
  console.log(`Job sheet API listening on http://${host}:${port}`);
});
