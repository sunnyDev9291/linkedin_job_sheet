import { COUNTRIES, type Country } from "../shared/countries.ts";
import { isEditableEventTarget, reduceChord, type ChordState } from "./chord.ts";
import { loadCountry } from "./storage.ts";

const OVERLAY_CSS = `
  :host {
    all: initial;
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    pointer-events: none;
  }
  .toast, .picker {
    pointer-events: auto;
    box-sizing: border-box;
    font-family: "Segoe UI", sans-serif;
    color: #1d1a16;
  }
  .toast {
    max-width: 280px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid #d9d1c3;
    background: #fffdf8;
    box-shadow: 0 8px 24px rgba(40, 32, 20, 0.16);
    font-size: 13px;
    line-height: 1.4;
  }
  .toast.added { background: #e7f6ef; border-color: #b7e0cc; color: #0c5c45; }
  .toast.duplicate { background: #fff6e8; border-color: #f0d7a8; color: #8a5a00; }
  .toast.error { background: #fdecea; border-color: #f3c1c1; color: #8f1d1d; }
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

let chord: ChordState = { armedAt: null };
let closeOpenPicker: (() => void) | null = null;
let toastTimer = 0;

document.addEventListener(
  "keydown",
  (event) => {
    if (closeOpenPicker) return;
    const decision = reduceChord(
      chord,
      {
        code: event.code,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        typing: isEditableEventTarget(event.composedPath()),
      },
      Date.now(),
    );
    chord = decision.state;
    if (decision.action !== "add" && decision.action !== "pick-country") return;
    event.preventDefault();
    event.stopPropagation();
    void run(decision.action);
  },
  true,
);

async function run(action: "add" | "pick-country"): Promise<void> {
  try {
    let country: Country | undefined;
    if (action === "pick-country") {
      const picked = await openCountryPicker(await loadCountry());
      if (!picked) return;
      country = picked;
    }
    const response = (await chrome.runtime.sendMessage({
      type: "ADD_JOB_TO_SHEET",
      jobUrl: location.href.split("#")[0],
      pageTitle: document.title,
      country,
    })) as { text?: string; variant?: string } | undefined;
    if (!response || typeof response.text !== "string") {
      showToast("Could not add this job.", "error");
      return;
    }
    const variant = response.variant === "added" || response.variant === "duplicate" ? response.variant : "error";
    showToast(response.text, variant);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add this job.";
    showToast(message, "error");
  }
}

function ensureShadow(): ShadowRoot {
  const existing = document.getElementById("linkedin-job-sheet-host");
  if (existing?.shadowRoot) return existing.shadowRoot;
  const host = document.createElement("div");
  host.id = "linkedin-job-sheet-host";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = OVERLAY_CSS;
  shadow.appendChild(style);
  document.documentElement.appendChild(host);
  return shadow;
}

function showToast(text: string, variant: "added" | "duplicate" | "error"): void {
  const shadow = ensureShadow();
  let toast = shadow.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    shadow.appendChild(toast);
  }
  toast.className = `toast ${variant}`;
  toast.textContent = text;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.remove(), 3600);
}

function openCountryPicker(saved: Country): Promise<Country | null> {
  closeOpenPicker?.();
  return new Promise((resolve) => {
    const shadow = ensureShadow();
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
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onPointer(event: Event) {
      if (!event.composedPath().includes(picker)) finish(null);
    }

    shadow.insertBefore(picker, shadow.querySelector(".toast"));
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    savedButton?.focus({ preventScroll: true });
  });
}
