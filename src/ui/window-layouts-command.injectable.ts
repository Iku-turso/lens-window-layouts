import { getCommandInjectableBunch } from "@k8slens/command-palette-contracts";
import { openWindowLayoutsInjectable } from "./open-window-layouts.injectable";

export const windowLayoutsCommandBunch = getCommandInjectableBunch({
  id: "window-manager.window-layouts",
  title: "Window Layouts: Save or recall a layout",
  action: {
    instantiate: (di) => () => di.inject(openWindowLayoutsInjectable)(),
  },
});
