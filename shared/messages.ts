export type ToastVariant = "added" | "duplicate" | "error";

export function toastForSheetResult(
  country: string,
  added: number,
  skipped: number,
): { text: string; variant: ToastVariant } {
  if (added > 0) return { text: `Added to ${country}`, variant: "added" };
  if (skipped > 0) return { text: "Already on sheet", variant: "duplicate" };
  return { text: "Nothing was added.", variant: "error" };
}
