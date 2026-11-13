import {
  getDropDownMenuItemInjectableBunch,
  getDropDownMenuKind,
} from "@k8slens/drop-down-menu-contracts";
import {
  DropDownMenuItemRow,
  DropDownMenuSeparator,
} from "@k8slens/drop-down-menu-items";
import { Li, Span } from "@k8slens/element-components";
import { EditIcon, HistoryIcon, SaveIcon } from "@k8slens/icon";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { previewOf } from "../layouts/layout-preview";
import { LayoutPreview } from "./layout-preview";
import { openWindowLayoutsInjectable } from "./open-window-layouts.injectable";
import { recallFromHotbarInjectable } from "./recall-from-hotbar.injectable";
import { saveFromHotbarInjectable } from "./save-from-hotbar.injectable";
import { showWindowFromHotbarInjectable } from "./show-window-from-hotbar.injectable";
import { windowLayoutsModelInjectable } from "./window-layouts-model.injectable";

// The menu a layout's hotbar item opens as the pointer is on it: the layout's tiling, and what can
// be done with the layout.
export const layoutHotbarMenuKind = getDropDownMenuKind<{
  readonly name: string;
}>()("window-manager-layout-hotbar-menu");

const Preview = observer(({ data: { name } }: { data: { name: string } }) => {
  const model = useInject(windowLayoutsModelInjectable)();
  const showWindow = useInject(showWindowFromHotbarInjectable)();
  const layout = model.layouts.get()?.find((it) => it.name === name);

  return (
    <Li
      $padding={{ vertical: "s", horizontal: "m" }}
      $flex={{ direction: "vertical", gap: "s" }}
    >
      <Span $font={{ bold: true }}>{name}</Span>
      {layout ? (
        <LayoutPreview
          preview={previewOf(
            layout,
            model.notOpenOf(layout),
            model.missingScreenIdsOf(layout),
            model.notSavedOf(layout),
          )}
          onWindowClick={(index, title) => void showWindow(name, index, title)}
        />
      ) : (
        <Span $color="textMuted" $font={{ size: "s" }}>
          There is no layout called "{name}" any more.
        </Span>
      )}
    </Li>
  );
});

const Recall = observer(({ data: { name } }: { data: { name: string } }) => {
  const model = useInject(windowLayoutsModelInjectable)();
  const recall = useInject(recallFromHotbarInjectable)();
  const exists = !!model.layouts.get()?.some((it) => it.name === name);

  return (
    <DropDownMenuItemRow
      Icon={HistoryIcon}
      $enabled={exists && model.canArrange.get()}
      $onClick={() => void recall(name)}
    >
      Recall
    </DropDownMenuItemRow>
  );
});

const Save = observer(({ data: { name } }: { data: { name: string } }) => {
  const model = useInject(windowLayoutsModelInjectable)();
  const save = useInject(saveFromHotbarInjectable)();
  const exists = !!model.layouts.get()?.some((it) => it.name === name);

  return (
    <DropDownMenuItemRow
      Icon={SaveIcon}
      $enabled={exists && model.canArrange.get()}
      $tooltip="Put the windows in their tiles, then save them into this layout; windows it has no tile for are saved as not tiled"
      $onClick={() => void save(name)}
    >
      Tile and save
    </DropDownMenuItemRow>
  );
});

const Edit = observer(({ data: { name } }: { data: { name: string } }) => {
  const model = useInject(windowLayoutsModelInjectable)();
  const openWindowLayouts = useInject(openWindowLayoutsInjectable)();
  const exists = !!model.layouts.get()?.some((it) => it.name === name);

  return (
    <DropDownMenuItemRow
      Icon={EditIcon}
      $enabled={exists}
      $onClick={() => void openWindowLayouts(name)}
    >
      Edit in Window layouts
    </DropDownMenuItemRow>
  );
});

const Separator = () => <DropDownMenuSeparator />;

export const layoutHotbarMenuPreviewBunch = getDropDownMenuItemInjectableBunch({
  id: "window-manager-layout-hotbar-menu-preview",
  kind: layoutHotbarMenuKind,
  orderNumber: 10,
  Component: Preview,
});

export const layoutHotbarMenuSeparatorBunch =
  getDropDownMenuItemInjectableBunch({
    id: "window-manager-layout-hotbar-menu-separator",
    kind: layoutHotbarMenuKind,
    orderNumber: 20,
    Component: Separator,
  });

export const layoutHotbarMenuRecallBunch = getDropDownMenuItemInjectableBunch({
  id: "window-manager-layout-hotbar-menu-recall",
  kind: layoutHotbarMenuKind,
  orderNumber: 30,
  Component: Recall,
});

export const layoutHotbarMenuSaveBunch = getDropDownMenuItemInjectableBunch({
  id: "window-manager-layout-hotbar-menu-save",
  kind: layoutHotbarMenuKind,
  orderNumber: 35,
  Component: Save,
});

export const layoutHotbarMenuEditBunch = getDropDownMenuItemInjectableBunch({
  id: "window-manager-layout-hotbar-menu-edit",
  kind: layoutHotbarMenuKind,
  orderNumber: 40,
  Component: Edit,
});
