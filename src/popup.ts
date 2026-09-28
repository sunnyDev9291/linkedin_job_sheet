import { bindCountrySelect } from "./storage.ts";

const select = document.querySelector<HTMLSelectElement>("#country");
const current = document.querySelector<HTMLElement>("#current");
const optionsButton = document.querySelector<HTMLButtonElement>("#open-options");

if (!select || !current || !optionsButton) {
  throw new Error("Popup is missing its country select.");
}

bindCountrySelect(select, current);

optionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
