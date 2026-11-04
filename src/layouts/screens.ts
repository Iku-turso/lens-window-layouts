import type {
  DisplayRecord,
  WindowBounds,
} from "@k8slens/window-layout-contracts";
import type { SavedDisplay } from "./saved-window-layouts.injectable";

// How much of a window must show on a screen for the user to reach it: about its title bar.
const reachableWidth = 100;
const reachableHeight = 40;

// Each window moved onto another screen lies this much further down and right than the one before,
// so that several do not hide each other.
const cascadeStep = 32;

const overlap = (a: WindowBounds, b: WindowBounds) => ({
  width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
});

export const isReachableOnSomeScreen = (
  bounds: WindowBounds,
  workAreas: readonly WindowBounds[],
) =>
  workAreas.some((area) => {
    const shown = overlap(bounds, area);

    return (
      shown.width >= Math.min(reachableWidth, bounds.width) &&
      shown.height >= Math.min(reachableHeight, bounds.height)
    );
  });

// The bounds shrunk to fit the area if they must, centred in it, the nth one a cascade step further on.
export const fitInto = (
  area: WindowBounds,
  bounds: WindowBounds,
  nth: number,
): WindowBounds => {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  const offset = nth * cascadeStep;

  return {
    x:
      area.x +
      Math.min(
        Math.floor((area.width - width) / 2) + offset,
        area.width - width,
      ),
    y:
      area.y +
      Math.min(
        Math.floor((area.height - height) / 2) + offset,
        area.height - height,
      ),
    width,
    height,
  };
};

export const toSavedDisplay = (display: DisplayRecord): SavedDisplay => ({
  label: display.label.get(),
  isPrimary: display.isPrimary.get(),
  bounds: { ...display.bounds.get() },
});

const isSameBounds = (a: WindowBounds, b: WindowBounds) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

// Whether the screens are arranged as they were saved: as many, each where it was.
export const isSameScreens = (
  saved: readonly SavedDisplay[],
  current: readonly DisplayRecord[],
) =>
  saved.length === current.length &&
  saved.every((display) =>
    current.some((it) => isSameBounds(it.bounds.get(), display.bounds)),
  );

// What to call a screen to the user: its own name, or its place among the screens.
export const nameOfScreen = (label: string, index: number) =>
  label || `Screen ${index + 1}`;
