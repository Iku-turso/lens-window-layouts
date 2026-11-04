import { getInjectable2 } from "@k8slens/injectable";
import { computed, observable, runInAction, type ObservableMap } from "mobx";
import {
  savedWindowLayoutsBunch,
  type SavedWindowLayout,
} from "./saved-window-layouts.injectable";

// The saved layouts, newest first, or undefined until the persisted map is read.
export const windowLayoutListInjectable = getInjectable2({
  id: "window-manager.window-layout-list",

  instantiate: (di) => {
    const getSavedLayouts = di.inject(savedWindowLayoutsBunch.persistable);
    const savedLayouts = observable.box<
      ObservableMap<string, SavedWindowLayout> | undefined
    >(undefined, {
      deep: false,
    });

    void getSavedLayouts().then((layouts) =>
      runInAction(() => savedLayouts.set(layouts)),
    );

    const list = computed(() => {
      const layouts = savedLayouts.get();

      return (
        layouts && [...layouts.values()].sort((a, b) => b.savedAt - a.savedAt)
      );
    });

    return () => list;
  },
});
