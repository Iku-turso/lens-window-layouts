import { getInjectable2 } from "@k8slens/injectable";
import { runInAction } from "mobx";
import { savedWindowLayoutsBunch } from "./saved-window-layouts.injectable";

// The name a copy of a layout gets: "<name> copy", numbered after the first, as "<name> copy 2".
const copyName = (name: string, taken: (name: string) => boolean) => {
  const base = `${name} copy`;
  let number = 1;

  while (taken(number === 1 ? base : `${base} ${number}`)) {
    number++;
  }

  return number === 1 ? base : `${base} ${number}`;
};

// Copies a layout, its windows and its tiling, under a name of its own; the name it got, or
// undefined when there is no such layout.
export const duplicateWindowLayoutInjectable = getInjectable2({
  id: "window-manager.duplicate-window-layout",

  instantiate: (di) => {
    const getSavedLayouts = di.inject(savedWindowLayoutsBunch.persistable);

    return () =>
      async (from: string): Promise<string | undefined> => {
        const savedLayouts = await getSavedLayouts();
        const layout = savedLayouts.get(from);

        if (!layout) {
          return undefined;
        }

        const name = copyName(from, (it) => savedLayouts.has(it));

        runInAction(() =>
          savedLayouts.set(name, { ...layout, name, savedAt: Date.now() }),
        );

        return name;
      };
  },
});
