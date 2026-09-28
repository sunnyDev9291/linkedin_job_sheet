export const CHORD_WINDOW_MS = 800;

const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "CapsLock",
]);

export type ChordState = { armedAt: number | null };

export type KeySnapshot = {
  code: string;
  repeat: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  typing: boolean;
};

export type ChordAction = "ignore" | "arm" | "reset" | "add" | "pick-country";

export function isEditableEventTarget(path: EventTarget[]): boolean {
  for (const node of path) {
    if (typeof node !== "object" || node === null || !("tagName" in node)) continue;
    const tag = String((node as { tagName: string }).tagName).toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if ("isContentEditable" in node && Boolean((node as { isContentEditable?: boolean }).isContentEditable)) {
      return true;
    }
  }
  return false;
}

export function reduceChord(
  state: ChordState,
  key: KeySnapshot,
  now: number,
): { state: ChordState; action: ChordAction } {
  if (key.repeat) return { state, action: "ignore" };
  if (key.typing) return { state: { armedAt: null }, action: "ignore" };
  if (MODIFIER_CODES.has(key.code)) return { state, action: "ignore" };

  const commandModifier = key.ctrlKey || key.altKey || key.metaKey;
  if (key.code === "Space" && !commandModifier) {
    return { state: { armedAt: now }, action: "arm" };
  }

  const armed = state.armedAt !== null && now >= state.armedAt && now - state.armedAt <= CHORD_WINDOW_MS;
  if (key.code === "KeyM" && !commandModifier && armed) {
    return {
      state: { armedAt: null },
      action: key.shiftKey ? "pick-country" : "add",
    };
  }

  if (state.armedAt !== null) return { state: { armedAt: null }, action: "reset" };
  return { state, action: "ignore" };
}
