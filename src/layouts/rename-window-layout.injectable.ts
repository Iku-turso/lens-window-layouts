import { getInjectable2 } from "@k8slens/injectable";
import { runInAction } from "mobx";
import { savedWindowLayoutsBunch } from "./saved-window-layouts.injectable";

export type RenameResult = "renamed" | "name-taken" | "not-found";

// Renames a layout, keeping what it holds and when it was saved. Never replaces another layout.
export const renameWindowLayoutInjectable = getInjectable2({
  id: "window-manager.rename-window-layout",

  instantiate: (di) => {
    const getSavedLayouts = di.inject(savedWindowLayoutsBunch.persistable);

    return () =>
      async (from: string, to: string): Promise<RenameResult> => {
        const savedLayouts = await getSavedLayouts();
        const layout = savedLayouts.get(from);

        if (!layout) {
          return "not-found";
        }

        if (to !== from && savedLayouts.has(to)) {
          return "name-taken";
        }

        runInAction(() => {
          savedLayouts.delete(from);
          savedLayouts.set(to, { ...layout, name: to });
        });

        return "renamed";
      };
  },
});
