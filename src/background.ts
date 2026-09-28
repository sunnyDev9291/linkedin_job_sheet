import { DEFAULT_COUNTRY, isCountry, type Country } from "../shared/countries.ts";
import { toastForSheetResult, type ToastVariant } from "../shared/messages.ts";
import { addJobBody, apiUrl } from "./endpoint.ts";
import { DEFAULT_API_BASE, loadSettings } from "./storage.ts";

type AddJobMessage = {
  type?: string;
  jobUrl?: unknown;
  pageTitle?: unknown;
  country?: unknown;
};

type ToastResponse = { text: string; variant: ToastVariant };

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.sync.get(["country", "apiBase"]).then((data) => {
    const patch: { country?: Country; apiBase?: string } = {};
    if (!isCountry(data.country)) patch.country = DEFAULT_COUNTRY;
    if (typeof data.apiBase !== "string") patch.apiBase = DEFAULT_API_BASE;
    if (patch.country || patch.apiBase) void chrome.storage.sync.set(patch);
  });
});

chrome.runtime.onMessage.addListener((message: AddJobMessage, _sender, sendResponse) => {
  if (!message || message.type !== "ADD_JOB_TO_SHEET") return;
  void handleAdd(message).then(sendResponse);
  return true;
});

async function handleAdd(message: AddJobMessage): Promise<ToastResponse> {
  try {
    const settings = await loadSettings();
    const country = isCountry(message.country) ? message.country : settings.country;
    const jobUrl = typeof message.jobUrl === "string" ? message.jobUrl.trim() : "";
    if (!jobUrl) return { text: "This page has no URL to save.", variant: "error" };
    if (!settings.extensionKey) return { text: "Set the extension key in extension options.", variant: "error" };
    if (!settings.apiBase) return { text: "Set the API base in extension options.", variant: "error" };

    const response = await fetch(apiUrl(settings.apiBase, "add-job"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Extension-Key": settings.extensionKey,
      },
      body: JSON.stringify(addJobBody(country, jobUrl)),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      added?: number;
      skipped?: number;
      error?: string;
    } | null;

    if (response.status === 401) return { text: "Extension key was rejected.", variant: "error" };
    if (!response.ok || !payload || payload.ok !== true) {
      const error = payload && typeof payload.error === "string" ? payload.error : `Request failed (${response.status}).`;
      return { text: error, variant: "error" };
    }
    return toastForSheetResult(country, Number(payload.added) || 0, Number(payload.skipped) || 0);
  } catch (error) {
    if (error instanceof Error && /API base|extension key|country/i.test(error.message)) {
      return { text: error.message, variant: "error" };
    }
    return { text: "Could not reach the sheet API.", variant: "error" };
  }
}
