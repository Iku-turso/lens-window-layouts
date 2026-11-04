import { getInjectable2 } from "@k8slens/injectable";
import { runInAction } from "mobx";
import type { WindowId } from "@k8slens/messaging-contracts";
import {
  canReopenWindowInjectionToken,
  displayRecordsInjectionToken,
  focusWindowInjectionToken,
  reopenWindowInjectionToken,
  setWindowBoundsInjectionToken,
  setWindowStateInjectionToken,
  windowRecordsInjectionToken,
  type WindowBounds,
  type WindowRecord,
} from "@k8slens/window-layout-contracts";
import {
  isSameLineage,
  isSameReopening,
  isSameWindow,
  matchWindows,
  toTilingPlan,
} from "./layout-tiling";
import {
  continuedWindowsOf,
  lineageKey,
  windowContinuesBunch,
  windowLineageBunch,
} from "./window-lineage.injectable";
import {
  savedWindowLayoutsBunch,
  type SavedWindow,
} from "./saved-window-layouts.injectable";
import { keyOfWindow } from "./tiling-plan";
import { fitInto, isReachableOnSomeScreen, isSameScreens } from "./screens";
import { storedTilingPlanBunch } from "./tiling-plan.injectable";

// Told as each window closed since is opened again, one after the other: before, and with the
// window Lens answered with, or none when it could not open it.
export interface RecallProgress {
  readonly reopening?: (saved: SavedWindow, index: number) => void;
  readonly reopened?: (
    saved: SavedWindow,
    index: number,
    window: WindowId | undefined,
  ) => void;
  // Told in the one step that makes the layout's tiling the current one, every window in it by
  // its own key.
  readonly placed?: () => void;
}

export interface RecallResult {
  readonly placed: number;
  // The windows closed since the layout was saved, opened again.
  readonly reopened: readonly string[];
  // The windows closed since that could not be opened again, as when the extension that opened
  // them is gone, or the layout was saved before windows were kept.
  readonly notOpen: readonly string[];
  // The windows whose saved place is on no screen connected now, moved onto the primary screen.
  readonly movedToPrimary: readonly string[];
  // Whether the screens are not those the layout was saved on; unknown for an older layout.
  readonly screensChanged: boolean;
}

// Puts every window of the layout back where it was and how it showed. A window open still, or
// open again doing the same, is moved; a window closed since is opened again; one that cannot be
// stays closed, shown as missing in the tiling. Another window is never moved in its place, as most
// windows are of one kind, a tab in a window of its own, whatever they show. A window whose place
// is on no screen connected now, as when a screen was unplugged since, goes onto the primary screen
// instead. The layout's tiling setup becomes the current one.
export const recallWindowLayoutInjectable = getInjectable2({
  id: "window-manager.recall-window-layout",
  consumptions: [
    windowRecordsInjectionToken,
    displayRecordsInjectionToken,
    setWindowBoundsInjectionToken,
    setWindowStateInjectionToken,
    focusWindowInjectionToken,
    canReopenWindowInjectionToken,
    reopenWindowInjectionToken,
  ],

  instantiate: (di) => {
    const getWindowRecords = di.inject(windowRecordsInjectionToken)();
    const getDisplayRecords = di.inject(displayRecordsInjectionToken)();
    const setWindowBounds = di.inject(setWindowBoundsInjectionToken)();
    const setWindowState = di.inject(setWindowStateInjectionToken)();
    const focusWindow = di.inject(focusWindowInjectionToken)();
    const canReopenWindow = di.inject(canReopenWindowInjectionToken)();
    const reopenWindow = di.inject(reopenWindowInjectionToken)();
    const getSavedLayouts = di.inject(savedWindowLayoutsBunch.persistable);
    const getWindowLineage = di.inject(windowLineageBunch.persistable);
    const getWindowContinues = di.inject(windowContinuesBunch.persistable);
    const getStoredTilingPlan = di.inject(storedTilingPlanBunch.persistable);

    return () =>
      async (
        name: string,
        progress: RecallProgress = {},
      ): Promise<RecallResult | undefined> => {
        const layout = (await getSavedLayouts()).get(name);

        if (!layout) {
          return undefined;
        }

        const lineage = await getWindowLineage();
        const continues = await getWindowContinues();

        const open = await Promise.all(
          (await getWindowRecords()).map(async (record) => ({
            record,
            reopening: await record.describeReopening(),
            standsFor: lineage.get(
              lineageKey(name, keyOfWindow(record.window)),
            ),
            continues: continuedWindowsOf(
              keyOfWindow(record.window),
              continues,
              lineage,
            ),
          })),
        );

        const connected = await getDisplayRecords();
        const workAreas = connected.map((display) => display.workArea.get());
        const primaryWorkArea = (
          connected.find((display) => display.isPrimary.get()) ?? connected[0]
        )?.workArea.get();
        const movedToPrimary: string[] = [];

        const boundsFor = (saved: SavedWindow): WindowBounds => {
          if (
            !primaryWorkArea ||
            isReachableOnSomeScreen(saved.normalBounds, workAreas)
          ) {
            return saved.normalBounds;
          }

          movedToPrimary.push(saved.title);

          return fitInto(
            primaryWorkArea,
            saved.normalBounds,
            movedToPrimary.length - 1,
          );
        };

        const matches = new Map<SavedWindow, WindowRecord>();

        matchWindows(layout.windows, open, matches, [
          isSameWindow,
          isSameLineage,
          isSameReopening,
        ]);

        // Opened again before falling back on the kind, so a window comes back doing what it did
        // rather than another of its kind taking its place.
        const reopened = new Map<SavedWindow, WindowId>();

        for (const saved of layout.windows) {
          if (
            matches.has(saved) ||
            !saved.reopening ||
            !(await canReopenWindow(saved.reopening))
          ) {
            continue;
          }

          const index = layout.windows.indexOf(saved);

          progress.reopening?.(saved, index);

          // Created where and as the layout has it, never moved there once shown. Lens answers once
          // the window is listed, with the id it is listed by.
          const window = await reopenWindow(saved.reopening, {
            bounds: boundsFor(saved),
            state: saved.state,
            ...(saved.displayId === undefined
              ? {}
              : { displayId: saved.displayId }),
          }).catch(() => undefined);

          progress.reopened?.(saved, index, window);

          if (window) {
            reopened.set(saved, window);
            // The window opened again is the layout's window still, whatever Lens describes of it.
            runInAction(() => {
              lineage.set(
                lineageKey(name, keyOfWindow(window)),
                keyOfWindow(saved.window),
              );
              continues.set(keyOfWindow(window), keyOfWindow(saved.window));
            });
          }
        }

        await setWindowBounds(
          [...matches].map(([saved, record]) => ({
            window: record.window,
            bounds: boundsFor(saved),
          })),
        );

        for (const [saved, record] of matches) {
          if (saved.state !== "normal") {
            await setWindowState(record.window, saved.state);
          }
        }

        // Brings every window forward but the minimized ones, which focusing would show again,
        // the one that had focus last so it ends on top with focus.
        const toFront = [
          ...[...matches].map(
            ([saved, record]) => [saved, record.window] as const,
          ),
          ...reopened,
        ]
          .filter(([saved]) => saved.state !== "minimized")
          .sort(([a], [b]) => Number(a.isFocused) - Number(b.isFocused));

        for (const [, window] of toFront) {
          await focusWindow(window);
        }

        const windowOf = new Map<SavedWindow, WindowId>([
          ...[...matches].map(
            ([saved, record]) => [saved, record.window] as const,
          ),
          ...reopened,
        ]);

        const plan = toTilingPlan(
          layout.tiling,
          layout.windows,
          windowOf,
          connected,
        );
        const stored = await getStoredTilingPlan();

        runInAction(() => {
          stored.set(plan);
          progress.placed?.();
        });

        return {
          placed: matches.size + reopened.size,
          reopened: [...reopened.keys()].map((it) => it.title),
          notOpen: layout.windows
            .filter((saved) => !matches.has(saved) && !reopened.has(saved))
            .map((it) => it.title),
          movedToPrimary,
          screensChanged:
            !!layout.displays && !isSameScreens(layout.displays, connected),
        };
      };
  },
});
