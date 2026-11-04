import { getInjectable2 } from "@k8slens/injectable";
import {
  describeClosedWindowInjectionToken,
  type WindowReopening,
} from "@k8slens/window-layout-contracts";
import type { PlannedWindow } from "./tiling-plan";
import { windowReopeningsBunch } from "./window-reopenings.injectable";

// How to open a window not open again, asked at the moment it is needed: as Lens described it as it
// closed, by the id it had while open; for a window closed before Lens did so, as this extension
// last described it while it was open.
export const reopeningOfClosedWindowInjectable = getInjectable2({
  id: "window-manager.reopening-of-closed-window",
  consumptions: [describeClosedWindowInjectionToken],

  instantiate: (di) => {
    const describeClosedWindow = di.inject(
      describeClosedWindowInjectionToken,
    )();
    // Read only, never written any more; see the bunch.
    const getLegacyReopenings = di.inject(windowReopeningsBunch.persistable);

    return () =>
      async (
        window: Pick<PlannedWindow, "key" | "closed">,
      ): Promise<WindowReopening | undefined> =>
        (window.closed && (await describeClosedWindow(window.closed))) ??
        (await getLegacyReopenings()).get(window.key);
  },
});
