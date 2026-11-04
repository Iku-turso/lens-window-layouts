import { getInjectable2 } from "@k8slens/injectable";
import {
  isApplicationWindow,
  type WindowId,
} from "@k8slens/messaging-contracts";
import { openModalInjectionToken } from "@k8slens/modal-contracts";
import {
  canReopenWindowReactiveInjectionToken,
  displayRecordsReactiveInjectionToken,
  focusWindowInjectionToken,
  reopenWindowInjectionToken,
  windowRecordsReactiveInjectionToken,
  windowRecordOfInjectionToken,
  setWindowBoundsInjectionToken,
  type WindowBounds,
  type WindowRecord,
  type WindowReopening,
  type WindowReopeningPlacement,
} from "@k8slens/window-layout-contracts";
import {
  allClusterRecordsReactiveInjectionToken,
  type ClusterRecord,
} from "@k8slens/cluster-contracts";
import type { Place } from "@k8slens/navigation-contracts";
import {
  closeAnySubWindowInjectionToken,
  getSubWindowKindId,
  type ListedSubWindow,
  openSubWindowInjectionToken,
  renameAnySubWindowInjectionToken,
  subWindowsInjectionToken,
  subWindowsReactiveInjectionToken,
} from "@k8slens/sub-window-contracts";
import {
  action,
  computed,
  type IComputedValue,
  type ObservableMap,
  observable,
  runInAction,
} from "mobx";
import { reopeningOfClosedWindowInjectable } from "../layouts/reopening-of-closed-window.injectable";
import {
  lineageKey,
  continuedWindowsOf,
  windowContinuesBunch,
  windowLineageBunch,
} from "../layouts/window-lineage.injectable";
import { canOpenPlacesInSubWindowsReactiveInjectionToken } from "@k8slens/place-sub-window-contracts";
import { placesSubWindowKind } from "../layouts/places-sub-window-kind.injectable";
import { deleteWindowLayoutInjectable } from "../layouts/delete-window-layout.injectable";
import { layoutTilingInjectable } from "../layouts/layout-tiling.injectable";
import { recallWindowLayoutInjectable } from "../layouts/recall-window-layout.injectable";
import { renameWindowLayoutInjectable } from "../layouts/rename-window-layout.injectable";
import { duplicateWindowLayoutInjectable } from "../layouts/duplicate-window-layout.injectable";
import { saveWindowLayoutInjectable } from "../layouts/save-window-layout.injectable";
import { matchOpenWindows, savedWindowOfKey } from "../layouts/layout-tiling";
import {
  boundsInGrid,
  keyOfWindow,
  leftOutOfPlan,
  openingPrefix,
  moveInPlan,
  setRowsInPlan,
  type PlacedWindow,
  type PlannedScreen,
  type PlannedWindow,
  type ResolvedTilingPlan,
  reconnectedIdOf,
} from "../layouts/tiling-plan";
import { tilingPlanInjectable } from "../layouts/tiling-plan.injectable";
import { tileWindowsInjectable } from "../layouts/tile-windows.injectable";
import type {
  SavedWindow,
  SavedWindowLayout,
} from "../layouts/saved-window-layouts.injectable";
import { windowLayoutListInjectable } from "../layouts/window-layout-list.injectable";
import { deleteLayoutModalKind } from "./delete-layout-modal.injectable";

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

// The name a new layout gets: "Layout" and the number after the highest of the layouts so named.
const nextLayoutName = (names: readonly string[]) => {
  const numbers = names
    .map((name) => /^Layout (\d+)$/.exec(name)?.[1])
    .filter((it) => it !== undefined);

  return `Layout ${Math.max(0, ...numbers.map(Number)) + 1}`;
};

// The windows a plan tiles: those open, on screens connected.
const tiledWindowsOf = (plan: ResolvedTilingPlan) =>
  plan.screens
    .filter((screen) => !screen.missing)
    .flatMap((screen) =>
      screen.windows
        .filter((window) => !window.missing)
        .map((window) => ({ window, screen })),
    );

// Where the window is planned to go, to tell where it settled when tiled so before.
const placementOf = (window: PlacedWindow, screen: PlannedScreen) =>
  JSON.stringify([
    window.key,
    screen.display.id,
    screen.display.workArea.get(),
    screen.columns,
    screen.rows,
    window.column,
    window.row,
    window.columns,
    window.rows,
  ]);

const isNear = (a: WindowBounds, b: WindowBounds, by: number) =>
  Math.abs(a.x - b.x) <= by &&
  Math.abs(a.y - b.y) <= by &&
  Math.abs(a.width - b.width) <= by &&
  Math.abs(a.height - b.height) <= by;

// How long tiled windows take to settle where they were placed, before they are looked at.
const settleMs = 600;

// A cell of a screen's grid.
export interface Cell {
  readonly displayId: number;
  readonly column: number;
  readonly row: number;
}

// What the window layouts modal shows, and what its buttons do.
export const windowLayoutsModelInjectable = getInjectable2({
  id: "window-manager.window-layouts-model",
  consumptions: [
    windowRecordsReactiveInjectionToken,
    displayRecordsReactiveInjectionToken,
    openModalInjectionToken,
    openSubWindowInjectionToken,
    setWindowBoundsInjectionToken,
    allClusterRecordsReactiveInjectionToken,
    canOpenPlacesInSubWindowsReactiveInjectionToken,
    subWindowsReactiveInjectionToken,
    subWindowsInjectionToken,
    closeAnySubWindowInjectionToken,
    renameAnySubWindowInjectionToken,
    reopenWindowInjectionToken,
    canReopenWindowReactiveInjectionToken,
    focusWindowInjectionToken,
    windowRecordOfInjectionToken,
  ],

  instantiate: (di) => {
    // What the model has started and stops when it is thrown away, as when the extension is
    // rebuilt, disabled or uninstalled: its timers not run yet. It starts no reactions.
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const later = (run: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        run();
      }, ms);

      timers.add(timer);

      return timer;
    };

    const cancel = (timer: ReturnType<typeof setTimeout> | undefined) => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(timer);
      }
    };

    const windows = di.inject(windowRecordsReactiveInjectionToken)();
    const displays = di.inject(displayRecordsReactiveInjectionToken)();
    const confirmDelete = di.inject(
      openModalInjectionToken.for(deleteLayoutModalKind).for(di.scopeIds),
    )();
    const openPlace = di.inject(
      openSubWindowInjectionToken.for(placesSubWindowKind).for(di.scopeIds),
    )();
    const setWindowBounds = di.inject(setWindowBoundsInjectionToken)();
    // Not there in a Lens that never can, as one without Lens Studio: taken as false.
    const canOpenPlacesOrNot = di.injectMaybe(
      canOpenPlacesInSubWindowsReactiveInjectionToken,
    )?.();
    const canOpenPlaces = computed(() => canOpenPlacesOrNot?.get() ?? false);
    // The sub-windows Lens lists: followed while the editor shows whether a window can be renamed,
    // and read once when closing or renaming one.
    const subWindowsOfLens = di.inject(subWindowsReactiveInjectionToken)();
    const getSubWindows = di.inject(subWindowsInjectionToken)();
    const closeAnySubWindow = di.inject(closeAnySubWindowInjectionToken)();
    const renameAnySubWindow = di.inject(renameAnySubWindowInjectionToken)();
    const reopenWindow = di.inject(reopenWindowInjectionToken)();
    const focusWindow = di.inject(focusWindowInjectionToken)();
    const windowRecordOf = di.inject(windowRecordOfInjectionToken)();
    const canReopenWindowReactive = di.inject(
      canReopenWindowReactiveInjectionToken,
    )();

    // How to open a window not open again, asked for when it is to be opened.
    const reopeningOfClosedWindow = di.inject(
      reopeningOfClosedWindowInjectable,
    )();

    // The window of a layout each window opened again stands for, by key; undefined until read.
    const lineage = observable.box<ObservableMap<string, string> | undefined>(
      undefined,
      { deep: false },
    );

    void di
      .inject(windowLineageBunch.persistable)()
      .then((kept) => runInAction(() => lineage.set(kept)));

    // The window each window opened again continues, by key, whichever layout opened it again.
    const continues = observable.box<ObservableMap<string, string> | undefined>(
      undefined,
      { deep: false },
    );

    void di
      .inject(windowContinuesBunch.persistable)()
      .then((kept) => runInAction(() => continues.set(kept)));

    // The windows a window continues, nearest first; then the windows any layout found or opened it
    // again as, which tell the same of a window opened again before this was kept.
    const predecessorsOfKey = (key: string) =>
      continuedWindowsOf(
        key,
        continues.get() ?? new Map(),
        lineage.get() ?? new Map(),
      );

    // The clusters, to open a window on one of their lists; undefined until Lens has told them.
    const clusters = observable.box<
      IComputedValue<ClusterRecord[]> | undefined
    >(undefined, { deep: false });

    void di
      .inject(allClusterRecordsReactiveInjectionToken)()
      .then((records) => runInAction(() => clusters.set(records)));
    const layouts = di.inject(windowLayoutListInjectable)();
    const saveWindowLayout = di.inject(saveWindowLayoutInjectable)();
    const recallWindowLayout = di.inject(recallWindowLayoutInjectable)();
    const deleteWindowLayout = di.inject(deleteWindowLayoutInjectable)();
    const tileWindows = di.inject(tileWindowsInjectable)();
    const tilingPlan = di.inject(tilingPlanInjectable)();
    const layoutTiling = di.inject(layoutTilingInjectable)();
    const renameWindowLayout = di.inject(renameWindowLayoutInjectable)();
    const duplicateWindowLayout = di.inject(duplicateWindowLayoutInjectable)();

    const status = observable.box<string | undefined>(undefined);
    // The name of the layout being renamed, and the name it is getting.
    const renaming = observable.box<string | undefined>(undefined);
    const renameDraft = observable.box("");
    // The layout whose tiling setup the editor shows, and whether the setup was changed since.
    const selected = observable.box<string | undefined>(undefined);
    const tilingChanged = observable.box(false);
    // Where windows settled when tiled, by where they were planned to go: a window too large for
    // its cell, as one that cannot be made so small, settles otherwise, and is in place there.
    const settled = observable.map<string, WindowBounds>({}, { deep: false });

    // Takes every tiled window where it is now as where its tile has it, as when it settled there.
    const acceptWhereWindowsAre = () => {
      for (const { window, screen } of tiledWindowsOf(
        tilingPlan.resolved.get(),
      )) {
        settled.set(placementOf(window, screen), {
          ...window.record.bounds.get(),
        });
      }
    };

    // What was just saved, shown beside Save for a moment: a notification of Lens would show under
    // the darkened backdrop of the dialog, out of sight.
    const savedNote = observable.box<string | undefined>(undefined);
    let hideSavedNote: ReturnType<typeof setTimeout> | undefined;

    const showSaved = action((note: string) => {
      savedNote.set(note);
      cancel(hideSavedNote);
      hideSavedNote = later(
        () => runInAction(() => savedNote.set(undefined)),
        4000,
      );
    });

    // Selects the layout: the editor shows its tiling, and its row its buttons.
    let nextPlaceWindow = 0;
    // Whether the windows of a layout being recalled are being opened again.
    const reopening = observable.box(false);
    // The windows a recall opened again with no tile of their own to go to, by their own keys: out
    // of the plan until the recall places them, so that none makes room for itself meanwhile.
    const recalled = observable.set<string>([], { deep: false });
    // What the clusters of the menu opening a window in a cell are narrowed to.
    const clusterSearch = observable.box("");
    const pageSearch = observable.box("");
    // The tiles whose windows are being opened, by key: again, from the tile or by a recall, or in a
    // cell, until Lens answers.
    const opening = observable.set<string>([], { deep: false });
    // The windows being closed, by their own keys: out of the plan while Lens lists them still.
    const closing = observable.set<string>([], { deep: false });

    // Once Lens has answered with the window opened again from a tile, the tile is that window's:
    // it goes by the window's own key, the window continues the one it was opened again from, and
    // is the layout's window the tile stood for, for good.
    const tileReopened = action(
      (
        key: string,
        window: WindowId,
        { standsFor, previous }: { standsFor: string; previous: string },
      ) => {
        const own = keyOfWindow(window);

        if (previous !== own) {
          continues.get()?.set(own, previous);
        }

        lineage.get()?.set(lineageKey(selected.get() ?? "", own), standsFor);
        tilingPlan.rekey(key, window);
      },
    );

    // What the selected layout saved of each open window: the window itself, or failing that the
    // window showing what the saved one did, as one opened again under another id; each saved
    // window to one open window only.
    const savedWindowsOf = computed(() => {
      const layout = model.selectedLayout.get();

      if (!layout) {
        return new Map<WindowRecord, SavedWindow>();
      }

      // Found by lineage alone: what an open window does is asked of Lens only when a layout is
      // shown or recalled, which keeps what it found as lineage too.
      const open = windows.get().map((record) => ({
        record,
        reopening: undefined,
        standsFor: lineage
          .get()
          ?.get(lineageKey(layout.name, keyOfWindow(record.window))),
        continues: predecessorsOfKey(keyOfWindow(record.window)),
      }));

      return new Map(
        [...matchOpenWindows(layout.windows, open)].map(
          ([saved, record]) => [record, saved] as const,
        ),
      );
    });

    // Whether the window's tile is where the layout's tiling has the layout's window of that place:
    // on the same screen, in the same cells, or not tiled as then.
    const isTiledAsSaved = (
      window: PlannedWindow,
      layout: SavedWindowLayout,
      index: number,
    ) => {
      const saved = layout.tiling?.windows.find((it) => it.index === index);
      const screen = tilingPlan.resolved
        .get()
        .screens.find((it) =>
          it.windows.some((planned) => planned.key === window.key),
        );
      const placed = screen?.windows.find((it) => it.key === window.key);

      if (!saved || saved.displayId === null) {
        return !screen;
      }

      if (!screen || !placed) {
        return false;
      }

      // A screen connected again under another id is the one saved still.
      const savedScreen = layout.tiling?.screens?.[String(saved.displayId)];
      const displayId =
        (savedScreen &&
          reconnectedIdOf(
            String(saved.displayId),
            savedScreen,
            displays.get(),
          )) ??
        saved.displayId;

      return (
        screen.display.id === displayId &&
        (saved.column === undefined || placed.column === saved.column) &&
        (saved.row === undefined || placed.row === saved.row) &&
        placed.columns === saved.columns &&
        placed.rows === saved.rows
      );
    };

    // Whether the open window differs from what the selected layout saved of it, or is not in it.
    const isUnsaved = (record: WindowRecord) => {
      const saved = savedWindowsOf.get().get(record);

      return !saved || !isShownAsSaved(record, saved);
    };

    // Where and as the layout saved it: in the same state and place; or one normal and the other
    // maximized where the window fills just where the saved one was, as a window tiled alone on a
    // screen fills its work area and is told maximized for it.
    const isShownAsSaved = (record: WindowRecord, saved: SavedWindow) => {
      const state = record.state.get();

      if (state === saved.state) {
        return isNear(record.normalBounds.get(), saved.normalBounds, 2);
      }

      const either = new Set([state, saved.state]);

      return (
        either.has("normal") &&
        either.has("maximized") &&
        isNear(record.bounds.get(), saved.normalBounds, 2)
      );
    };

    // A window being closed has no place in the plan while Lens lists it still, nor one a recall
    // opened again with no tile to go to, until the recall has placed it. Any other window has
    // its place at once: Lens answers which window it opened as soon as it lists it.
    tilingPlan.followAliases(
      computed(() => {
        const aliases = new Map<string, string>();

        for (const record of windows.get()) {
          const key = keyOfWindow(record.window);

          if (closing.has(key) || recalled.has(key)) {
            aliases.set(key, leftOutOfPlan);
          }
        }

        return aliases;
      }),
    );

    // The window being renamed, by key, and the name it is getting.
    const renamingWindow = observable.box<string | undefined>(undefined);
    const windowNameDraft = observable.box("");

    // The window as Lens lists it among its sub-windows, by its key, or by its title where only one
    // window has it: the listed id is Lens's own.
    const listedSubWindowOf = (
      window: PlannedWindow,
      listed: readonly ListedSubWindow[],
    ) => {
      const title = window.record.title.get();
      const byTitle = listed.filter((it) => it.title === title);

      return (
        listed.find((it) => it.id === window.key) ??
        (byTitle.length === 1 ? byTitle[0] : undefined)
      );
    };

    // How to open the window not open again: as the layout kept it, for a window of the layout's
    // missing from the start, or as Lens described it as it closed.
    const reopeningOf = async (
      window: PlannedWindow,
    ): Promise<WindowReopening | undefined> => {
      const ofLayout = savedWindowOf(window);

      return ofLayout
        ? (ofLayout.reopening ?? undefined)
        : reopeningOfClosedWindow(window);
    };

    // Where and as the layout saved the window.
    const savedPlacementOf = (
      saved: SavedWindow,
    ): WindowReopeningPlacement => ({
      bounds: saved.normalBounds,
      state: saved.state,
      ...(saved.displayId === undefined ? {} : { displayId: saved.displayId }),
    });

    // Where a window not open is created when opened again from its tile, so that it shows there
    // from its first frame on: as the selected layout saved it while its tile is where the layout
    // tiled it, so that it is as saved once open; otherwise over its tile on a screen connected, or
    // else where its layout has it.
    const reopeningPlacementOf = (
      window: PlannedWindow,
    ): WindowReopeningPlacement | undefined => {
      const layout = model.selectedLayout.get();
      const standsFor = standsForOf(window);
      const index =
        layout?.windows.findIndex(
          (it) => keyOfWindow(it.window) === standsFor,
        ) ?? -1;

      if (layout && index !== -1 && isTiledAsSaved(window, layout, index)) {
        return savedPlacementOf(layout.windows[index]);
      }

      const screen = tilingPlan.resolved
        .get()
        .screens.find(
          (it) =>
            !it.missing &&
            it.windows.some((planned) => planned.key === window.key),
        );
      const placed = screen?.windows.find((it) => it.key === window.key);

      if (screen && placed) {
        return {
          bounds: boundsInGrid(
            screen.display.workArea.get(),
            screen.columns,
            screen.rows,
            placed,
          ),
          state: "normal",
          displayId: screen.display.id,
        };
      }

      const saved = savedWindowOf(window);

      return saved ? savedPlacementOf(saved) : undefined;
    };

    // The key of the selected layout's window a window not open is: its own, when the layout has it,
    // or the one it was opened again as before.
    const standsForOf = (window: PlannedWindow) => {
      const saved = savedWindowOf(window);

      if (saved) {
        return keyOfWindow(saved.window);
      }

      const has = (key: string) =>
        model.selectedLayout
          .get()
          ?.windows.some((it) => keyOfWindow(it.window) === key);

      return has(window.key)
        ? window.key
        : (lineage.get()?.get(lineageKey(selected.get() ?? "", window.key)) ??
            predecessorsOfKey(window.key).find(has) ??
            window.key);
    };

    // The layout's window a window not open stands for, when it was missing from the start.
    const savedWindowOf = (window: PlannedWindow) =>
      window.key.startsWith("missing:")
        ? savedWindowOfKey(
            model.selectedLayout.get()?.windows ?? [],
            window.key,
          )
        : undefined;

    // Opens the place in a window of its own in the cell: its tile is there from the start, showing
    // it being opened, and the window is created over the cell, never moved there once shown. The
    // tile is the window as soon as Lens lists it, by the window's own key, before it shows.
    const openPlaceInCell = async (place: Place, cell: Cell, title: string) => {
      const id = `${Date.now()}-${nextPlaceWindow++}`;
      const key = `${openingPrefix}${id}`;
      const screen = tilingPlan.resolved
        .get()
        .screens.find((it) => it.display.id === cell.displayId);

      const bounds =
        screen &&
        boundsInGrid(
          screen.display.workArea.get(),
          screen.columns,
          screen.rows,
          {
            column: cell.column,
            row: cell.row,
            columns: 1,
            rows: 1,
          } as PlacedWindow,
        );

      runInAction(() => {
        tilingPlan.placeOpening(key, title, cell);
        tilingChanged.set(true);
        opening.add(key);
      });

      // The tile's key until Lens tells which window it is, then the window's own.
      let tile = key;

      // Failing tells why, once asked below: what it settles to, not a rejection left unhandled
      // while Lens is asked for the window.
      const failure = openPlace({
        id,
        params: place,
        ...(bounds
          ? {
              placement: {
                bounds,
                state: "normal",
                displayId: cell.displayId,
              },
            }
          : {}),
      }).then(
        () => undefined,
        (error: unknown) => ({ error }),
      );

      try {
        // The window Lens shows the place in, listed under an id of Lens's own: answered as soon as
        // it is listed, before it shows; none when the opening failed before choosing one.
        const shown = await windowRecordOf({
          kind: getSubWindowKindId(placesSubWindowKind, di.scopeIds),
          id,
        } as WindowId).catch(() => undefined);

        if (shown) {
          runInAction(() => {
            tilingPlan.rekey(key, shown.window);
            opening.delete(key);
          });

          tile = keyOfWindow(shown.window);
        }

        const failed = await failure;

        // Told why in the dialog, as nothing else tells: a window that never shows, as one of a
        // cluster Lens cannot connect to, is not told of otherwise. The cell is left empty.
        if (failed) {
          runInAction(() => {
            tilingPlan.forget(tile);
            status.set(
              `Could not open "${title}": ${failed.error instanceof Error ? failed.error.message : String(failed.error)}`,
            );
          });
        } else if (!shown) {
          // Opened, but into no window Lens tells of, as while windows may not be arranged.
          runInAction(() => tilingPlan.forget(key));
        }
      } finally {
        runInAction(() => opening.delete(key));
      }
    };

    // Tiles the windows as the plan has them once the edits to it pause, as a few clicks in a row.
    let tileTimer: ReturnType<typeof setTimeout> | undefined;

    const tileSoon = () => {
      cancel(tileTimer);
      tileTimer = later(() => void model.tile(), 300);
    };

    const showTilingOf = action((name: string | undefined) => {
      selected.set(name);
      tilingChanged.set(false);
    });

    const model = {
      layouts,
      status,
      // Without Lens Studio Lens lists no windows, and nothing can be arranged.
      canArrange: computed(() => windows.get().length > 0),

      // How many screens the layout's tiling has windows on that are not connected now.
      missingScreensOf: (layout: SavedWindowLayout) => {
        const connected = new Set(displays.get().map((display) => display.id));
        const used = new Set(
          layout.tiling?.windows.map((it) => it.displayId) ?? [],
        );

        // A screen connected again under another id is not missing.
        return Object.entries(layout.tiling?.screens ?? {}).filter(
          ([id, screen]) =>
            used.has(Number(id)) &&
            !connected.has(Number(id)) &&
            reconnectedIdOf(id, screen, displays.get()) === undefined,
        ).length;
      },

      reset: action(() => {
        renaming.set(undefined);
        status.set(undefined);
      }),

      // Saves the windows as they are now as a new layout of a name of its own, every window left
      // out of tiling, and selects it.
      create: async () => {
        if (!model.canArrange.get()) {
          return;
        }

        const name = nextLayoutName(layouts.get()?.map((it) => it.name) ?? []);

        // A new layout starts with every window left as it is, for Tile all or dragging to place.
        tilingPlan.leaveAllAsTheyAre();
        await saveWindowLayout(name);

        runInAction(() => {
          showTilingOf(name);
          status.set(undefined);
          // Its name ready to be typed over, as a new layout is to be named.
          renaming.set(name);
          renameDraft.set(name);
        });
      },

      // Copies the selected layout as saved, its tiling with it, and selects the copy, its name ready
      // to be typed over as a new layout's is.
      duplicate: async () => {
        const from = selected.get();
        const name = from && (await duplicateWindowLayout(from));

        if (!name) {
          return;
        }

        await model.select(name);

        runInAction(() => {
          renaming.set(name);
          renameDraft.set(name);
        });
      },

      // Saves the windows as they are now, and the tiling below, over the selected layout.
      saveOver: async (name: string) => {
        const count = await saveWindowLayout(name);

        runInAction(() => {
          showTilingOf(name);
          // Saved where they are, the windows are in place: their tiles stand for them as they are.
          acceptWhereWindowsAre();
          status.set(undefined);
        });

        showSaved(`Saved ${plural(count, "window")} and the tiling.`);
      },

      // Puts the windows back where the layout has them, and tells what went otherwise, if anything.
      recall: async (name: string) => {
        runInAction(() => reopening.set(true));

        // The tile of a window of the layout not open, missing from the start or closed since.
        // By the window's own key, whatever place in the layout its tile's key was made with.
        const missingTileOf = (saved: SavedWindow) => {
          const plan = tilingPlan.resolved.get();

          return [
            ...plan.screens.flatMap((screen) => screen.windows),
            ...plan.untiled,
          ].find(
            (it) =>
              it.missing &&
              (savedWindowOfKey([saved], it.key) === saved ||
                // A tile going by a window opened again as the layout's, closed since.
                (selected.get() === name &&
                  standsForOf(it) === keyOfWindow(saved.window))),
          );
        };

        // The tile of each window being opened again, by the layout's window.
        const tiles = new Map<SavedWindow, string>();

        // Each window opened again is its tile as soon as Lens answers with it; one Lens answers
        // none for stays not open in it.
        const result = await recallWindowLayout(name, {
          reopening: (saved) => {
            const tile = missingTileOf(saved);

            if (tile) {
              runInAction(() => {
                tiles.set(saved, tile.key);
                opening.add(tile.key);
              });
            }
          },
          reopened: (saved, _index, window) => {
            const key = tiles.get(saved);

            runInAction(() => {
              if (key) {
                opening.delete(key);
              }

              if (window && key) {
                tilingPlan.rekey(key, window);
              } else if (window) {
                recalled.add(keyOfWindow(window));
              }
            });
          },
          // The recall's plan has every window by its own key, in the one step.
          placed: () =>
            runInAction(() => {
              recalled.clear();
              reopening.set(false);
            }),
        }).finally(() =>
          runInAction(() => {
            for (const key of tiles.values()) {
              opening.delete(key);
            }

            recalled.clear();
            reopening.set(false);
          }),
        );

        if (!result) {
          return;
        }

        showTilingOf(name);

        const notes = [
          ...(result.screensChanged
            ? ["the screens are not the ones it was saved on"]
            : []),
          ...(result.movedToPrimary.length > 0
            ? [
                `moved onto the primary screen, as their place is on no screen now: ${result.movedToPrimary.join(", ")}`,
              ]
            : []),
          ...(result.notOpen.length > 0
            ? [
                `closed, and could not be opened again: ${result.notOpen.join(", ")}`,
              ]
            : []),
        ];

        runInAction(() =>
          status.set(
            notes.length > 0
              ? `Recalled "${name}", placing ${plural(result.placed, "window")}. Note: ${notes.join("; ")}.`
              : undefined,
          ),
        );
      },

      renaming,
      renameDraft,
      canRename: computed(() => renameDraft.get().trim() !== ""),

      startRenaming: action((name: string) => {
        renaming.set(name);
        renameDraft.set(name);
      }),

      setRenameDraft: action((name: string) => renameDraft.set(name)),
      cancelRenaming: action(() => renaming.set(undefined)),

      // Renames the layout to the name typed; an empty or unchanged name leaves it as it was.
      rename: async () => {
        const from = renaming.get();
        const to = renameDraft.get().trim();

        if (from === undefined) {
          return;
        }

        if (to === "" || to === from) {
          runInAction(() => renaming.set(undefined));

          return;
        }

        const result = await renameWindowLayout(from, to);

        runInAction(() => {
          if (result === "name-taken") {
            status.set(
              `There is a layout called "${to}" already. Pick another name.`,
            );

            return;
          }

          renaming.set(undefined);

          if (result === "renamed" && selected.get() === from) {
            selected.set(to);
          }

          status.set(undefined);
        });
      },

      // The editor's edits mark the setup of the layout it shows as changed, and tile the windows so.
      tilingPlan: {
        ...tilingPlan,
        commit: action((plan: Parameters<typeof tilingPlan.commit>[0]) => {
          tilingPlan.commit(plan);
          tilingChanged.set(true);
          tileSoon();
        }),
        autoTile: action(() => {
          tilingPlan.autoTile();
          tilingChanged.set(true);
          tileSoon();
        }),
      },

      selected,
      tilingChanged,
      savedNote,
      selectedLayout: computed(() =>
        layouts.get()?.find((it) => it.name === selected.get()),
      ),

      // Whether saving the selected layout would change nothing: its tiling not changed since it
      // was selected, and the windows open the layout's, each where and as it was saved.
      // Whether saving would change nothing: no window out of place, open or not, and the tiling as
      // saved. A window of the layout not open is no reason to save, as saving keeps it as it was.
      isSelectedSaved: computed((): boolean => {
        const layout = model.selectedLayout.get();

        const plan = tilingPlan.resolved.get();
        const notOpen = [
          ...plan.screens.flatMap((screen) => screen.windows),
          ...plan.untiled,
        ].filter((window) => window.missing);

        return (
          !!layout?.tiling &&
          !tilingChanged.get() &&
          !windows.get().some(isUnsaved) &&
          !notOpen.some((window) => model.isOutOfPlace(window))
        );
      }),

      // Shows the layout's tiling setup in the editor, the windows staying where they are.
      select: async (name: string) => {
        if (selected.get() === name && !tilingChanged.get()) {
          return;
        }

        showTilingOf(name);

        const result = await layoutTiling.load(name);

        runInAction(() => {
          if (!result) {
            selected.set(undefined);
          } else {
            tilingChanged.set(false);
            status.set(undefined);
          }
        });
      },

      // Tiling needs a window on some screen.
      // Whether the window is not where the plan has it: elsewhere, or not shown normally. A window
      // not open, or on a screen not connected, is not tiled, and is never off its tiling.
      isOffTiling: (window: PlacedWindow, screen: PlannedScreen): boolean => {
        if (window.missing || screen.missing) {
          return false;
        }

        const bounds = window.record.bounds.get();
        const planned = boundsInGrid(
          screen.display.workArea.get(),
          screen.columns,
          screen.rows,
          window,
        );
        const settledAt = settled.get(placementOf(window, screen));

        // Where it settled, or was saved, is in place however it shows.
        if (settledAt && isNear(bounds, settledAt, 2)) {
          return false;
        }

        return (
          window.record.state.get() !== "normal" || !isNear(bounds, planned, 4)
        );
      },

      // Whether the window differs from what the selected layout saved of it: not where it was, not
      // shown as it was, or not saved in it at all, as one opened since, open or closed again.
      isOutOfPlace: (
        window: PlannedWindow,
        _screen?: PlannedScreen,
      ): boolean => {
        const layout = model.selectedLayout.get();

        if (!layout) {
          return false;
        }

        // Not open, it differs from what was saved when the layout has it not at all, as one opened
        // after saving and closed since, or when its tile is not where the layout's tiling has it:
        // moved, resized, or tiled or not unlike then. Where the window itself is cannot differ.
        if (window.missing) {
          const key = standsForOf(window);
          const index = layout.windows.findIndex(
            (it) => keyOfWindow(it.window) === key,
          );

          return index === -1 || !isTiledAsSaved(window, layout, index);
        }

        return isUnsaved(window.record);
      },

      // Whether every window is where the plan has it already.
      isTiledAsShown: computed((): boolean =>
        tiledWindowsOf(tilingPlan.resolved.get()).every(
          ({ window, screen }) => !model.isOffTiling(window, screen),
        ),
      ),

      // Tiling needs a window to tile, and something to change.
      canTile: computed(
        (): boolean =>
          model.canArrange.get() &&
          tilingPlan.resolved
            .get()
            .screens.some(
              (it) =>
                !it.missing && it.windows.some((window) => !window.missing),
            ) &&
          !model.isTiledAsShown.get(),
      ),

      tile: async () => {
        try {
          await tileWindows();
          // Never ends once the model is thrown away, so nothing is taken from windows then.
          await new Promise((resolve) =>
            later(() => resolve(undefined), settleMs),
          );

          runInAction(() => {
            acceptWhereWindowsAre();
            status.set(undefined);
          });
        } catch (error) {
          runInAction(() =>
            status.set(`Could not tile the windows: ${String(error)}`),
          );
        }
      },

      // Closes the window, when it is open, and takes it out of the tiling, so that saving takes it
      // out of the layout. The application window is not closed.
      closeWindow: async (window: PlannedWindow) => {
        if (isApplicationWindow(window.record.window)) {
          return;
        }

        if (window.missing) {
          runInAction(() => {
            tilingPlan.forget(window.key);
            tilingChanged.set(true);
          });

          return;
        }

        const title = window.record.title.get();
        const own = keyOfWindow(window.record.window);
        const sub = listedSubWindowOf(window, await getSubWindows());

        if (!sub) {
          runInAction(() =>
            status.set(
              `Could not close "${title}": Lens does not list it as a window of its own.`,
            ),
          );

          return;
        }

        // Its tile goes at once, and the window has no place in the plan while Lens lists it still,
        // so that it shows neither as not open nor as a window of its own meanwhile. The windows
        // closed before, gone by now, are forgotten.
        runInAction(() => {
          for (const key of [...closing]) {
            if (!windows.get().some((it) => keyOfWindow(it.window) === key)) {
              closing.delete(key);
            }
          }

          closing.add(own);
          tilingPlan.forget(window.key);
          tilingChanged.set(true);
        });

        try {
          await closeAnySubWindow(sub.id);
        } catch (error) {
          // Not closed: it shows again, as not tiled.
          runInAction(() => {
            closing.delete(own);
            status.set(`Could not close "${title}": ${String(error)}`);
          });
        }
      },

      // Whether a window of its own can be opened on a place, as with Lens Studio.
      canOpenPlaces,
      clusters: computed(() => clusters.get()?.get() ?? []),

      // Opens the place, a cluster's list of pods say, in a window of its own, in the cell, its tile
      // named as given until the window shows.
      openInCell: (place: Place, cell: Cell, title: string) =>
        openPlaceInCell(place, cell, title),

      reopening,
      // Whether the window not open can be opened again: as the layout kept it, when Lens can open
      // that now, or as Lens described it as it closed, which it is asked for when opening it.
      canReopen: (window: PlannedWindow) => {
        if (!window.missing || window.key.startsWith(openingPrefix)) {
          return false;
        }

        const ofLayout = savedWindowOf(window);

        if (ofLayout) {
          return (
            !!ofLayout.reopening &&
            canReopenWindowReactive(ofLayout.reopening).get()
          );
        }

        return !!window.closed;
      },

      isReopeningWindow: (window: PlannedWindow) => opening.has(window.key),

      // Opens the window not open again, as it was, where its tile is, and focuses it: the window
      // Lens answers with is the tile's from then on. Lens answering none leaves it not open.
      reopenWindow: async (window: PlannedWindow) => {
        const { key } = window;

        if (opening.has(key)) {
          return;
        }

        const title = window.record.title.get();
        const placement = reopeningPlacementOf(window);
        const tile = {
          standsFor: standsForOf(window),
          // The window itself, not the place in the layout its tile's key may go by too.
          previous: /^missing:\d+:(.*)$/s.exec(key)?.[1] ?? key,
        };

        runInAction(() => opening.add(key));

        try {
          const kept = await reopeningOf(window);
          const reopened =
            kept &&
            (await reopenWindow(kept, placement).catch(() => undefined));

          if (!reopened) {
            runInAction(() => status.set(`Could not open "${title}" again.`));

            return;
          }

          // Created over its tile already: no other window is moved for it.
          tileReopened(key, reopened, tile);
          await focusWindow(reopened);
        } finally {
          runInAction(() => opening.delete(key));
        }
      },

      // Renaming a window, as a layout is: Enter or leaving the name keeps it, Escape the old one.
      // Only a sub-window open can be renamed; the window keeps the name, whatever it shows.
      canRenameWindow: (window: PlannedWindow) =>
        !window.missing &&
        !isApplicationWindow(window.record.window) &&
        !!listedSubWindowOf(window, subWindowsOfLens.get()),
      renamingWindow,
      windowNameDraft,
      startRenamingWindow: action((window: PlannedWindow) => {
        renamingWindow.set(window.key);
        windowNameDraft.set(window.record.title.get());
      }),
      setWindowNameDraft: action((text: string) => windowNameDraft.set(text)),
      cancelRenamingWindow: action(() => renamingWindow.set(undefined)),
      renameWindow: async (window: PlannedWindow) => {
        if (renamingWindow.get() !== window.key) {
          return;
        }

        const name = windowNameDraft.get().trim();

        runInAction(() => renamingWindow.set(undefined));

        if (!name || name === window.record.title.get()) {
          return;
        }

        const sub = listedSubWindowOf(window, await getSubWindows());

        if (sub) {
          await renameAnySubWindow(sub.id, name);
        }
      },

      clusterSearch,
      setClusterSearch: action((text: string) => clusterSearch.set(text)),
      pageSearch,
      setPageSearch: action((text: string) => pageSearch.set(text)),

      // Deletes the layout once the user confirms it.
      remove: async (name: string) => {
        if (!(await confirmDelete(name))) {
          return;
        }

        await deleteWindowLayout(name);
        runInAction(() => {
          if (selected.get() === name) {
            showTilingOf(undefined);
          }

          status.set(undefined);
        });
      },
    };

    // Stops what the model started, called as it is thrown away.
    const dispose = () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }

      timers.clear();
    };

    const disposable = Object.assign(model, { dispose });

    return () => disposable;
  },
});
