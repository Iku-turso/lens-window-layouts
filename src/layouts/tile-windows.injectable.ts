import { getInjectable2 } from "@k8slens/injectable";
import {
  displayRecordsInjectionToken,
  focusWindowInjectionToken,
  setWindowBoundsInjectionToken,
  setWindowStateInjectionToken,
  windowRecordsInjectionToken,
  type WindowPlacement,
} from "@k8slens/window-layout-contracts";
import { boundsInGrid, resolveTilingPlan } from "./tiling-plan";
import { storedTilingPlanBunch } from "./tiling-plan.injectable";

export interface TileResult {
  readonly windows: number;
  readonly displays: number;
  // The screens windows were tiled on.
  readonly displaysTiled: number;
  readonly placed: number;
}

// Tiles the windows as the tiling plan says: each over the cells it spans in its screen's grid, in
// the plan's order. A window maximized, minimized or full screen shows normally again first, so it
// can be placed. Windows the plan leaves as they are stay so. Brings the tiled windows to the
// front, the one that had focus last so it keeps it.
export const tileWindowsInjectable = getInjectable2({
  id: "window-manager.tile-windows",
  consumptions: [
    windowRecordsInjectionToken,
    displayRecordsInjectionToken,
    setWindowBoundsInjectionToken,
    setWindowStateInjectionToken,
    focusWindowInjectionToken,
  ],

  instantiate: (di) => {
    const getWindowRecords = di.inject(windowRecordsInjectionToken)();
    const getDisplayRecords = di.inject(displayRecordsInjectionToken)();
    const setWindowBounds = di.inject(setWindowBoundsInjectionToken)();
    const setWindowState = di.inject(setWindowStateInjectionToken)();
    const focusWindow = di.inject(focusWindowInjectionToken)();
    const getStoredPlan = di.inject(storedTilingPlanBunch.persistable);

    const tileWindows = async (): Promise<TileResult> => {
      const allDisplays = await getDisplayRecords();
      const allWindows = await getWindowRecords();
      const plan = resolveTilingPlan(
        allWindows,
        allDisplays,
        (await getStoredPlan()).get() ?? undefined,
      );
      // A screen not connected is not tiled; its windows stay where they are.
      // Nor is a window not open.
      const screens = plan.screens
        .filter((screen) => !screen.missing)
        .map((screen) => ({
          ...screen,
          windows: screen.windows.filter((it) => !it.missing),
        }))
        .filter((screen) => screen.windows.length > 0);
      const tiled = screens.flatMap((screen) =>
        screen.windows.map((it) => it.record),
      );

      const placements: WindowPlacement[] = screens.flatMap((screen) =>
        screen.windows.map((it) => ({
          window: it.record.window,
          bounds: boundsInGrid(
            screen.display.workArea.get(),
            screen.columns,
            screen.rows,
            it,
          ),
        })),
      );

      // Read before placing, which may move the focus.
      const toFront = [...tiled].sort(
        (a, b) => Number(a.isFocused.get()) - Number(b.isFocused.get()),
      );

      for (const window of tiled) {
        if (window.state.get() !== "normal") {
          await setWindowState(window.window, "normal");
        }
      }

      await setWindowBounds(placements);

      for (const window of toFront) {
        await focusWindow(window.window);
      }

      return {
        windows: allWindows.length,
        displays: allDisplays.length,
        displaysTiled: screens.length,
        placed: placements.length,
      };
    };

    return () => tileWindows;
  },
});
