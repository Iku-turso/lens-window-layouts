import { getInjectable2 } from "@k8slens/injectable";
import { getPersistableValueInjectableBunch } from "@k8slens/persistable-contracts";
import {
  displayRecordsReactiveInjectionToken,
  windowRecordsReactiveInjectionToken,
} from "@k8slens/window-layout-contracts";
import {
  computed,
  observable,
  runInAction,
  type IComputedValue,
  type IObservableValue,
} from "mobx";
import type { WindowId } from "@k8slens/messaging-contracts";
import {
  allLeftAsTheyAre,
  keyOfWindow,
  openingPrefix,
  resolveTilingPlan,
  tileUntiled,
  toStoredPlan,
  type ResolvedTilingPlan,
  type StoredTilingPlan,
} from "./tiling-plan";

// The tiling the user arranged, or null for none, which tiles as it always did.
export const storedTilingPlanBunch =
  getPersistableValueInjectableBunch<StoredTilingPlan | null>()({
    // Of its second version, as the layouts are: the plan kept before is left behind.
    id: "tiling-plan-2",
    defaultValue: { instantiate: () => async () => null },
  });

// The tiling plan for the windows open and the screens connected, kept current as they change, and
// keeping the edits the tiling editor makes to it.
export const tilingPlanInjectable = getInjectable2({
  id: "window-manager.tiling-plan",
  consumptions: [
    windowRecordsReactiveInjectionToken,
    displayRecordsReactiveInjectionToken,
  ],

  instantiate: (di) => {
    const windows = di.inject(windowRecordsReactiveInjectionToken)();
    const displays = di.inject(displayRecordsReactiveInjectionToken)();
    const getStored = di.inject(storedTilingPlanBunch.persistable);
    const stored = observable.box<
      IObservableValue<StoredTilingPlan | null> | undefined
    >(undefined, { deep: false });

    void getStored().then((plan) => {
      // A window being opened in a cell when the extension was last loaded is no longer awaited:
      // its tile, which would stay not open with no way to open it, goes.
      const kept = plan.get();

      if (kept?.windows.some((it) => it.key.startsWith(openingPrefix))) {
        runInAction(() =>
          plan.set({
            ...kept,
            windows: kept.windows.filter(
              (it) => !it.key.startsWith(openingPrefix),
            ),
          }),
        );
      }

      runInAction(() => stored.set(plan));
    });

    // Windows going by another window's key in the plan, by their own key, as worked out elsewhere:
    // one being opened again goes by the key of the window not open it is.
    const aliasesOf = observable.box<
      IComputedValue<ReadonlyMap<string, string>> | undefined
    >(undefined, {
      deep: false,
    });

    const resolved = computed(() =>
      resolveTilingPlan(
        windows.get(),
        displays.get(),
        stored.get()?.get() ?? undefined,
        {
          aliases: aliasesOf.get()?.get(),
        },
      ),
    );

    const keep = (plan: StoredTilingPlan) => {
      const kept = stored.get();

      if (kept) {
        runInAction(() => kept.set(plan));
      }
    };

    return () => ({
      resolved,
      // Keeps a plan made from the resolved one by an edit, as the editor's preview of a drag.
      commit: (plan: ResolvedTilingPlan) => {
        const kept = stored.get();

        if (kept) {
          runInAction(() =>
            kept.set(toStoredPlan(plan, kept.get() ?? undefined)),
          );
        }
      },
      // Places the windows not tiled, those open, on the screens, in the first free cells; the
      // windows tiled stay where they are.
      autoTile: () =>
        keep(
          toStoredPlan(
            tileUntiled(resolved.get()),
            stored.get()?.get() ?? undefined,
          ),
        ),
      // Leaves every window as it is, as a new layout starts out.
      leaveAllAsTheyAre: () => keep(allLeftAsTheyAre(windows.get())),
      // Has windows go by other windows' keys in the plan, as the aliases given have them.
      followAliases: (aliases: IComputedValue<ReadonlyMap<string, string>>) =>
        runInAction(() => aliasesOf.set(aliases)),
      // Has the plan's window go by the key of the window given, and keep its id, as a window not
      // open does once opened again, as the window Lens answered with; a window under that key
      // already gives its place up.
      rekey: (from: string, window: WindowId) => {
        const plan = stored.get()?.get();
        const to = keyOfWindow(window);

        // Nothing to do once the plan has the window by its own key already, as after a recall.
        if (plan && from !== to && plan.windows.some((it) => it.key === from)) {
          keep({
            ...plan,
            windows: plan.windows
              .filter((it) => it.key !== to)
              .map((it) => (it.key === from ? { ...it, key: to, window } : it)),
          });
        }
      },
      // Puts a window being opened, not shown yet, in the cell, by a key of its own until it shows,
      // as a window not open is: its tile is there from the start.
      placeOpening: (
        key: string,
        title: string,
        cell: { displayId: number; column: number; row: number },
      ) => {
        const plan =
          stored.get()?.get() ?? toStoredPlan(resolved.get(), undefined);

        keep({
          ...plan,
          windows: [
            ...plan.windows,
            {
              key,
              title,
              displayId: cell.displayId,
              column: cell.column,
              row: cell.row,
              columns: 1,
              rows: 1,
            },
          ],
        });
      },
      // Takes the window out of the plan altogether, as when it is closed for good.
      forget: (key: string) => {
        const plan = stored.get()?.get();

        if (plan) {
          keep({
            ...plan,
            windows: plan.windows.filter((it) => it.key !== key),
          });
        }
      },
    });
  },
});
