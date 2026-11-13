import { getInjectable2 } from "@k8slens/injectable";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { windowLayoutsModelInjectable } from "./window-layouts-model.injectable";

// Brings a layout's window to the front, opening it again when not open, telling in a notification
// when it could not be, as the dialog is not open to.
export const showWindowFromHotbarInjectable = getInjectable2({
  id: "window-manager.show-window-from-hotbar",
  consumptions: [showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const model = di.inject(windowLayoutsModelInjectable)();
    const showErrorNotification = di.inject(
      showErrorNotificationInjectionToken,
    )();

    return () => async (name: string, index: number, title: string) => {
      if ((await model.showWindowOf(name, index)) === "not-opened") {
        showErrorNotification(`Could not open "${title}" again.`);
      }
    };
  },
});
