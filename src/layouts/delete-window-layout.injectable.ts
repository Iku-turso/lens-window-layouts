import { getInjectable2 } from "@k8slens/injectable";
import { runInAction } from "mobx";
import { savedWindowLayoutsBunch } from "./saved-window-layouts.injectable";

export const deleteWindowLayoutInjectable = getInjectable2({
  id: "window-manager.delete-window-layout",

  instantiate: (di) => {
    const getSavedLayouts = di.inject(savedWindowLayoutsBunch.persistable);

    return () => async (name: string) => {
      const savedLayouts = await getSavedLayouts();

      runInAction(() => savedLayouts.delete(name));
    };
  },
});
