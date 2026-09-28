import { DEFAULT_COUNTRY, isCountry, type Country } from "../shared/countries.ts";

export const DEFAULT_API_BASE = "http://127.0.0.1:8787";

export type Settings = {
  country: Country;
  apiBase: string;
  extensionKey: string;
};

export async function loadCountry(): Promise<Country> {
  const data = await chrome.storage.sync.get("country");
  return isCountry(data.country) ? data.country : DEFAULT_COUNTRY;
}

export async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.sync.get(["country", "apiBase", "extensionKey"]);
  return {
    country: isCountry(data.country) ? data.country : DEFAULT_COUNTRY,
    apiBase: typeof data.apiBase === "string" ? data.apiBase.trim() : DEFAULT_API_BASE,
    extensionKey: typeof data.extensionKey === "string" ? data.extensionKey : "",
  };
}

export async function saveCountry(country: Country): Promise<void> {
  await chrome.storage.sync.set({ country });
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set(settings);
}

export function bindCountrySelect(select: HTMLSelectElement, current: HTMLElement): void {
  const paint = (country: Country) => {
    select.value = country;
    current.textContent = `Current country: ${country}`;
  };

  void loadCountry().then(paint);

  select.addEventListener("change", () => {
    const country = isCountry(select.value) ? select.value : DEFAULT_COUNTRY;
    paint(country);
    void saveCountry(country);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.country) return;
    const next = changes.country.newValue;
    if (isCountry(next) && next !== select.value) paint(next);
  });
}
