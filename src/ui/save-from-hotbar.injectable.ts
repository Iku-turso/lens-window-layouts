import { getInjectable2 } from "@k8slens/injectable";
import {
  showErrorNotificationInjectionToken,
  showSuccessNotificationInjectionToken,
} from "@k8slens/notifications-contracts";
import { windowLayoutsModelInjectable } from "./window-layouts-model.injectable";

// Tiles the windows as a layout's tiling has them and saves them into it, telling in a notification
// how it went, as the dialog is not open to.
export const saveFromHotbarInjectable = getInjectable2({
  id: "window-manager.save-from-hotbar",
  consumptions: [
    showSuccessNotificationInjectionToken,
    showErrorNotificationInjectionToken,
  ],

  instantiate: (di) => {
    const model = di.inject(windowLayoutsModelInjectable)();
    const showSuccessNotification = di.inject(
      showSuccessNotificationInjectionToken,
    )();
    const showErrorNotification = di.inject(
      showErrorNotificationInjectionToken,
    )();

    return () => async (name: string) => {
      const result = await model.tileAndSaveInto(name);

      if (result === "no-layout") {
        showErrorNotification(`There is no layout called "${name}" to save.`);
      } else if (result === "not-tiled") {
        showErrorNotification(
          `Could not tile the windows, so nothing was saved into "${name}". ${model.status.get() ?? ""}`.trim(),
        );
      } else {
        showSuccessNotification(
          `Tiled and saved ${result} window${result === 1 ? "" : "s"} into "${name}".`,
        );
      }
    };
  },
});
