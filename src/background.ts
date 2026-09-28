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

type CheckStatusMessage = {
  type?: string;
  jobUrl?: unknown;
  country?: unknown;
};

type TestConnectionMessage = {
  type?: string;
  apiBase?: unknown;
  extensionKey?: unknown;
};

type ToastResponse = { text: string; variant: ToastVariant; present?: boolean };

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.sync.get(["country", "apiBase"]).then((data) => {
    const patch: { country?: Country; apiBase?: string } = {};
    if (!isCountry(data.country)) patch.country = DEFAULT_COUNTRY;
    if (typeof data.apiBase !== "string") patch.apiBase = DEFAULT_API_BASE;
    if (patch.country || patch.apiBase) void chrome.storage.sync.set(patch);
  });
});

chrome.runtime.onMessage.addListener((message: AddJobMessage | CheckStatusMessage | TestConnectionMessage, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;
  if (message.type === "ADD_JOB_TO_SHEET") {
    void handleAdd(message as AddJobMessage).then(sendResponse);
    return true;
  }
  if (message.type === "CHECK_JOB_STATUS") {
    void handleCheck(message as CheckStatusMessage).then(sendResponse);
    return true;
  }
  if (message.type === "TEST_CONNECTION") {
    void handleTest(message as TestConnectionMessage).then(sendResponse);
    return true;
  }
  return;
});

async function handleTest(message: TestConnectionMessage): Promise<{ ok: boolean; text: string }> {
  const apiBase = typeof message.apiBase === "string" ? message.apiBase.trim() : "";
  const extensionKey = typeof message.extensionKey === "string" ? message.extensionKey : "";
  if (!apiBase) return { ok: false, text: "Set the API base first." };
  if (!extensionKey) return { ok: false, text: "Set the extension key first." };
  try {
    const response = await fetch(apiUrl(apiBase, "health"), {
      headers: { "X-Extension-Key": extensionKey },
    });
    const raw = await response.text();
    let payload: { ok?: boolean; message?: string; error?: string } | null = null;
    try {
      payload = JSON.parse(raw) as { ok?: boolean; message?: string; error?: string };
    } catch {
      payload = null;
    }
    if (response.ok && payload?.ok) {
      return { ok: true, text: payload.message || "Connected." };
    }
    const detail =
      (payload && typeof payload.error === "string" && payload.error.trim()) ||
      (raw.trim() ? raw.trim().slice(0, 200) : "") ||
      `Test failed (${response.status}).`;
    return { ok: false, text: detail };
  } catch (error) {
    if (error instanceof Error && /API base/i.test(error.message)) {
      return { ok: false, text: error.message };
    }
    return { ok: false, text: "Could not reach the API." };
  }
}

async function handleCheck(message: CheckStatusMessage): Promise<{ ok: boolean; present?: boolean; text?: string }> {
  try {
    const settings = await loadSettings();
    const country = isCountry(message.country) ? message.country : settings.country;
    const jobUrl = typeof message.jobUrl === "string" ? message.jobUrl.trim() : "";
    if (!jobUrl) return { ok: false, text: "This page has no URL." };
    if (!settings.extensionKey) return { ok: false, text: "Set the extension key in extension options." };
    if (!settings.apiBase) return { ok: false, text: "Set the API base in extension options." };

    const response = await fetch(apiUrl(settings.apiBase, "job-status"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Extension-Key": settings.extensionKey,
      },
      body: JSON.stringify({ country, jobUrl }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      present?: boolean;
      error?: string;
    } | null;
    if (response.status === 401) return { ok: false, text: "Extension key was rejected." };
    if (!response.ok || !payload || payload.ok !== true) {
      const error = payload && typeof payload.error === "string" ? payload.error : `Request failed (${response.status}).`;
      return { ok: false, text: error };
    }
    return { ok: true, present: Boolean(payload.present) };
  } catch {
    return { ok: false, text: "Could not reach the sheet API." };
  }
}

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
    const toast = toastForSheetResult(country, Number(payload.added) || 0, Number(payload.skipped) || 0);
    return {
      ...toast,
      present: Number(payload.added) > 0 || Number(payload.skipped) > 0,
    };
  } catch (error) {
    if (error instanceof Error && /API base|extension key|country/i.test(error.message)) {
      return { text: error.message, variant: "error" };
    }
    return { text: "Could not reach the sheet API.", variant: "error" };
  }
}
