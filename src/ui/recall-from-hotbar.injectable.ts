import { getInjectable2 } from "@k8slens/injectable";
import { showInfoNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { windowLayoutsModelInjectable } from "./window-layouts-model.injectable";

// Recalls a layout, telling in a notification what went otherwise, as the dialog is not open to.
export const recallFromHotbarInjectable = getInjectable2({
  id: "window-manager.recall-from-hotbar",
  consumptions: [showInfoNotificationInjectionToken],

  instantiate: (di) => {
    const model = di.inject(windowLayoutsModelInjectable)();
    const showInfoNotification = di.inject(showInfoNotificationInjectionToken)();

    return () => async (name: string) => {
      const note = await model.recall(name);

      if (note) {
        showInfoNotification(note);
      }
    };
  },
});
