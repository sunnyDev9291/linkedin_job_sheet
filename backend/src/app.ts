import express from "express";
import { keysMatch } from "./env.ts";
import { HttpError, sanitizeError } from "./httpError.ts";
import { parseAddJobRequest } from "../../shared/sheetLogic.ts";
import type { Country } from "../../shared/countries.ts";

export type AddJobResult = {
  added: number;
  skipped: number;
  message: string;
};

export type AppDeps = {
  resolveKey(): string;
  addJob(input: { country: Country; jobs: { jobUrl: string }[] }): Promise<AddJobResult>;
  health(): Promise<string>;
};

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", async (req, res) => {
    try {
      if (!allow(req, res, deps)) return;
      const message = await deps.health();
      res.json({ ok: true, message });
    } catch (error) {
      respondError(res, error);
    }
  });

  app.post("/add-job", async (req, res) => {
    try {
      if (!allow(req, res, deps)) return;
      const parsed = parseAddJobRequest(req.body);
      if (!parsed.ok) {
        res.status(400).json({ ok: false, error: parsed.error });
        return;
      }
      const result = await deps.addJob({ country: parsed.country, jobs: parsed.jobs });
      res.json({
        ok: true,
        added: result.added,
        skipped: result.skipped,
        message: result.message,
      });
    } catch (error) {
      respondError(res, error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ ok: false, error: "Request body must be JSON." });
      return;
    }
    respondError(res, error);
  });

  return app;
}

function allow(req: express.Request, res: express.Response, deps: AppDeps): boolean {
  let expected: string;
  try {
    expected = deps.resolveKey();
  } catch (error) {
    respondError(res, error);
    return false;
  }
  const provided = req.header("x-extension-key") ?? "";
  if (!keysMatch(provided, expected)) {
    res.status(401).json({ ok: false, error: "Invalid extension key." });
    return false;
  }
  return true;
}

function respondError(res: express.Response, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ ok: false, error: sanitizeError(error.message) });
    return;
  }
  const message = error instanceof Error ? error.message : "Request failed.";
  res.status(500).json({ ok: false, error: sanitizeError(message) });
}
