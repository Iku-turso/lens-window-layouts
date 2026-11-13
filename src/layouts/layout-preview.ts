import type {
  DisplayRecord,
  WindowBounds,
} from "@k8slens/window-layout-contracts";
import { isApplicationWindow } from "@k8slens/messaging-contracts";
import { columnsFor } from "./grid";
import type { SavedWindowLayout } from "./saved-window-layouts.injectable";
import { boundsInGrid, placeInGrid, reconnectedIdOf } from "./tiling-plan";

export interface PreviewWindow {
  // Its place in the layout's windows.
  readonly index: number;
  readonly title: string;
  readonly isOpen: boolean;
  // Whether the window is open but not where or as the layout saved it.
  readonly isSaved: boolean;
  readonly isApplicationWindow: boolean;
  readonly column: number;
  readonly row: number;
  readonly columns: number;
  readonly rows: number;
}

export interface PreviewScreen {
  readonly id: string;
  readonly label?: string;
  // Whether the screen is not connected now.
  readonly missing: boolean;
  // Where the screen's windows go, among the other screens, to draw the screens as they lie.
  readonly area: WindowBounds;
  readonly columns: number;
  readonly rows: number;
  readonly windows: readonly PreviewWindow[];
}

export interface LayoutPreview {
  readonly screens: readonly PreviewScreen[];
  // The titles of the windows the layout leaves untiled.
  readonly untiled: readonly string[];
  // How many of the layout's windows are not open now.
  readonly notOpen: number;
  // How many of them are open but not where or as the layout saved them.
  readonly notSaved: number;
}

// The tiling a layout saved, screen by screen, its windows placed in the grids as the editor
// places them; no screens for a layout saved without a tiling.
type SavedTiling = NonNullable<SavedWindowLayout["tiling"]>;

// The grid of a screen of the tiling, its windows placed in it as the editor places them.
const gridOf = (tiling: SavedTiling, id: string) => {
  const onScreen = tiling.windows.filter((it) => String(it.displayId) === id);
  const columns = Math.max(
    tiling.columns[id] ??
      columnsFor(
        onScreen.reduce((sum, it) => sum + it.columns * it.rows, 0) || 1,
      ),
    1,
  );
  const { placed, rows } = placeInGrid(onScreen, columns);

  return {
    placed,
    columns,
    rows: Math.max(rows, tiling.rows[id] ?? 0, 1),
  };
};

// Where the layout's tiling puts each window it tiles on a screen connected now, by its place in
// the layout: a screen connected again under another id is the one saved still.
export const tileBoundsOf = (
  layout: SavedWindowLayout,
  displays: readonly DisplayRecord[],
): ReadonlyMap<number, WindowBounds> => {
  const tiling = layout.tiling;

  if (!tiling) {
    return new Map();
  }

  const ids = new Set(
    tiling.windows.flatMap((it) =>
      it.displayId === null ? [] : [String(it.displayId)],
    ),
  );

  return new Map(
    [...ids].flatMap((id) => {
      const saved = tiling.screens?.[id];
      const displayId = displays.some((display) => String(display.id) === id)
        ? Number(id)
        : saved && reconnectedIdOf(id, saved, displays);
      const display = displays.find((it) => it.id === displayId);

      if (!display) {
        return [];
      }

      const { placed, columns, rows } = gridOf(tiling, id);

      return placed.map(
        (it) =>
          [
            it.index,
            boundsInGrid(display.workArea.get(), columns, rows, it),
          ] as const,
      );
    }),
  );
};

export const previewOf = (
  layout: SavedWindowLayout,
  // The places in the layout of its windows not open now.
  notOpen: ReadonlySet<number> = new Set(),
  // The ids of the screens of its tiling not connected now.
  missingScreens: ReadonlySet<string> = new Set(),
  // The places in the layout of its windows open but not where or as it saved them.
  notSaved: ReadonlySet<number> = new Set(),
): LayoutPreview => {
  const tiling = layout.tiling;
  const notOpenCount = layout.windows.filter((_, index) =>
    notOpen.has(index),
  ).length;
  const notSavedCount = layout.windows.filter(
    (_, index) => !notOpen.has(index) && notSaved.has(index),
  ).length;

  if (!tiling) {
    return {
      screens: [],
      untiled: layout.windows.map((it) => it.title),
      notOpen: notOpenCount,
      notSaved: notSavedCount,
    };
  }

  const titleOf = (index: number) => layout.windows[index]?.title ?? "";
  const tiled = tiling.windows.filter((it) => it.displayId !== null);
  const tiledIndexes = new Set(tiled.map((it) => it.index));

  const ids = [
    ...new Set([
      ...Object.keys(tiling.columns),
      ...tiled.map((it) => String(it.displayId)),
    ]),
  ];

  // A screen kept without where it lies, from before screens were kept, goes right of the others.
  let nextX = Math.max(
    0,
    ...ids.map((id) => {
      const area = tiling.screens?.[id]?.workArea;

      return area ? area.x + area.width : 0;
    }),
  );

  const screens = ids
    .map((id): PreviewScreen => {
      const { placed, columns, rows } = gridOf(tiling, id);
      const screen = tiling.screens?.[id];
      const kept = screen?.workArea;
      const area =
        kept && kept.width > 0 && kept.height > 0
          ? kept
          : { x: nextX, y: 0, width: 1600, height: 1000 };

      if (area !== kept) {
        nextX += area.width;
      }

      return {
        id,
        ...(screen ? { label: screen.label } : {}),
        missing: missingScreens.has(id),
        area,
        columns,
        rows,
        windows: placed.map((it) => ({
          index: it.index,
          title: titleOf(it.index),
          isOpen: !notOpen.has(it.index),
          isSaved: notOpen.has(it.index) || !notSaved.has(it.index),
          isApplicationWindow: isApplicationWindow(
            layout.windows[it.index]?.window ?? { kind: "", id: "" },
          ),
          column: it.column,
          row: it.row,
          columns: it.columns,
          rows: it.rows,
        })),
      };
    })
    // The screens with windows on them; with none anywhere, every screen, to show the grid.
    .filter((screen, _, all) =>
      all.some((it) => it.windows.length > 0)
        ? screen.windows.length > 0
        : true,
    );

  return {
    screens,
    untiled: layout.windows
      .filter((_, index) => !tiledIndexes.has(index))
      .map((it) => it.title),
    notOpen: notOpenCount,
    notSaved: notSavedCount,
  };
};
