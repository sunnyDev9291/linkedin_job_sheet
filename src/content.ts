import { COUNTRIES, type Country } from "../shared/countries.ts";
import { loadCountry } from "./storage.ts";

type StatusKind = "loading" | "present" | "missing" | "error";

const OVERLAY_CSS = `
  :host {
    all: initial !important;
    position: fixed !important;
    top: 16px !important;
    right: 16px !important;
    z-index: 2147483647 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-end !important;
    gap: 8px !important;
    width: auto !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    pointer-events: none !important;
    overflow: visible !important;
  }
  .panel, .picker {
    pointer-events: auto;
    box-sizing: border-box;
    font-family: "Segoe UI", sans-serif;
    color: #1d1a16;
  }
  .panel {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    min-width: 148px;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid #d9d1c3;
    background: #fffdf8;
    box-shadow: 0 8px 24px rgba(40, 32, 20, 0.18);
  }
  .status {
    margin: 0;
    padding: 6px 8px;
    border-radius: 8px;
    font: 650 12px/1.3 "Segoe UI", sans-serif;
    text-align: center;
  }
  .status.loading { background: #f3eee6; color: #5c5346; }
  .status.present { background: #e7f6ef; color: #0c5c45; }
  .status.missing { background: #fff6e8; color: #8a5a00; }
  .status.error { background: #fdecea; color: #8f1d1d; cursor: pointer; }
  .add {
    margin: 0;
    padding: 10px 16px;
    border: 1px solid #0f6b4c;
    border-radius: 10px;
    background: #12805c;
    color: #fff;
    font: 650 13px/1.2 "Segoe UI", sans-serif;
    letter-spacing: 0.01em;
    cursor: pointer;
  }
  .add:hover, .add:focus {
    background: #0f6b4c;
    outline: none;
  }
  .add:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .add.hidden { display: none; }
  .picker {
    width: 220px;
    padding: 8px;
    border-radius: 10px;
    border: 1px solid #e4dccd;
    background: #fffdf8;
    box-shadow: 0 8px 24px rgba(40, 32, 20, 0.16);
  }
  .picker-title {
    margin: 2px 6px 6px;
    font-size: 12px;
    font-weight: 650;
  }
  .picker button {
    display: block;
    width: 100%;
    margin: 0;
    padding: 7px 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: inherit;
    font: 13px/1.3 "Segoe UI", sans-serif;
    text-align: left;
    cursor: pointer;
  }
  .picker button:hover, .picker button:focus { background: #f3eee6; outline: none; }
  .picker button.saved { background: #e7f6ef; }
`;

const HOST_STYLE = [
  "all: initial",
  "position: fixed",
  "top: 16px",
  "right: 16px",
  "z-index: 2147483647",
  "display: flex",
  "flex-direction: column",
  "align-items: flex-end",
  "gap: 8px",
  "width: auto",
  "height: auto",
  "margin: 0",
  "padding: 0",
  "border: 0",
  "background: transparent",
  "pointer-events: none",
  "overflow: visible",
].join(";");

/** Per-tab session cache: successful checks are not repeated when switching back. */
const statusCache = new Map<string, "present" | "missing">();

let closeOpenPicker: (() => void) | null = null;
let adding = false;
let watching = false;
let activeKey = "";
let statusKind: StatusKind = "loading";
let checkSeq = 0;
let watchedUrl = "";

// Only the top frame may show the panel (avoids duplicate dialogs in iframes).
if (isTopFrame() && canUseExtensionApis()) {
  mount();
}

function isTopFrame(): boolean {
  try {
    return window === window.top;
  } catch {
    return false;
  }
}

function canUseExtensionApis(): boolean {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id) && typeof chrome.runtime.sendMessage === "function";
  } catch {
    return false;
  }
}

function pageUrl(): string {
  return location.href.split("#")[0];
}

function statusKey(country: Country, url: string): string {
  return `${country}|${url}`;
}

function mount(): void {
  removeStaleHosts();
  ensurePanel();
  watchForRemoval();
  watchedUrl = pageUrl();
  void syncStatus();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.country) return;
    void syncStatus();
  });

  // Switching back to this tab must reuse the cached status, not re-hit the API.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void syncStatus();
  });

  // SPA navigations: check a new URL once; returning to a cached URL paints from cache.
  window.setInterval(() => {
    const url = pageUrl();
    if (url === watchedUrl) return;
    watchedUrl = url;
    void syncStatus();
  }, 800);
}

function removeStaleHosts(): void {
  const hosts = document.querySelectorAll("#linkedin-job-sheet-host");
  hosts.forEach((host, index) => {
    if (index > 0) host.remove();
  });
}

function watchForRemoval(): void {
  if (watching) return;
  watching = true;
  const observer = new MutationObserver(() => {
    removeStaleHosts();
    if (!document.getElementById("linkedin-job-sheet-host")) {
      ensurePanel();
      paintStatus();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function ensurePanel(): { status: HTMLElement; add: HTMLButtonElement } {
  const shadow = ensureShadow();
  let panel = shadow.querySelector<HTMLElement>(".panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "panel";
    shadow.appendChild(panel);
  }
  let status = panel.querySelector<HTMLElement>(".status");
  if (!status) {
    status = document.createElement("p");
    status.className = "status loading";
    status.setAttribute("role", "status");
    status.textContent = "Checking…";
    status.addEventListener("click", () => {
      if (statusKind !== "error") return;
      void recheckCurrent();
    });
    panel.appendChild(status);
  }
  let add = panel.querySelector<HTMLButtonElement>(".add");
  if (!add) {
    add = document.createElement("button");
    add.type = "button";
    add.className = "add";
    add.textContent = "Add";
    add.title = "Add this page to the sheet. Hold Shift and click to pick a country first.";
    add.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void run(event.shiftKey ? "pick-country" : "add");
    });
    panel.appendChild(add);
  }
  return { status, add };
}

function paintStatus(): void {
  const { status, add } = ensurePanel();
  status.className = `status ${statusKind}`;
  status.title = statusKind === "error" ? "Click to recheck" : "";
  if (statusKind === "loading") {
    status.textContent = "Checking…";
    add.disabled = true;
    add.classList.remove("hidden");
    return;
  }
  if (statusKind === "present") {
    status.textContent = "In sheet";
    add.disabled = true;
    add.classList.add("hidden");
    return;
  }
  if (statusKind === "missing") {
    status.textContent = "Not yet";
    add.disabled = adding;
    add.classList.remove("hidden");
    return;
  }
  status.textContent = "Status unavailable";
  add.disabled = adding;
  add.classList.remove("hidden");
}

/** Show cached status for this tab's current URL, or check once if never checked. */
async function syncStatus(): Promise<void> {
  if (!canUseExtensionApis()) return;
  const url = pageUrl();
  const country = await loadCountry();
  const key = statusKey(country, url);
  activeKey = key;

  const cached = statusCache.get(key);
  if (cached) {
    statusKind = cached;
    paintStatus();
    return;
  }

  await fetchStatus(key, country, url);
}

async function recheckCurrent(): Promise<void> {
  const url = pageUrl();
  const country = await loadCountry();
  const key = statusKey(country, url);
  statusCache.delete(key);
  activeKey = key;
  await fetchStatus(key, country, url);
}

async function fetchStatus(key: string, country: Country, url: string): Promise<void> {
  const seq = ++checkSeq;
  statusKind = "loading";
  paintStatus();
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "CHECK_JOB_STATUS",
      jobUrl: url,
      country,
    })) as { ok?: boolean; present?: boolean; text?: string } | undefined;

    // Ignore stale responses from a previous URL/country or an older in-flight check.
    if (seq !== checkSeq || key !== activeKey) return;

    if (!response?.ok) {
      statusKind = "error";
      paintStatus();
      return;
    }
    const kind = response.present ? "present" : "missing";
    statusCache.set(key, kind);
    statusKind = kind;
    paintStatus();
  } catch {
    if (seq !== checkSeq || key !== activeKey) return;
    statusKind = "error";
    paintStatus();
  }
}

async function run(action: "add" | "pick-country"): Promise<void> {
  if (adding || statusKind === "present") return;
  adding = true;
  paintStatus();
  try {
    let country: Country | undefined;
    if (action === "pick-country") {
      const picked = await openCountryPicker(await loadCountry());
      if (!picked) return;
      country = picked;
    }
    if (!canUseExtensionApis()) {
      statusKind = "error";
      paintStatus();
      return;
    }
    const url = pageUrl();
    const response = (await chrome.runtime.sendMessage({
      type: "ADD_JOB_TO_SHEET",
      jobUrl: url,
      pageTitle: document.title,
      country,
    })) as { text?: string; variant?: string; present?: boolean } | undefined;
    if (!response || typeof response.text !== "string") {
      statusKind = "error";
      paintStatus();
      return;
    }
    if (response.variant === "added" || response.variant === "duplicate" || response.present) {
      const resolvedCountry = country ?? (await loadCountry());
      const key = statusKey(resolvedCountry, url);
      statusCache.set(key, "present");
      activeKey = key;
      statusKind = "present";
      paintStatus();
      return;
    }
    statusKind = "error";
    paintStatus();
  } catch {
    statusKind = "error";
    paintStatus();
  } finally {
    adding = false;
    paintStatus();
  }
}

function ensureShadow(): ShadowRoot {
  removeStaleHosts();
  const existing = document.getElementById("linkedin-job-sheet-host");
  if (existing?.shadowRoot) {
    existing.setAttribute("style", HOST_STYLE);
    return existing.shadowRoot;
  }
  existing?.remove();
  const host = document.createElement("div");
  host.id = "linkedin-job-sheet-host";
  host.setAttribute("style", HOST_STYLE);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = OVERLAY_CSS;
  shadow.appendChild(style);
  (document.documentElement || document.body).appendChild(host);
  return shadow;
}

function openCountryPicker(saved: Country): Promise<Country | null> {
  closeOpenPicker?.();
  return new Promise((resolve) => {
    const shadow = ensureShadow();
    ensurePanel();
    const picker = document.createElement("div");
    picker.className = "picker";
    const title = document.createElement("div");
    title.className = "picker-title";
    title.textContent = "Add to";
    picker.appendChild(title);

    let settled = false;
    const token = () => finish(null);
    const finish = (value: Country | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
      picker.remove();
      if (closeOpenPicker === token) closeOpenPicker = null;
      resolve(value);
    };
    closeOpenPicker = token;

    let savedButton: HTMLButtonElement | null = null;
    for (const country of COUNTRIES) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = country;
      if (country === saved) {
        button.className = "saved";
        savedButton = button;
      }
      button.addEventListener("click", () => finish(country));
      picker.appendChild(button);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    }

    function onPointer(event: Event) {
      if (!event.composedPath().includes(picker)) finish(null);
    }

    const panel = shadow.querySelector(".panel");
    if (panel?.nextSibling) {
      shadow.insertBefore(picker, panel.nextSibling);
    } else {
      shadow.appendChild(picker);
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    savedButton?.focus({ preventScroll: true });
  });
}
