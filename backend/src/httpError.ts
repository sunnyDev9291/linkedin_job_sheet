export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function sanitizeError(message: string): string {
  if (/PRIVATE KEY|BEGIN [A-Z ]*PRIVATE KEY/i.test(message)) {
    return "Google Sheets request failed.";
  }
  if (/DECODER routines|1E08010C/i.test(message)) {
    return "Google service-account private key could not be read. Check GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.";
  }
  return message.slice(0, 400);
}
