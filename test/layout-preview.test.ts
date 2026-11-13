import assert from "node:assert/strict";
import { test } from "node:test";
import { previewOf } from "../src/layouts/layout-preview";
import type {
  SavedWindow,
  SavedWindowLayout,
} from "../src/layouts/saved-window-layouts.injectable";
import { subWindowId } from "./fake-lens";

const window = (id: string, title: string): SavedWindow => ({
  window: subWindowId(id),
  title,
  normalBounds: { x: 0, y: 0, width: 400, height: 300 },
  state: "normal",
  isFocused: false,
});

const screen = {
  label: "Built-in",
  isPrimary: true,
  bounds: { x: 0, y: 0, width: 1600, height: 1000 },
  workArea: { x: 0, y: 0, width: 1600, height: 800 },
};

const layout = (tiling?: SavedWindowLayout["tiling"]): SavedWindowLayout => ({
  name: "Work",
  savedAt: 0,
  windows: [
    window("a", "Logs"),
    window("b", "Pods"),
    window("c", "Preferences"),
  ],
  ...(tiling ? { tiling } : {}),
});

test("a layout's preview places its tiled windows in their screen's grid, in the screen's shape", () => {
  const preview = previewOf(
    layout({
      windows: [
        { index: 0, displayId: 1, column: 0, row: 0, columns: 2, rows: 3 },
        { index: 1, displayId: 1, columns: 1, rows: 1 },
        { index: 2, displayId: null, columns: 1, rows: 1 },
      ],
      columns: { "1": 3 },
      rows: { "1": 4 },
      screens: { "1": screen },
    }),
  );

  assert.deepEqual(preview, {
    screens: [
      {
        id: "1",
        label: "Built-in",
        missing: false,
        area: { x: 0, y: 0, width: 1600, height: 800 },
        columns: 3,
        rows: 4,
        windows: [
          {
            index: 0,
            title: "Logs",
            isOpen: true,
            isSaved: true,
            isApplicationWindow: false,
            column: 0,
            row: 0,
            columns: 2,
            rows: 3,
          },
          {
            index: 1,
            title: "Pods",
            isOpen: true,
            isSaved: true,
            isApplicationWindow: false,
            column: 2,
            row: 0,
            columns: 1,
            rows: 1,
          },
        ],
      },
    ],
    untiled: ["Preferences"],
    notOpen: 0,
    notSaved: 0,
  });
});

test("a layout's preview has as many rows as its windows need, more than it saved", () => {
  const [screen] = previewOf(
    layout({
      windows: [
        { index: 0, displayId: 1, column: 0, row: 0, columns: 1, rows: 6 },
        { index: 1, displayId: 1, column: 0, row: 6, columns: 1, rows: 4 },
      ],
      columns: { "1": 1 },
      rows: { "1": 2 },
    }),
  ).screens;

  assert.equal(screen.rows, 10);
  assert.deepEqual(screen.area, { x: 0, y: 0, width: 1600, height: 1000 });
});

test("a layout's preview keeps where each screen lies, so they are drawn side by side", () => {
  const right = {
    ...screen,
    label: "External",
    workArea: { x: 1600, y: -200, width: 2560, height: 1440 },
  };
  const preview = previewOf(
    layout({
      windows: [
        { index: 0, displayId: 1, columns: 1, rows: 1 },
        { index: 1, displayId: 2, columns: 1, rows: 1 },
      ],
      columns: { "1": 1, "2": 1 },
      rows: { "1": 1, "2": 1 },
      screens: { "1": screen, "2": right },
    }),
  );

  assert.deepEqual(
    preview.screens.map((it) => [it.label, it.area]),
    [
      ["Built-in", screen.workArea],
      ["External", right.workArea],
    ],
  );
});

test("a layout saved without a tiling previews every window as not tiled", () => {
  assert.deepEqual(previewOf(layout()), {
    screens: [],
    untiled: ["Logs", "Pods", "Preferences"],
    notOpen: 0,
    notSaved: 0,
  });
});

test("a layout's preview counts its windows not open, and marks the tiled ones", () => {
  const preview = previewOf(
    layout({
      windows: [
        { index: 0, displayId: 1, columns: 1, rows: 1 },
        { index: 1, displayId: 1, columns: 1, rows: 1 },
        { index: 2, displayId: null, columns: 1, rows: 1 },
      ],
      columns: { "1": 2 },
      rows: { "1": 1 },
    }),
    new Set([1, 2]),
  );

  assert.equal(preview.notOpen, 2);
  assert.deepEqual(
    preview.screens[0].windows.map((it) => [it.title, it.isOpen]),
    [
      ["Logs", true],
      ["Pods", false],
    ],
  );
});

test("a layout's preview tells which of its screens are not connected now", () => {
  const right = {
    ...screen,
    label: "External",
    workArea: { x: 1600, y: 0, width: 1600, height: 800 },
  };
  const preview = previewOf(
    layout({
      windows: [
        { index: 0, displayId: 1, columns: 1, rows: 1 },
        { index: 1, displayId: 2, columns: 1, rows: 1 },
      ],
      columns: { "1": 1, "2": 1 },
      rows: { "1": 1, "2": 1 },
      screens: { "1": screen, "2": right },
    }),
    new Set(),
    new Set(["2"]),
  );

  assert.deepEqual(
    preview.screens.map((it) => [it.label, it.missing]),
    [
      ["Built-in", false],
      ["External", true],
    ],
  );
});

test("a layout's preview counts and marks its windows open but not as it saved them", () => {
  const preview = previewOf(
    layout({
      windows: [
        { index: 0, displayId: 1, columns: 1, rows: 1 },
        { index: 1, displayId: 1, columns: 1, rows: 1 },
        { index: 2, displayId: 1, columns: 1, rows: 1 },
      ],
      columns: { "1": 3 },
      rows: { "1": 1 },
    }),
    // Preferences not open, and moved too, as a window not open cannot be: not open it is.
    new Set([2]),
    new Set(),
    new Set([1, 2]),
  );

  assert.equal(preview.notSaved, 1);
  assert.equal(preview.notOpen, 1);
  assert.deepEqual(
    preview.screens[0].windows.map((it) => [it.title, it.isOpen, it.isSaved]),
    [
      ["Logs", true, true],
      ["Pods", true, false],
      ["Preferences", false, true],
    ],
  );
});
