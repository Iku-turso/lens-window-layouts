import { Button } from "@k8slens/element-components";
import { DashboardIcon } from "@k8slens/icon";
import { getInjectable2 } from "@k8slens/injectable";
import { statusBarItemInjectionToken } from "@k8slens/status-bar-contracts";
import { useInject } from "@k8slens/use-inject";
import { openWindowLayoutsInjectable } from "./open-window-layouts.injectable";

const WindowLayoutsStatusBarButton = () => {
  const openWindowLayouts = useInject(openWindowLayoutsInjectable)();

  return (
    <Button
      $flex={{ direction: "horizontal", gap: "xs", verticalAlign: "center" }}
      $tooltip="Save or recall a window layout"
      $onClick={() => void openWindowLayouts()}
    >
      <DashboardIcon $size="s" />
      Layouts
    </Button>
  );
};

export const windowLayoutsStatusBarItemInjectable = getInjectable2({
  id: "window-manager.window-layouts-status-bar-item",
  instantiate: () => () => ({
    Component: WindowLayoutsStatusBarButton,
    position: "right" as const,
    orderNumber: 90,
  }),
  injectionToken: statusBarItemInjectionToken,
});
