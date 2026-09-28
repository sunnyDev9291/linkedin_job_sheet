import assert from "node:assert/strict";
import { test } from "node:test";
import { keysMatch, normalizePrivateKey, readConfig } from "./env.ts";
import { sanitizeError } from "./httpError.ts";

test("normalizes escaped private-key newlines", () => {
  const key = normalizePrivateKey('"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"');
  assert.equal(key, "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n");
});

test("key compare rejects a different length without throwing", () => {
  assert.equal(keysMatch("secret", "secret"), true);
  assert.equal(keysMatch("secret", "secrets"), false);
  assert.equal(keysMatch("", "secret"), false);
});

test("openssl private-key failures stay out of the API response", () => {
  assert.equal(
    sanitizeError("error:1E08010C:DECODER routines::unsupported"),
    "Google service-account private key could not be read. Check GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
  );
});

test("config reports every missing variable", () => {
  const result = readConfig({});
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /GOOGLE_SERVICE_ACCOUNT_EMAIL/);
  assert.match(result.error, /GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
  assert.match(result.error, /GOOGLE_SHEETS_SPREADSHEET_ID/);
  assert.match(result.error, /EXTENSION_API_KEY/);
});
