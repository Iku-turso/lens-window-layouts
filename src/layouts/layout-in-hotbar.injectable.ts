import {
  addToHotbarInjectionToken,
  getHotbarItemKind,
  isInHotbarInjectionToken,
  isInHotbarReactiveInjectionToken,
  removeFromHotbarInjectionToken,
} from "@k8slens/hotbar-contracts";
import { getInjectable2 } from "@k8slens/injectable";

// An item of the hotbar recalling a layout, by the layout's name, which is also its id.
export const layoutHotbarItemKind = getHotbarItemKind<{ name: string }>()(
  "window-layout",
);

// Pins layouts to the hotbar and takes them off, and keeps an item going by its layout as the
// layout is renamed or deleted. The hotbar answers for its current page only.
export const layoutInHotbarInjectable = getInjectable2({
  id: "window-manager.layout-in-hotbar",
  consumptions: [
    addToHotbarInjectionToken,
    isInHotbarInjectionToken,
    isInHotbarReactiveInjectionToken,
    removeFromHotbarInjectionToken,
  ],

  instantiate: (di) => {
    const add = di.inject(
      addToHotbarInjectionToken.for(layoutHotbarItemKind).for(di.scopeIds),
    )();
    const isIn = di.inject(
      isInHotbarInjectionToken.for(layoutHotbarItemKind).for(di.scopeIds),
    )();
    const isInReactive = di.inject(
      isInHotbarReactiveInjectionToken
        .for(layoutHotbarItemKind)
        .for(di.scopeIds),
    );
    const remove = di.inject(
      removeFromHotbarInjectionToken.for(layoutHotbarItemKind).for(di.scopeIds),
    )();

    const pin = (name: string) => add({ id: name, persistedData: { name } });

    return () => ({
      isPinned: (name: string) => isInReactive(name),

      toggle: async (name: string) => {
        if (await isIn(name)) {
          await remove(name);
        } else {
          await pin(name);
        }
      },

      // The item of the layout under its old name goes by the new one, in the first free slot.
      renamed: async (from: string, to: string) => {
        if (await isIn(from)) {
          await remove(from);
          await pin(to);
        }
      },

      deleted: async (name: string) => {
        if (await isIn(name)) {
          await remove(name);
        }
      },
    });
  },
});
