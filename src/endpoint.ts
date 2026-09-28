import { JOB_PLATFORM } from "../shared/countries.ts";

export function addJobBody(country: string, jobUrl: string): {
  country: string;
  jobs: { jobUrl: string; platform: typeof JOB_PLATFORM }[];
} {
  return {
    country,
    jobs: [{ jobUrl, platform: JOB_PLATFORM }],
  };
}

export function apiUrl(apiBase: string, path: string): string {
  const trimmed = apiBase.trim();
  if (!trimmed) throw new Error("Set the API base in extension options.");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("API base must start with http:// or https://.");
  }
  const base = `${trimmed.replace(/\/+$/, "")}/`;
  return new URL(path.replace(/^\//, ""), base).toString();
}
