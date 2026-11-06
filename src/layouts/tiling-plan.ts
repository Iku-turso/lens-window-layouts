import {
  applicationWindowId,
  isApplicationWindow,
  type WindowId,
} from "@k8slens/messaging-contracts";
import type {
  DisplayRecord,
  WindowBounds,
  WindowRecord,
} from "@k8slens/window-layout-contracts";
import { columnsFor } from "./grid";

// How a window is tiled, as the user arranged it: on which screen, or on none to leave it as it is,
// from which cell of the screen's grid, and how many cells it spans.
export interface StoredPlanWindow {
  readonly key: string;
  readonly displayId: number | null;
  // The title of the window, to show it as missing once it is not open; missing from plans kept
  // before windows were kept with their titles.
  readonly title?: string;
  // The window's id while it was open, to ask Lens how to open it again once closed; missing from
  // plans kept before, and for a window being opened in a cell, which has none yet.
  readonly window?: WindowId;
  // Missing from plans kept before windows had cells of their own.
  readonly column?: number;
  readonly row?: number;
  readonly columns: number;
  readonly rows: number;
}

// What a plan keeps of a screen, to show it when it is not connected.
export interface StoredPlanScreen {
  readonly label: string;
  readonly isPrimary: boolean;
  readonly bounds: WindowBounds;
  readonly workArea: WindowBounds;
}

// The tiling the user arranged: the windows, the earlier ones getting their cells first where two
// want the same, and the columns and rows of the screens' grids. Kept by window and screen, so what is not open or not connected now waits
// for when it is.
export interface StoredTilingPlan {
  readonly windows: readonly StoredPlanWindow[];
  readonly columns: Readonly<Record<string, number>>;
  // Missing from plans kept before rows could be chosen.
  readonly rows?: Readonly<Record<string, number>>;
  // The screens the plan was made with, by id; missing from plans kept before screens were.
  readonly screens?: Readonly<Record<string, StoredPlanScreen>>;
}

// The most columns a screen is given by itself, before one is chosen for it; more can be added.
export const maxColumns = 8;
// The most rows a window is made tall by dragging its corner, beyond those of its screen.
export const maxRows = 8;

export interface PlannedWindow {
  readonly key: string;
  readonly record: WindowRecord;
  // Whether the window is not open now: it is shown where the plan has it, and not tiled.
  readonly missing?: boolean;
  // The id a window not open had while it was open, when known: Lens describes it by that once
  // closed, to open it again.
  readonly closed?: WindowId;
  // The cell the window is put in, when it is put in one; otherwise it takes the first that is free.
  readonly column?: number;
  readonly row?: number;
  readonly columns: number;
  readonly rows: number;
}

// A window placed in its screen's grid: from which cell, and over how many.
export interface PlacedWindow extends PlannedWindow {
  readonly column: number;
  readonly row: number;
}

export interface PlannedScreen {
  readonly display: DisplayRecord;
  // Whether the screen is not connected now: it is shown as the plan has it, and not tiled.
  readonly missing: boolean;
  readonly columns: number;
  // The rows of the grid: as many as chosen, but never fewer than the windows need.
  readonly rows: number;
  readonly neededRows: number;
  readonly windows: readonly PlacedWindow[];
}

export interface ResolvedTilingPlan {
  readonly screens: readonly PlannedScreen[];
  readonly untiled: readonly PlannedWindow[];
}

// What names a window across reads of the windows, as its WindowId does.
// The alias of a window that has no place in the plan for now, as one showing while windows are
// opened again that is none of them.
export const leftOutOfPlan = "";

// What the key of a window being opened in a cell starts with, the id it is opened under after it.
export const openingPrefix = "opening:";

export const keyOfWindow = (window: WindowId) =>
  isApplicationWindow(window)
    ? "application"
    : JSON.stringify([window.kind, window.id]);

// The id a window not open had while open, by its plan entry: as kept with it, or for a plan kept
// before ids were, as its key tells, its own or, missing since a layout was shown, the layout's.
export const closedWindowOf = (entry: {
  readonly key: string;
  readonly window?: WindowId;
}) => {
  if (entry.window) {
    return entry.window;
  }

  const own = /^missing:\d+:(.*)$/s.exec(entry.key)?.[1] ?? entry.key;

  return own.startsWith("[") ? windowOfKey(own) : undefined;
};

// The window a key of `keyOfWindow` names, as a window not open is known by its key alone.
export const windowOfKey = (key: string): WindowId => {
  if (key === "application") {
    return applicationWindowId;
  }

  const [kind, id] = JSON.parse(key) as [string, string];

  return { kind, id } as WindowId;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

// Places the windows in a grid of the columns: first each window put in a cell, in their order,
// where it fits and nothing is yet; then every other window, as one whose cell another took, in the
// first cell from the top left where it fits. A window wider than the grid is narrowed to it, and
// one put too far right moved left to fit.
export const placeInGrid = (
  windows: readonly PlannedWindow[],
  columns: number,
) => {
  const taken = new Set<string>();
  const placed = new Map<PlannedWindow, PlacedWindow>();
  let rows = 0;

  const isFree = (
    row: number,
    column: number,
    width: number,
    height: number,
  ) => {
    for (let r = row; r < row + height; r++) {
      for (let c = column; c < column + width; c++) {
        if (taken.has(`${r},${c}`)) {
          return false;
        }
      }
    }

    return true;
  };

  const place = (
    window: PlannedWindow,
    row: number,
    column: number,
    width: number,
  ) => {
    for (let r = row; r < row + window.rows; r++) {
      for (let c = column; c < column + width; c++) {
        taken.add(`${r},${c}`);
      }
    }

    rows = Math.max(rows, row + window.rows);
    placed.set(window, { ...window, columns: width, column, row });
  };

  for (const window of windows) {
    if (window.column === undefined || window.row === undefined) {
      continue;
    }

    const width = Math.min(window.columns, columns);
    const column = Math.max(0, Math.min(window.column, columns - width));
    const row = Math.max(0, window.row);

    if (isFree(row, column, width, window.rows)) {
      place(window, row, column, width);
    }
  }

  for (const window of windows) {
    if (placed.has(window)) {
      continue;
    }

    const width = Math.min(window.columns, columns);
    let at = 0;

    while (
      (at % columns) + width > columns ||
      !isFree(Math.floor(at / columns), at % columns, width, window.rows)
    ) {
      at++;
    }

    place(window, Math.floor(at / columns), at % columns, width);
  }

  return { placed: windows.map((window) => placed.get(window)!), rows };
};

// Where a window placed in the grid goes over the area, the cells split evenly, to the pixel.
export const boundsInGrid = (
  area: WindowBounds,
  columns: number,
  rows: number,
  window: PlacedWindow,
): WindowBounds => {
  const xAt = (column: number) =>
    area.x + Math.round((column * area.width) / columns);
  const yAt = (row: number) =>
    area.y + Math.round((row * area.height) / Math.max(rows, 1));

  return {
    x: xAt(window.column),
    y: yAt(window.row),
    width: xAt(window.column + window.columns) - xAt(window.column),
    height: yAt(window.row + window.rows) - yAt(window.row),
  };
};

const cellsOf = (window: { columns: number; rows: number }) =>
  window.columns * window.rows;

// With nothing arranged: every window not minimized spread over the screens as evenly as the cells
// go, the main window first, two cells wide, on the primary screen; on a tie any other window stays
// on the screen it is on. Minimized windows are left as they are.
const spreadByDefault = (
  windows: readonly WindowRecord[],
  displays: readonly DisplayRecord[],
  tileMinimized: boolean,
) => {
  const byScreen = new Map<DisplayRecord, PlannedWindow[]>(
    displays.map((display) => [display, []]),
  );
  const cellsTaken = (display: DisplayRecord) =>
    byScreen.get(display)!.reduce((sum, it) => sum + cellsOf(it), 0);
  const untiled: PlannedWindow[] = [];
  const toTile = windows.filter(
    (window) => tileMinimized || window.state.get() !== "minimized",
  );
  const mainFirst = [...toTile].sort(
    (a, b) =>
      Number(isApplicationWindow(b.window)) -
      Number(isApplicationWindow(a.window)),
  );

  for (const record of mainFirst) {
    const isMain = isApplicationWindow(record.window);
    const fewest = Math.min(...displays.map(cellsTaken));
    const candidates = displays.filter(
      (display) => cellsTaken(display) === fewest,
    );

    const display =
      (isMain ? candidates.find((it) => it.isPrimary.get()) : undefined) ??
      candidates.find((it) => it.id === record.displayId.get()) ??
      candidates[0];

    byScreen.get(display)!.push({
      key: keyOfWindow(record.window),
      record,
      columns: isMain ? 2 : 1,
      rows: 1,
    });
  }

  for (const record of windows) {
    if (!toTile.includes(record)) {
      untiled.push({
        key: keyOfWindow(record.window),
        record,
        columns: 1,
        rows: 1,
      });
    }
  }

  // Each screen in the order the windows opened, the main window first, as it was always tiled.
  for (const [display, onScreen] of byScreen) {
    byScreen.set(
      display,
      toTile.flatMap((record) => onScreen.filter((it) => it.record === record)),
    );
  }

  return { byScreen, untiled };
};

// The id a screen the plan has under an id not connected now is connected under: the screen of the
// same name, of the same size too where two share the name, as macOS gives a screen a new id when
// it is connected again. None when the screen is connected under its id, or not at all.
export const reconnectedIdOf = (
  id: string,
  screen: StoredPlanScreen,
  displays: readonly DisplayRecord[],
): number | undefined => {
  if (!screen.label || displays.some((display) => String(display.id) === id)) {
    return undefined;
  }

  const named = displays.filter(
    (display) => display.label.get() === screen.label,
  );

  const same =
    named.length > 1
      ? named.filter(
          (display) =>
            display.bounds.get().width === screen.bounds.width &&
            display.bounds.get().height === screen.bounds.height,
        )
      : named;

  return same.length === 1 ? same[0].id : undefined;
};

// The plan with the screens it has under ids connected no more moved to the ids they are connected
// under now, their windows with them; their grids too, unless the plan has windows under the new id.
const withScreensReconnected = (
  stored: StoredTilingPlan | undefined,
  displays: readonly DisplayRecord[],
): StoredTilingPlan | undefined => {
  const moved = new Map<string, number>();

  for (const [id, screen] of Object.entries(stored?.screens ?? {})) {
    const to = reconnectedIdOf(id, screen, displays);

    if (to !== undefined) {
      moved.set(id, to);
    }
  }

  if (!stored || moved.size === 0) {
    return stored;
  }

  const hasWindows = new Set(
    stored.windows.map((window) => String(window.displayId)),
  );

  const gridsMoved = (grids: Readonly<Record<string, number>>) => {
    const kept = Object.fromEntries(
      Object.entries(grids).filter(([id]) => !moved.has(id)),
    );

    for (const [id, count] of Object.entries(grids)) {
      const to = moved.get(id);

      if (
        to !== undefined &&
        (kept[to] === undefined || !hasWindows.has(String(to)))
      ) {
        kept[to] = count;
      }
    }

    return kept;
  };

  return {
    ...stored,
    windows: stored.windows.map((window) => {
      const to =
        window.displayId === null
          ? undefined
          : moved.get(String(window.displayId));

      return to === undefined ? window : { ...window, displayId: to };
    }),
    columns: gridsMoved(stored.columns),
    rows: stored.rows && gridsMoved(stored.rows),
    screens: Object.fromEntries(
      Object.entries(stored.screens ?? {}).filter(([id]) => !moved.has(id)),
    ),
  };
};

// The plan with a tile of a layout's window not open when the layout was shown going by the window's
// own key once the window is open under it again, as Lens opens windows again after a restart: the
// tile is that window, never one beside a window shown as new.
const withWindowsOpenAgain = (
  stored: StoredTilingPlan | undefined,
  windows: readonly WindowRecord[],
  keyOf: (record: WindowRecord) => string,
): StoredTilingPlan | undefined => {
  if (!stored) {
    return stored;
  }

  const open = new Set(windows.map(keyOf));
  const named = new Set(stored.windows.map((it) => it.key));
  const taken = new Set<string>();

  return {
    ...stored,
    windows: stored.windows.map((window) => {
      const own = /^missing:\d+:(.*)$/s.exec(window.key)?.[1];

      if (
        own === undefined ||
        !open.has(own) ||
        named.has(own) ||
        taken.has(own)
      ) {
        return window;
      }

      taken.add(own);

      return { ...window, key: own };
    }),
  };
};

// The plan for the windows open and the screens connected now: what the user arranged, for the
// windows and screens it names; a window it does not name, as one opened since, is not tiled. A
// window it names on a screen it knows nothing of goes on the screen it is on if windows are tiled
// there, and otherwise on the screen with the fewest cells taken, left as it is when minimized.
export const resolveTilingPlan = (
  windows: readonly WindowRecord[],
  displays: readonly DisplayRecord[],
  stored: StoredTilingPlan | undefined,
  options: {
    // Whether, with nothing arranged, minimized windows are tiled too rather than left as they are.
    readonly tileMinimized?: boolean;
    // The key each window goes by in the plan, by its own: a window being opened again goes by the
    // key of the window not open it is, as soon as it shows; one aliased as `leftOutOfPlan` has no
    // place in the plan for now.
    readonly aliases?: ReadonlyMap<string, string>;
  } = {},
): ResolvedTilingPlan => {
  const keyOf = (record: WindowRecord) => {
    const key = keyOfWindow(record.window);

    return options.aliases?.get(key) ?? key;
  };

  windows = windows.filter((record) => keyOf(record) !== leftOutOfPlan);

  // The screens may not be known yet, as before Lens has told them; nothing can be planned without.
  if (displays.length === 0) {
    return { screens: [], untiled: [] };
  }

  const connected = displays;

  stored = withWindowsOpenAgain(
    withScreensReconnected(stored, displays),
    windows,
    keyOf,
  );

  // A screen the plan has windows on that is not connected now, kept with its windows as missing.
  const missing = Object.entries(stored?.screens ?? {})
    .filter(
      ([id]) =>
        !connected.some((display) => String(display.id) === id) &&
        stored!.windows.some((window) => String(window.displayId) === id),
    )
    .map(([id, screen]) => toMissingDisplay(Number(id), screen));

  const all = [...connected, ...missing];

  const recordsByKey = new Map(
    windows.map((record) => [keyOf(record), record]),
  );

  // A window the plan has that is not open now, kept as missing where the plan knows what it was.
  const missingWindows = new Map<
    string,
    { missing: true; closed?: WindowId }
  >();

  for (const window of stored?.windows ?? []) {
    if (window.title !== undefined && !recordsByKey.has(window.key)) {
      const closed = closedWindowOf(window);

      recordsByKey.set(window.key, toMissingWindow(window.key, window.title));
      missingWindows.set(window.key, {
        missing: true,
        ...(closed ? { closed } : {}),
      });
    }
  }

  const named = stored?.windows.filter((it) => recordsByKey.has(it.key)) ?? [];

  let byScreen: Map<DisplayRecord, PlannedWindow[]>;
  let untiled: PlannedWindow[];

  if (named.length === 0) {
    ({ byScreen, untiled } = spreadByDefault(
      windows,
      displays,
      options.tileMinimized ?? false,
    ));
  } else {
    byScreen = new Map(all.map((display) => [display, []]));
    untiled = [];

    // Windows the plan has no place for now, by the key the plan knows them by.
    const unplaced: { readonly key: string; readonly record: WindowRecord }[] =
      [];

    for (const window of named) {
      const record = recordsByKey.get(window.key)!;
      const planned = {
        key: window.key,
        record,
        ...missingWindows.get(window.key),
        column: window.column,
        row: window.row,
        columns: window.columns,
        rows: window.rows,
      };
      const display = all.find((it) => it.id === window.displayId);

      if (window.displayId === null) {
        untiled.push(planned);
      } else if (display) {
        byScreen.get(display)!.push(planned);
      } else {
        unplaced.push({ key: window.key, record });
      }
    }

    const namedKeys = new Set(named.map((it) => it.key));

    // A window the plan does not name, as one opened since, is not tiled until put on a screen.
    untiled.push(
      ...windows
        .filter((record) => !namedKeys.has(keyOf(record)))
        .map((record) => ({ key: keyOf(record), record, columns: 1, rows: 1 })),
    );

    for (const { key, record } of unplaced) {
      const missing = missingWindows.has(key);
      const planned = {
        key,
        record,
        ...missingWindows.get(key),
        columns: 1,
        rows: 1,
      };

      // A window not open, its screen gone too, is not tiled; nor is one minimized.
      if (missing || record.state.get() === "minimized") {
        untiled.push(planned);
        continue;
      }

      const used = displays.filter(
        (display) => byScreen.get(display)!.length > 0,
      );
      const choices = used.length > 0 ? used : displays;
      const own = choices.find(
        (display) => display.id === record.displayId.get(),
      );

      const fewest =
        own ??
        [...choices].sort(
          (a, b) =>
            byScreen.get(a)!.reduce((sum, it) => sum + cellsOf(it), 0) -
            byScreen.get(b)!.reduce((sum, it) => sum + cellsOf(it), 0),
        )[0];

      if (fewest) {
        byScreen.get(fewest)!.push(planned);
      }
    }
  }

  const screens = all.map((display): PlannedScreen => {
    const onScreen = byScreen.get(display) ?? [];
    const widest = Math.max(1, ...onScreen.map((it) => it.columns));
    const storedColumns = stored?.columns[String(display.id)];

    const columns =
      storedColumns !== undefined
        ? Math.max(storedColumns, 1)
        : clamp(
            Math.max(
              columnsFor(
                onScreen.reduce((sum, it) => sum + cellsOf(it), 0) || 1,
              ),
              widest,
            ),
            1,
            maxColumns,
          );

    const { placed, rows: neededRows } = placeInGrid(onScreen, columns);
    const storedRows = stored?.rows?.[String(display.id)] ?? 0;

    return {
      display,
      missing: missing.includes(display),
      columns,
      rows: Math.max(neededRows, storedRows, 1),
      neededRows,
      windows: placed,
    };
  });

  return { screens, untiled };
};

// The title a missing window is kept with, so that it is shown again.
// Every window is kept with its title, so that one closed since is shown again, as missing.
// The title of the window, and its id while open, as a plan entry keeps them; a window being opened
// in a cell, standing in by a key of its own, has no id yet.
const titleOf = (window: PlannedWindow) => {
  const id = window.missing ? window.closed : window.record.window;

  return {
    title: window.record.title.get(),
    ...(id && !isApplicationWindow(id) ? { window: id } : {}),
  };
};

// The plan's windows in its order, those tiled and then those left as they are, each where it is.
export const windowsOfPlan = (resolved: ResolvedTilingPlan) => [
  ...resolved.screens.flatMap((screen) =>
    screen.windows.map((it) => ({
      key: it.key,
      displayId: screen.display.id as number | null,
      column: it.column as number | undefined,
      row: it.row as number | undefined,
      columns: it.columns,
      rows: it.rows,
      ...titleOf(it),
    })),
  ),
  ...resolved.untiled.map((it) => ({
    key: it.key,
    displayId: null,
    column: undefined,
    row: undefined,
    columns: it.columns,
    rows: it.rows,
    ...titleOf(it),
  })),
];

// The plan as it is resolved now, to keep: every window open where it shows, in order, and every
// screen's columns, the windows and screens not here now kept as they were.
export const toStoredPlan = (
  resolved: ResolvedTilingPlan,
  previous: StoredTilingPlan | undefined,
): StoredTilingPlan => {
  const open = windowsOfPlan(resolved);

  const openKeys = new Set(open.map((it) => it.key));

  return {
    windows: [
      ...open,
      ...(previous?.windows.filter((it) => !openKeys.has(it.key)) ?? []),
    ],
    columns: {
      ...previous?.columns,
      ...Object.fromEntries(
        resolved.screens.map((screen) => [
          String(screen.display.id),
          screen.columns,
        ]),
      ),
    },
    rows: {
      ...previous?.rows,
      ...Object.fromEntries(
        resolved.screens.map((screen) => [
          String(screen.display.id),
          screen.rows,
        ]),
      ),
    },
    screens: {
      ...previous?.screens,
      ...Object.fromEntries(
        resolved.screens.map((screen) => [
          String(screen.display.id),
          toStoredScreen(screen.display),
        ]),
      ),
    },
  };
};

// The plan with every screen's windows placed again in its grid after an edit, the grid keeping
// the rows it had unless the windows need more.
const placedAgain = (resolved: ResolvedTilingPlan): ResolvedTilingPlan => ({
  ...resolved,
  screens: resolved.screens.map((screen) => {
    const { placed, rows: neededRows } = placeInGrid(
      screen.windows,
      screen.columns,
    );

    return {
      ...screen,
      windows: placed,
      neededRows,
      rows: Math.max(neededRows, screen.rows, 1),
    };
  }),
});

// Where on the screens the window goes: on a screen, from a cell, or the first free one when none
// is given; or null to leave it as it is.
export type PlanTarget =
  | {
      readonly displayId: number;
      readonly column?: number;
      readonly row?: number;
    }
  | { readonly displayId: null };

// Every window of the screen left out of tiling; the other screens' windows stay where they are.
export const untileScreenInPlan = (
  resolved: ResolvedTilingPlan,
  displayId: number,
): ResolvedTilingPlan =>
  (
    resolved.screens.find((screen) => screen.display.id === displayId)
      ?.windows ?? []
  ).reduce(
    (plan, window) => moveInPlan(plan, window.key, { displayId: null }),
    resolved,
  );

// Moves the window where asked, taking the cell from the windows there, which go to the first free
// cells; the other windows stay where they are.
export const moveInPlan = (
  resolved: ResolvedTilingPlan,
  key: string,
  target: PlanTarget,
): ResolvedTilingPlan => {
  const moving = [
    ...resolved.screens.flatMap((it) => it.windows),
    ...resolved.untiled,
  ].find((it) => it.key === key);

  if (!moving) {
    return resolved;
  }

  const without = <T extends PlannedWindow>(windows: readonly T[]) =>
    windows.filter((it) => it.key !== key);
  const { column: _column, row: _row, ...unplaced } = moving as PlacedWindow;

  return placedAgain({
    screens: resolved.screens.map((screen) => {
      const others = without(screen.windows);

      if (target.displayId !== screen.display.id) {
        return { ...screen, windows: others };
      }

      return target.column === undefined || target.row === undefined
        ? { ...screen, windows: [...others, unplaced as PlacedWindow] }
        : {
            ...screen,
            windows: [
              { ...unplaced, column: target.column, row: target.row },
              ...others,
            ],
          };
    }),
    untiled:
      target.displayId === null
        ? [...without(resolved.untiled), unplaced]
        : without(resolved.untiled),
  });
};

export const resizeInPlan = (
  resolved: ResolvedTilingPlan,
  key: string,
  columns: number,
  rows: number,
): ResolvedTilingPlan =>
  placedAgain({
    ...resolved,
    screens: resolved.screens.map((screen) => {
      const resized = screen.windows.find((it) => it.key === key);

      // First, so it keeps its cell and takes the cells it grows over from the windows there.
      return resized
        ? {
            ...screen,
            windows: [
              {
                ...resized,
                columns: clamp(columns, 1, screen.columns),
                rows: clamp(rows, 1, Math.max(maxRows, screen.rows)),
              },
              ...screen.windows.filter((it) => it !== resized),
            ],
          }
        : screen;
    }),
  });

export const setColumnsInPlan = (
  resolved: ResolvedTilingPlan,
  displayId: number,
  columns: number,
): ResolvedTilingPlan =>
  placedAgain({
    ...resolved,
    screens: resolved.screens.map((screen) =>
      screen.display.id === displayId
        ? { ...screen, columns: Math.max(columns, 1) }
        : screen,
    ),
  });

export const setRowsInPlan = (
  resolved: ResolvedTilingPlan,
  displayId: number,
  rows: number,
): ResolvedTilingPlan =>
  placedAgain({
    ...resolved,
    screens: resolved.screens.map((screen) =>
      screen.display.id === displayId
        ? { ...screen, rows: Math.max(rows, 1) }
        : screen,
    ),
  });

// Where in a screen's grid, at its place on the page, a window dragged to the point goes: the cell
// under the point is the one of the window that was grabbed, so the window keeps under the pointer
// where it was grabbed.
export const targetInGrid = (
  x: number,
  y: number,
  grid: { left: number; top: number; width: number; height: number },
  screen: PlannedScreen,
  grabbed: { readonly column: number; readonly row: number },
): PlanTarget => {
  const rows = Math.max(screen.rows, 1);
  const column =
    Math.floor(((x - grid.left) / grid.width) * screen.columns) -
    grabbed.column;
  const row = Math.floor(((y - grid.top) / grid.height) * rows) - grabbed.row;

  return {
    displayId: screen.display.id,
    column: Math.max(0, Math.min(column, screen.columns - 1)),
    row: Math.max(0, Math.min(row, rows - 1)),
  };
};

export const toStoredScreen = (display: DisplayRecord): StoredPlanScreen => ({
  label: display.label.get(),
  isPrimary: display.isPrimary.get(),
  bounds: { ...display.bounds.get() },
  workArea: { ...display.workArea.get() },
});

// A window not open, as the plan has it, standing in for one in the plan.
const toMissingWindow = (key: string, title: string) =>
  ({
    window: { kind: "missing", id: key },
    title: { get: () => title },
    state: { get: () => "normal" },
    displayId: { get: () => -1 },
    isFocused: { get: () => false },
    describeReopening: async () => undefined,
  }) as unknown as WindowRecord;

// A screen not connected, as the plan has it, standing in for one in the plan; never primary, as
// another screen is primary now.
const toMissingDisplay = (id: number, screen: StoredPlanScreen) =>
  ({
    id,
    label: { get: () => screen.label },
    isPrimary: { get: () => false },
    bounds: { get: () => screen.bounds },
    workArea: { get: () => screen.workArea },
    scaleFactor: { get: () => 1 },
    rotation: { get: () => 0 },
  }) as unknown as DisplayRecord;

// Every window left as it is, as a new layout starts out.
export const allLeftAsTheyAre = (
  windows: readonly WindowRecord[],
): StoredTilingPlan => ({
  windows: windows.map((record) => ({
    key: keyOfWindow(record.window),
    title: record.title.get(),
    ...(isApplicationWindow(record.window) ? {} : { window: record.window }),
    displayId: null,
    columns: 1,
    rows: 1,
  })),
  columns: {},
  rows: {},
  screens: {},
});

// The windows not tiled, those open, each placed on the connected screen with the fewest cells
// taken, in the first free cell; the windows tiled stay where they are.
export const tileUntiled = (
  resolved: ResolvedTilingPlan,
): ResolvedTilingPlan => {
  let plan = resolved;

  for (const window of resolved.untiled.filter((it) => !it.missing)) {
    const cellsTaken = (screen: PlannedScreen) =>
      screen.windows.reduce((sum, it) => sum + cellsOf(it), 0);
    const fewest = plan.screens
      .filter((screen) => !screen.missing)
      .sort((a, b) => cellsTaken(a) - cellsTaken(b))[0];

    if (fewest) {
      plan = moveInPlan(plan, window.key, { displayId: fewest.display.id });
    }
  }

  return plan;
};
