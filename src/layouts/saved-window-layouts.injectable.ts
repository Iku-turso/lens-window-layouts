import { getPersistableMapInjectableBunch } from "@k8slens/persistable-contracts";
import type { WindowId } from "@k8slens/messaging-contracts";
import type {
  WindowBounds,
  WindowReopening,
  WindowState,
} from "@k8slens/window-layout-contracts";
import type { StoredPlanScreen } from "./tiling-plan";

export interface SavedWindow {
  readonly window: WindowId;
  readonly title: string;
  // What Lens keeps of the window to open it again once closed; missing for a window that cannot
  // be, as the application window, and from layouts saved before windows were kept.
  readonly reopening?: WindowReopening;
  // Where the window shows normally, so a maximized window comes back to the right place when restored.
  readonly normalBounds: WindowBounds;
  readonly state: WindowState;
  readonly isFocused: boolean;
  // The screen the window was on; missing from layouts saved before screens were kept by window.
  readonly displayId?: number;
}

export interface SavedDisplay {
  readonly label: string;
  readonly isPrimary: boolean;
  readonly bounds: WindowBounds;
}

// How a window of the layout is tiled in the layout's tiling setup, the window named by its place
// in the layout's windows, as its id does not outlive the window.
export interface SavedTilingWindow {
  readonly index: number;
  readonly displayId: number | null;
  readonly column?: number;
  readonly row?: number;
  readonly columns: number;
  readonly rows: number;
}

// The tiling setup saved with a layout: its windows in the setup's order, and the screens' grids.
export interface SavedTiling {
  readonly windows: readonly SavedTilingWindow[];
  readonly columns: Readonly<Record<string, number>>;
  readonly rows: Readonly<Record<string, number>>;
  // The screens of the setup, by id, to show one not connected; missing from setups saved before.
  readonly screens?: Readonly<Record<string, StoredPlanScreen>>;
}

export interface SavedWindowLayout {
  readonly name: string;
  readonly savedAt: number;
  readonly windows: readonly SavedWindow[];
  // The screens the layout was saved on; missing from layouts saved before screens were kept.
  readonly displays?: readonly SavedDisplay[];
  // The tiling setup current when the layout was saved; missing from layouts saved before.
  readonly tiling?: SavedTiling;
}

export const savedWindowLayoutsBunch = getPersistableMapInjectableBunch<
  string,
  SavedWindowLayout
>()({
  // Of its second version: the layouts saved before Lens described every window it can open
  // again, as Preferences, are left behind rather than read.
  id: "saved-window-layouts-2",
});
