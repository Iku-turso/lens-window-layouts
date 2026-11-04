import { getPersistableMapInjectableBunch } from "@k8slens/persistable-contracts";
import type { WindowReopening } from "@k8slens/window-layout-contracts";

// How to open every window of Lens again, by its key in the tiling, as this extension last described
// it while it was open, before Lens described each window as it closes. Read only, for a window
// closed before then; never written any more. TODO: drop this bunch in a later release, once windows
// closed before Lens described closed windows are past the 180 days Lens keeps them for.
export const windowReopeningsBunch = getPersistableMapInjectableBunch<
  string,
  WindowReopening
>()({
  id: "window-reopenings",
});
