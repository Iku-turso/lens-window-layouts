import { Button, Span } from "@k8slens/element-components";
import {
  getHotbarItemKindInjectableBunch,
  type HotbarItemProps,
} from "@k8slens/hotbar-contracts";
import { DashboardIcon } from "@k8slens/icon";
import { dropDownMenu } from "@k8slens/drop-down-menu-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { layoutHotbarItemKind } from "../layouts/layout-in-hotbar.injectable";
import { layoutHotbarMenuKind } from "./layout-hotbar-menu.injectable";
import { recallFromHotbarInjectable } from "./recall-from-hotbar.injectable";
import { windowLayoutsModelInjectable } from "./window-layouts-model.injectable";

// One menu per layout rather than one per render, so that the item is not handed a new menu to
// open whenever it renders. Beside the item, centred on it, with a gap small enough that the
// pointer on its way into the menu does not leave both.
export const layoutMenuOfItemInjectable = getInjectable2({
  id: "window-manager.layout-menu-of-item",

  instantiate: () => {
    const menus = new Map<string, ReturnType<typeof menuOf>>();
    const menuOf = (name: string) =>
      dropDownMenu(layoutHotbarMenuKind, {
        data: { name },
        openOn: "hover",
        position: "right",
        gap: "xxs",
      });

    return () => (name: string) => {
      const menu = menus.get(name) ?? menuOf(name);

      menus.set(name, menu);

      return menu;
    };
  },
});

// "Layout 2" as "L2", "Work" as "WO": what tells pinned layouts apart at a glance.
const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);

  return (
    words.length > 1 ? words[0][0] + words[1][0] : name.trim().slice(0, 2)
  ).toUpperCase();
};

const LayoutHotbarItem = observer(
  ({
    persistedData: { name },
  }: HotbarItemProps<typeof layoutHotbarItemKind>) => {
    const model = useInject(windowLayoutsModelInjectable)();
    const recall = useInject(recallFromHotbarInjectable)();
    const menu = useInject(layoutMenuOfItemInjectable)()(name);
    const layouts = model.layouts.get();
    // Taken for there until the layouts are read.
    const exists = !layouts || layouts.some((it) => it.name === name);

    return (
      <Button
        $interactive
        // The whole slot, so the menu opens beside the slot rather than over it.
        $width="full"
        $height="full"
        $enabled={exists && model.canArrange.get()}
        $flex={{
          direction: "vertical",
          verticalAlign: "center",
          horizontalAlign: "center",
        }}
        aria-label={`Recall ${name}`}
        // The layout's tiling, and recalling or editing it, as the pointer is on the item.
        $anchor
        $dropDownMenu={menu}
        $onClick={() => void recall(name)}
      >
        <DashboardIcon $size="l" $color={exists ? "primary" : "textMuted"} />
        <Span $font={{ size: "xs", bold: true }} $color="textMuted">
          {initialsOf(name)}
        </Span>
      </Button>
    );
  },
);

export default getHotbarItemKindInjectableBunch({
  kind: layoutHotbarItemKind,
  Component: LayoutHotbarItem,
});
