import { Button, Span } from "@k8slens/element-components";
import {
  getHotbarItemKindInjectableBunch,
  type HotbarItemProps,
} from "@k8slens/hotbar-contracts";
import { DashboardIcon } from "@k8slens/icon";
import { getInjectable2 } from "@k8slens/injectable";
import { showInfoNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { layoutHotbarItemKind } from "../layouts/layout-in-hotbar.injectable";
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

// "Layout 2" as "L2", "Work" as "WO": what tells pinned layouts apart at a glance.
const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);

  return (
    words.length > 1 ? words[0][0] + words[1][0] : name.trim().slice(0, 2)
  ).toUpperCase();
};

const LayoutHotbarItem = observer(
  ({ persistedData: { name } }: HotbarItemProps<typeof layoutHotbarItemKind>) => {
    const model = useInject(windowLayoutsModelInjectable)();
    const recall = useInject(recallFromHotbarInjectable)();
    const layouts = model.layouts.get();
    // Taken for there until the layouts are read.
    const exists = !layouts || layouts.some((it) => it.name === name);

    return (
      <Button
        $interactive
        $enabled={exists && model.canArrange.get()}
        $flex={{
          direction: "vertical",
          verticalAlign: "center",
          horizontalAlign: "center",
        }}
        aria-label={`Recall ${name}`}
        $tooltip={
          exists
            ? `Recall "${name}": put the windows back where this layout has them`
            : `There is no layout called "${name}" any more`
        }
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
