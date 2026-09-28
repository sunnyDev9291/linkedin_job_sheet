import assert from "node:assert/strict";
import { test } from "node:test";
import { CHORD_WINDOW_MS, isEditableEventTarget, reduceChord, type ChordState, type KeySnapshot } from "./chord.ts";

function key(overrides: Partial<KeySnapshot> = {}): KeySnapshot {
  return {
    code: "KeyA",
    repeat: false,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    typing: false,
    ...overrides,
  };
}

test("Space then M within 800ms adds the job", () => {
  assert.equal(CHORD_WINDOW_MS, 800);
  const armed = reduceChord({ armedAt: null }, key({ code: "Space" }), 1_000);
  assert.equal(armed.action, "arm");
  const fired = reduceChord(armed.state, key({ code: "KeyM" }), 1_800);
  assert.equal(fired.action, "add");
  assert.equal(fired.state.armedAt, null);
});

test("M after the window does not add", () => {
  const armed = reduceChord({ armedAt: null }, key({ code: "Space" }), 1_000);
  const fired = reduceChord(armed.state, key({ code: "KeyM" }), 1_801);
  assert.equal(fired.action, "reset");
});

test("Shift on M opens the country picker and Shift alone does not cancel the chord", () => {
  let state: ChordState = { armedAt: null };
  state = reduceChord(state, key({ code: "Space", shiftKey: true }), 0).state;
  state = reduceChord(state, key({ code: "ShiftLeft" }), 100).state;
  const fired = reduceChord(state, key({ code: "KeyM", shiftKey: true }), 200);
  assert.equal(fired.action, "pick-country");
});

test("typing targets and command modifiers do not fire the chord", () => {
  const typing = reduceChord({ armedAt: 0 }, key({ code: "KeyM", typing: true }), 100);
  assert.equal(typing.action, "ignore");
  assert.equal(typing.state.armedAt, null);

  const armed = reduceChord({ armedAt: null }, key({ code: "Space" }), 0);
  const modified = reduceChord(armed.state, key({ code: "KeyM", ctrlKey: true }), 100);
  assert.equal(modified.action, "reset");

  assert.equal(isEditableEventTarget([{ tagName: "INPUT" } as unknown as EventTarget]), true);
  assert.equal(isEditableEventTarget([{ tagName: "TEXTAREA" } as unknown as EventTarget]), true);
  assert.equal(isEditableEventTarget([{ tagName: "SELECT" } as unknown as EventTarget]), true);
  assert.equal(isEditableEventTarget([{ tagName: "DIV", isContentEditable: true } as unknown as EventTarget]), true);
  assert.equal(isEditableEventTarget([{ tagName: "DIV" } as unknown as EventTarget]), false);
});

test("M alone and a repeated Space do not fire", () => {
  assert.equal(reduceChord({ armedAt: null }, key({ code: "KeyM" }), 0).action, "ignore");
  const armed = reduceChord({ armedAt: null }, key({ code: "Space" }), 10);
  const repeated = reduceChord(armed.state, key({ code: "Space", repeat: true }), 40);
  assert.equal(repeated.action, "ignore");
  assert.equal(repeated.state.armedAt, 10);
});
