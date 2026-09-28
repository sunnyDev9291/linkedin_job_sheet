export const COUNTRIES = [
  "Brazil",
  "Argentina",
  "Colombia",
  "Dominican Republic",
] as const;

export type Country = (typeof COUNTRIES)[number];

export const DEFAULT_COUNTRY: Country = "Argentina";

export const JOB_PLATFORM = "LinkedIn";

export function isCountry(value: unknown): value is Country {
  return typeof value === "string" && (COUNTRIES as readonly string[]).includes(value);
}
