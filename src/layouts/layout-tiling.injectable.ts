import { getInjectable2 } from "@k8slens/injectable";
import type { WindowId } from "@k8slens/messaging-contracts";
import {
  displayRecordsInjectionToken,
  windowRecordsInjectionToken,
} from "@k8slens/window-layout-contracts";
import { runInAction } from "mobx";
import { matchOpenWindows, toSavedTiling, toTilingPlan } from "./layout-tiling";
import {
  savedWindowLayoutsBunch,
  type SavedWindow,
} from "./saved-window-layouts.injectable";
import { keyOfWindow, resolveTilingPlan } from "./tiling-plan";
import { storedTilingPlanBunch } from "./tiling-plan.injectable";
import {
  continuedWindowsOf,
  lineageKey,
  windowContinuesBunch,
  windowLineageBunch,
} from "./window-lineage.injectable";

// A layout's tiling setup, between the layout and the current setup the editor shows, the open
// windows standing for the layout's windows as when it is recalled.
export const layoutTilingInjectable = getInjectable2({
  id: "window-manager.layout-tiling",
  consumptions: [windowRecordsInjectionToken, displayRecordsInjectionToken],

  instantiate: (di) => {
    const getWindowRecords = di.inject(windowRecordsInjectionToken)();
    const getDisplayRecords = di.inject(displayRecordsInjectionToken)();
    const getSavedLayouts = di.inject(savedWindowLayoutsBunch.persistable);
    const getStoredTilingPlan = di.inject(storedTilingPlanBunch.persistable);
    const getWindowLineage = di.inject(windowLineageBunch.persistable);
    const getWindowContinues = di.inject(windowContinuesBunch.persistable);

    // The open windows standing for the layout's: the same window, the one opened again as it, as the
    // layout found or opened it before, or one doing the same.
    const matchLayout = async (
      name: string,
      windows: readonly SavedWindow[],
    ) => {
      const records = await getWindowRecords();
      const lineage = await getWindowLineage();
      const continues = await getWindowContinues();
      const open = await Promise.all(
        records.map(async (record) => ({
          record,
          reopening: await record.describeReopening(),
          standsFor: lineage.get(lineageKey(name, keyOfWindow(record.window))),
          continues: continuedWindowsOf(
            keyOfWindow(record.window),
            continues,
            lineage,
          ),
        })),
      );

      return { records, matches: matchOpenWindows(windows, open) };
    };

    return () => ({
      // Makes the layout's tiling setup the current one, the windows staying where they are; every
      // window of the layout is in it, one not open as missing. Resolves whether there is such a layout.
      load: async (name: string) => {
        const layout = (await getSavedLayouts()).get(name);

        if (!layout) {
          return false;
        }

        const { matches } = await matchLayout(name, layout.windows);
        const lineage = await getWindowLineage();

        // Each open window found as one of the layout's under another key is kept so, for the
        // layout: once closed, its tile knows which of the layout's windows it is, and opened again
        // it is that one still.
        runInAction(() => {
          for (const [saved, record] of matches) {
            const key = keyOfWindow(record.window);
            const savedKey = keyOfWindow(saved.window);

            if (
              key !== savedKey &&
              lineage.get(lineageKey(name, key)) !== savedKey
            ) {
              lineage.set(lineageKey(name, key), savedKey);
            }
          }
        });

        const windowOf = new Map<SavedWindow, WindowId>(
          [...matches].map(([saved, record]) => [saved, record.window]),
        );
        const stored = await getStoredTilingPlan();

        const plan = toTilingPlan(
          layout.tiling,
          layout.windows,
          windowOf,
          await getDisplayRecords(),
        );

        runInAction(() => stored.set(plan));

        return true;
      },
    });
  },
});
