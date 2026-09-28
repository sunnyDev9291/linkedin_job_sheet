import { isCountry, type Country } from "../shared/countries.ts";
import { bindCountrySelect, loadSettings, saveSettings } from "./storage.ts";

const select = document.querySelector<HTMLSelectElement>("#country");
const current = document.querySelector<HTMLElement>("#current");
const apiBaseInput = document.querySelector<HTMLInputElement>("#api-base");
const keyInput = document.querySelector<HTMLInputElement>("#extension-key");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const testButton = document.querySelector<HTMLButtonElement>("#test-connection");
const result = document.querySelector<HTMLElement>("#test-result");

if (!select || !current || !apiBaseInput || !keyInput || !saveButton || !testButton || !result) {
  throw new Error("Options page is missing a required field.");
}

bindCountrySelect(select, current);

void loadSettings().then((settings) => {
  apiBaseInput.value = settings.apiBase;
  keyInput.value = settings.extensionKey;
});

saveButton.addEventListener("click", () => {
  void persist("Saved.");
});

testButton.addEventListener("click", () => {
  void testConnection();
});

async function persist(status: string): Promise<SettingsSnapshot> {
  const country: Country = isCountry(select!.value) ? select!.value : "Argentina";
  const settings = {
    country,
    apiBase: apiBaseInput!.value.trim(),
    extensionKey: keyInput!.value,
  };
  await saveSettings(settings);
  result!.textContent = status;
  return settings;
}

type SettingsSnapshot = {
  country: Country;
  apiBase: string;
  extensionKey: string;
};

async function testConnection(): Promise<void> {
  const settings = await persist("Testing…");
  if (!settings.apiBase) {
    result!.textContent = "Set the API base first.";
    return;
  }
  if (!settings.extensionKey) {
    result!.textContent = "Set the extension key first.";
    return;
  }
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "TEST_CONNECTION",
      apiBase: settings.apiBase,
      extensionKey: settings.extensionKey,
    })) as { ok?: boolean; text?: string } | undefined;
    result!.textContent = response?.text || "Test failed.";
  } catch {
    result!.textContent = "Could not reach the API.";
  }
}
