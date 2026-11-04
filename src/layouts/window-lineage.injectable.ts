import { getPersistableMapInjectableBunch } from "@k8slens/persistable-contracts";

// Which window of a layout each window is, by layout and the window's own key, to the key the
// layout saved the window under: as last found, or as the window was opened again as. A window
// opened again goes by another id than the one it was saved by, and what Lens describes of it can
// change, as its title, so this is what tells it is that window still, however many times it was
// opened again, and once it is closed which window of the layout its tile is.
export const windowLineageBunch = getPersistableMapInjectableBunch<
  string,
  string
>()({
  // Of its second version, kept by layout: the one kept for all layouts at once is left behind.
  id: "window-lineage-2",
});

// The key a window's lineage in a layout is kept under.
export const lineageKey = (layout: string, window: string) =>
  JSON.stringify([layout, window]);

// The window each window opened again continues, by key, whichever layout opened it again: a chain
// back to the window first opened, by which any layout that saved one of them finds it.
export const windowContinuesBunch = getPersistableMapInjectableBunch<
  string,
  string
>()({
  id: "window-continues",
});

// The windows the window continues, nearest first, back to the one first opened.
export const predecessorsOf = (
  key: string,
  continues: ReadonlyMap<string, string>,
): readonly string[] => {
  const predecessors: string[] = [];

  for (
    let at = continues.get(key);
    at !== undefined && !predecessors.includes(at) && at !== key;
    at = continues.get(at)
  ) {
    predecessors.push(at);
  }

  return predecessors;
};

// The windows a window continues, nearest first, and then the windows any layout found it or opened
// it again as, which tell the same of a window opened again before the chain was kept.
export const continuedWindowsOf = (
  key: string,
  continues: ReadonlyMap<string, string>,
  lineage: ReadonlyMap<string, string>,
): readonly string[] => {
  const asFound = [...lineage]
    .filter(([at]) => (JSON.parse(at) as [string, string])[1] === key)
    .map(([, saved]) => saved);

  return [...new Set([...predecessorsOf(key, continues), ...asFound])];
};
