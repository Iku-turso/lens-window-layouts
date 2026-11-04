import {
  isApplicationWindow,
  type WindowId,
} from "@k8slens/messaging-contracts";
import type {
  DisplayRecord,
  WindowRecord,
  WindowReopening,
} from "@k8slens/window-layout-contracts";
import type {
  SavedTiling,
  SavedWindow,
} from "./saved-window-layouts.injectable";
import {
  keyOfWindow,
  toStoredScreen,
  windowsOfPlan,
  type ResolvedTilingPlan,
  type StoredTilingPlan,
} from "./tiling-plan";

// The screen connected now that most of the window's saved place is on, by its middle.
const screenOf = (saved: SavedWindow, displays: readonly DisplayRecord[]) => {
  const { x, y, width, height } = saved.normalBounds;
  const middle = { x: x + width / 2, y: y + height / 2 };

  return (
    displays.find((display) => {
      const bounds = display.bounds.get();

      return (
        middle.x >= bounds.x &&
        middle.x < bounds.x + bounds.width &&
        middle.y >= bounds.y &&
        middle.y < bounds.y + bounds.height
      );
    })?.id ?? null
  );
};

// The layout's tiling setup for the windows that stand for its windows now, each named by the
// window it went to. A window no open window stands for is kept by the id it had, as missing. One
// the setup does not have, as in a layout saved before setups had every window, or before there
// were setups, goes on the screen it was saved on, in the first free cell; one of those not open
// goes there as missing, or is left as it is when that screen is not connected.
export const toTilingPlan = (
  tiling: SavedTiling | undefined,
  saved: readonly SavedWindow[],
  windowOf: Map<SavedWindow, WindowId>,
  displays: readonly DisplayRecord[],
): StoredTilingPlan => {
  const keyOf = (index: number) => {
    const window = windowOf.get(saved[index]);

    // With the window's id, to ask Lens how to open it again once closed.
    const id = window ?? saved[index].window;
    const withId = isApplicationWindow(id) ? {} : { window: id };

    return window
      ? { key: keyOfWindow(window), title: saved[index].title, ...withId }
      : {
          key: `missing:${index}:${keyOfWindow(saved[index].window)}`,
          title: saved[index].title,
          ...withId,
        };
  };

  const inSetup = new Set(tiling?.windows.map((it) => it.index));

  // A window saved twice, as a layout saved before that was kept from, is the one window: its first.
  const firstOf = new Map<string, number>();

  saved.forEach((window, index) => {
    if (!firstOf.has(keyOfWindow(window.window))) {
      firstOf.set(keyOfWindow(window.window), index);
    }
  });

  const isFirst = (index: number) =>
    firstOf.get(keyOfWindow(saved[index].window)) === index;

  return {
    windows: [
      ...(tiling?.windows ?? []).flatMap(({ index, ...placement }) =>
        saved[index] && isFirst(index)
          ? [{ ...keyOf(index), ...placement }]
          : [],
      ),
      ...saved.flatMap((window, index) =>
        inSetup.has(index) || windowOf.has(window) || !isFirst(index)
          ? []
          : [
              {
                ...keyOf(index),
                displayId: screenOf(window, displays),
                columns: 1,
                rows: 1,
              },
            ],
      ),
    ],
    columns: tiling?.columns ?? {},
    rows: tiling?.rows ?? {},
    screens: tiling?.screens,
  };
};

// The layout's window a tile's key names, by the window's own key: a window missing from the start
// goes by its place in the layout too, but that place is the one it had when the layout was shown,
// and saving puts the windows in another order.
export const savedWindowOfKey = (
  windows: readonly SavedWindow[],
  key: string,
) => {
  const own = /^missing:\d+:(.*)$/s.exec(key)?.[1] ?? key;

  return windows.find((window) => keyOfWindow(window.window) === own);
};

export interface OpenWindow {
  readonly record: WindowRecord;
  readonly reopening: WindowReopening | undefined;
  // The key of the window of a layout it was opened again as, when it was.
  readonly standsFor?: string;
  // The windows it continues, opened again from, nearest first.
  readonly continues?: readonly string[];
}

type IsMatch = (open: OpenWindow, saved: SavedWindow) => boolean;

export const isSameWindow: IsMatch = (
  { record: { window: a } },
  { window: b },
) =>
  isApplicationWindow(a) || isApplicationWindow(b)
    ? a === b
    : a.kind === b.kind && a.id === b.id;

// The window was opened again as the saved one, however many times since.
export const isSameLineage: IsMatch = (open, saved) =>
  (open.standsFor !== undefined &&
    open.standsFor === keyOfWindow(saved.window)) ||
  !!open.continues?.includes(keyOfWindow(saved.window));

// Lens describes a window doing the same thing the same way, as a closed window opened again by hand.
export const isSameReopening: IsMatch = (open, saved) =>
  !!open.reopening &&
  !!saved.reopening &&
  JSON.stringify(open.reopening) === JSON.stringify(saved.reopening);

// Pairs each saved window not paired yet with an open window not taken yet, by the first match
// that finds one.
export const matchWindows = (
  saved: readonly SavedWindow[],
  open: readonly OpenWindow[],
  matches: Map<SavedWindow, WindowRecord>,
  isMatches: readonly IsMatch[],
) => {
  for (const isMatch of isMatches) {
    for (const savedWindow of saved) {
      if (matches.has(savedWindow)) {
        continue;
      }

      const taken = new Set(matches.values());
      const found = open.find(
        (it) => !taken.has(it.record) && isMatch(it, savedWindow),
      );

      if (found) {
        matches.set(savedWindow, found.record);
      }
    }
  }
};

// The tiling setup of the plan to save with a layout, each window named by its place in the
// layout's windows; a window of the plan the layout does not have is left out.
export const toSavedTiling = (
  plan: ResolvedTilingPlan,
  indexByKey: ReadonlyMap<string, number>,
): SavedTiling => ({
  windows: windowsOfPlan(plan).flatMap(
    ({ key, title: _title, ...placement }) => {
      const index = indexByKey.get(key);

      return index === undefined ? [] : [{ index, ...placement }];
    },
  ),
  columns: Object.fromEntries(
    plan.screens.map((screen) => [String(screen.display.id), screen.columns]),
  ),
  rows: Object.fromEntries(
    plan.screens.map((screen) => [String(screen.display.id), screen.rows]),
  ),
  screens: Object.fromEntries(
    plan.screens.map((screen) => [
      String(screen.display.id),
      toStoredScreen(screen.display),
    ]),
  ),
});

// The open windows standing for the layout's windows: the same window, or one doing the same. Not
// one merely of the same kind: most windows are tabs in windows of their own, whatever they show.
export const matchOpenWindows = (
  saved: readonly SavedWindow[],
  open: readonly OpenWindow[],
) => {
  const matches = new Map<SavedWindow, WindowRecord>();

  matchWindows(saved, open, matches, [
    isSameWindow,
    isSameLineage,
    isSameReopening,
  ]);

  return matches;
};
