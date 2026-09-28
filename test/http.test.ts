import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { addJobsToCountry, type SheetIo, type ValueUpdate } from "../shared/addJobs.ts";
import { startRowFromRange } from "../shared/sheetLogic.ts";
import { createApp, type AppDeps } from "../backend/src/app.ts";
import { HttpError } from "../backend/src/httpError.ts";

const now = new Date("2026-09-27T15:00:00.000Z");

function memoryIo(): SheetIo {
  const rows = new Map<number, (string | number)[]>();
  return {
    async read() {
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
        rows.set(startRowFromRange(range.range), range.values[0] ?? []);
      }
    },
  };
}

async function withServer(deps: AppDeps, run: (base: string) => Promise<void>): Promise<void> {
  const server: Server = createServer(createApp(deps));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function deps(sheet: SheetIo): AppDeps {
  return {
    resolveKey: () => "secret",
    addJob: (input) => addJobsToCountry(sheet, { ...input, now }),
    health: async () => "Connected to Jobs.",
  };
}

async function post(base: string, body: unknown, key = "secret"): Promise<Response> {
  return fetch(`${base}/add-job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Extension-Key": key,
    },
    body: JSON.stringify(body),
  });
}

test("add-job writes LinkedIn once and skips the duplicate URL", async () => {
  const sheet = memoryIo();
  await withServer(deps(sheet), async (base) => {
    const job = {
      country: "Argentina",
      jobs: [{ jobUrl: "https://WWW.LinkedIn.com/jobs/view/42/", platform: "NotUsed" }],
    };
    const created = await post(base, job);
    assert.equal(created.status, 200);
    assert.deepEqual(await created.json(), {
      ok: true,
      added: 1,
      skipped: 0,
      message: "Added 1 job to Argentina.",
    });

    const duplicate = await post(base, {
      country: "Argentina",
      jobs: [{ jobUrl: "https://www.linkedin.com/jobs/view/42" }],
    });
    assert.equal(duplicate.status, 200);
    assert.deepEqual(await duplicate.json(), {
      ok: true,
      added: 0,
      skipped: 1,
      message: "URL already on Argentina sheet.",
    });
  });
});

test("bad key, country, and URL are rejected", async () => {
  await withServer(deps(memoryIo()), async (base) => {
    const unauthorized = await post(base, { country: "Argentina", jobs: [{ jobUrl: "https://example.com/a" }] }, "nope");
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { ok: false, error: "Invalid extension key." });

    const badCountry = await post(base, { country: "Chile", jobs: [{ jobUrl: "https://example.com/a" }] });
    assert.equal(badCountry.status, 400);
    const countryBody = (await badCountry.json()) as { ok: boolean; error: string };
    assert.equal(countryBody.ok, false);
    assert.match(countryBody.error, /Country must be one of/);

    const badUrl = await post(base, { country: "Other", jobs: [{ jobUrl: "not a url" }] });
    assert.equal(badUrl.status, 400);
    assert.deepEqual(await badUrl.json(), { ok: false, error: "Each job needs an http(s) jobUrl." });

    const health = await fetch(`${base}/health`, { headers: { "X-Extension-Key": "secret" } });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, message: "Connected to Jobs." });
  });
});

test("missing server configuration is not reported as a bad key", async () => {
  await withServer(
    {
      resolveKey() {
        throw new HttpError(500, "Server is missing EXTENSION_API_KEY.");
      },
      addJob: async () => {
        throw new Error("unused");
      },
      health: async () => "unused",
    },
    async (base) => {
      const response = await fetch(`${base}/health`);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "Server is missing EXTENSION_API_KEY.",
      });
    },
  );
});
