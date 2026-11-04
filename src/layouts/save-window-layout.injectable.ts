import { getInjectable2 } from "@k8slens/injectable";
import {
  displayRecordsInjectionToken,
  windowRecordsInjectionToken,
} from "@k8slens/window-layout-contracts";
import { isApplicationWindow } from "@k8slens/messaging-contracts";
import { runInAction } from "mobx";
import { savedWindowOfKey, toSavedTiling } from "./layout-tiling";
import {
  savedWindowLayoutsBunch,
  type SavedWindow,
} from "./saved-window-layouts.injectable";
import { toSavedDisplay } from "./screens";
import {
  boundsInGrid,
  keyOfWindow,
  resolveTilingPlan,
  windowOfKey,
  type PlacedWindow,
  type PlannedScreen,
  type PlannedWindow,
} from "./tiling-plan";
import { reopeningOfClosedWindowInjectable } from "./reopening-of-closed-window.injectable";
import { storedTilingPlanBunch } from "./tiling-plan.injectable";

// Saves where every open window is and how it shows, what it does so it can be opened again once
// closed, the screens they are on, and the tiling setup as it is now, under the name, replacing a
// layout of the same name. A window of that layout not open now stays in it as it was kept, its
// tile with it: only taking it out of the layout drops it.
export const saveWindowLayoutInjectable = getInjectable2({
  id: "window-manager.save-window-layout",
  consumptions: [windowRecordsInjectionToken, displayRecordsInjectionToken],

  instantiate: (di) => {
    const getWindowRecords = di.inject(windowRecordsInjectionToken)();
    const getDisplayRecords = di.inject(displayRecordsInjectionToken)();
    const getSavedLayouts = di.inject(savedWindowLayoutsBunch.persistable);
    const getStoredTilingPlan = di.inject(storedTilingPlanBunch.persistable);
    const reopeningOfClosedWindow = di.inject(
      reopeningOfClosedWindowInjectable,
    )();

    return () => async (name: string) => {
      const savedLayouts = await getSavedLayouts();
      const displays = await getDisplayRecords();
      const records = await getWindowRecords();

      const savedWindows = await Promise.all(
        records.map(async (record): Promise<SavedWindow> => {
          const reopening = await record.describeReopening();

          return {
            window: isApplicationWindow(record.window)
              ? record.window
              : { kind: record.window.kind, id: record.window.id },
            title: record.title.get(),
            ...(reopening ? { reopening } : {}),
            normalBounds: { ...record.normalBounds.get() },
            state: record.state.get(),
            isFocused: record.isFocused.get(),
            displayId: record.displayId.get(),
          };
        }),
      );

      const plan = resolveTilingPlan(
        records,
        displays,
        (await getStoredTilingPlan()).get() ?? undefined,
      );
      const previous = savedLayouts.get(name);
      const openKeys = new Set(
        records.map((record) => keyOfWindow(record.window)),
      );

      // The windows not open now, by the key their tiles go by: one of the layout's as it kept it,
      // one missing since the layout was shown going by its place in the layout, one closed since by
      // its own key; one the layout has not, opened since and closed again, as Lens described it as
      // it closed, placed where its tile is, so that it is saved too.
      const notOpenFound = await Promise.all(
        [
          ...plan.screens.flatMap((screen) =>
            screen.windows.map(
              (window): { window: PlannedWindow; screen?: PlannedScreen } => ({
                window,
                screen,
              }),
            ),
          ),
          ...plan.untiled.map(
            (window): { window: PlannedWindow; screen?: PlannedScreen } => ({
              window,
            }),
          ),
        ]
          .filter(({ window }) => window.missing)
          .map(
            async ({
              window,
              screen,
            }): Promise<{ key: string; kept: SavedWindow }[]> => {
              const { key, record, closed, ...placed } = window;
              const kept = savedWindowOfKey(previous?.windows ?? [], key);

              // A window open is saved as it is, once.
              if (kept && openKeys.has(keyOfWindow(kept.window))) {
                return [];
              }

              if (kept) {
                return [{ key, kept }];
              }

              if (!screen || screen.missing || !("column" in placed)) {
                return [];
              }

              const reopening = await reopeningOfClosedWindow(window);

              if (!reopening) {
                return [];
              }

              return [
                {
                  key,
                  kept: {
                    // The window itself, not what stands in for it while it is not open.
                    window: closed ?? windowOfKey(key),
                    title: record.title.get(),
                    reopening,
                    normalBounds: boundsInGrid(
                      screen.display.workArea.get(),
                      screen.columns,
                      screen.rows,
                      {
                        key,
                        record,
                        ...placed,
                      } as PlacedWindow,
                    ),
                    state: "normal",
                    isFocused: false,
                    displayId: screen.display.id,
                  },
                },
              ];
            },
          ),
      );

      const notOpen = notOpenFound.flat();

      const windows = [...savedWindows, ...notOpen.map(({ kept }) => kept)];

      const indexByKey = new Map([
        ...records.map(
          (record, index) => [keyOfWindow(record.window), index] as const,
        ),
        ...notOpen.map(
          ({ key }, index) => [key, savedWindows.length + index] as const,
        ),
      ]);

      const tiling = toSavedTiling(plan, indexByKey);

      runInAction(() =>
        savedLayouts.set(name, {
          name,
          savedAt: Date.now(),
          windows,
          displays: displays.map(toSavedDisplay),
          tiling,
        }),
      );

      return windows.length;
    };
  },
});
