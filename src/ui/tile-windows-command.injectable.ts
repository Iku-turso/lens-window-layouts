import { getCommandInjectableBunch } from "@k8slens/command-palette-contracts";
import { tileWindowsInjectable } from "../layouts/tile-windows.injectable";

export const tileWindowsCommandBunch = getCommandInjectableBunch({
  id: "window-manager.tile-windows-command",
  title: "Window Layouts: Tile windows",
  action: {
    instantiate: (di) => {
      const tileWindows = di.inject(tileWindowsInjectable)();

      return () => async () => {
        await tileWindows();
      };
    },
  },
});
