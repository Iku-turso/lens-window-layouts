import { type Place } from "@k8slens/navigation-contracts";
import { getPlaceSubWindowKindInjectableBunch } from "@k8slens/place-sub-window-contracts";
import { getSubWindowKind } from "@k8slens/sub-window-contracts";

// Windows of their own showing a place of Lens, as a cluster's list of pods, opened into a cell of
// the tiling.
export const placesSubWindowKind = getSubWindowKind<Place>()("places");

export const placesSubWindowKindBunch = getPlaceSubWindowKindInjectableBunch({
  kind: placesSubWindowKind,
});
