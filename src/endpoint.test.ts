import assert from "node:assert/strict";
import { test } from "node:test";
import { JOB_PLATFORM } from "../shared/countries.ts";
import { addJobBody, apiUrl } from "./endpoint.ts";

test("the extension payload always sends LinkedIn", () => {
  assert.deepEqual(addJobBody("Argentina", "https://www.linkedin.com/jobs/view/1"), {
    country: "Argentina",
    jobs: [{ jobUrl: "https://www.linkedin.com/jobs/view/1", platform: "LinkedIn" }],
  });
  assert.equal(JOB_PLATFORM, "LinkedIn");
});

test("api url joins the configured base", () => {
  assert.equal(apiUrl("http://127.0.0.1:8787/", "/add-job"), "http://127.0.0.1:8787/add-job");
  assert.equal(apiUrl("https://jobs.example.com/api", "health"), "https://jobs.example.com/api/health");
  assert.throws(() => apiUrl("ftp://example.com", "health"), /http/);
});
