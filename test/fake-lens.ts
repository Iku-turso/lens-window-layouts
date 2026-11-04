import {
  deregisterFeature,
  getFeature,
  registerFeature,
} from "@k8slens/feature-core";
import {
  createContainer,
  getInjectable2,
  type DiContainer,
} from "@k8slens/injectable";
import {
  applicationWindowId,
  isApplicationWindow,
  type WindowId,
} from "@k8slens/messaging-contracts";
import { openModalInjectionToken } from "@k8slens/modal-contracts";
import {
  persistInjectionToken,
  type PersistedState,
} from "@k8slens/persistable-contracts";
import { allClusterRecordsReactiveInjectionToken } from "@k8slens/cluster-contracts";
import {
  closeAnySubWindowInjectionToken,
  openSubWindowInjectionToken,
  renameAnySubWindowInjectionToken,
  subWindowsInjectionToken,
  subWindowsReactiveInjectionToken,
} from "@k8slens/sub-window-contracts";
import {
  canReopenWindowInjectionToken,
  canReopenWindowReactiveInjectionToken,
  describeClosedWindowInjectionToken,
  displayRecordsInjectionToken,
  displayRecordsReactiveInjectionToken,
  focusWindowInjectionToken,
  reopenWindowInjectionToken,
  setWindowBoundsInjectionToken,
  setWindowStateInjectionToken,
  windowRecordsInjectionToken,
  windowRecordsReactiveInjectionToken,
  windowRecordOfInjectionToken,
  type DisplayRecord,
  type WindowBounds,
  type WindowRecord,
  type WindowReopening,
  type WindowReopeningPlacement,
} from "@k8slens/window-layout-contracts";
import {
  computed,
  isObservableMap,
  observable,
  runInAction,
  type IObservableValue,
  type ObservableMap,
  when,
} from "mobx";
import { deleteWindowLayoutInjectable } from "../src/layouts/delete-window-layout.injectable";
import { duplicateWindowLayoutInjectable } from "../src/layouts/duplicate-window-layout.injectable";
import { layoutTilingInjectable } from "../src/layouts/layout-tiling.injectable";
import { placesSubWindowKind } from "../src/layouts/places-sub-window-kind.injectable";
import { recallWindowLayoutInjectable } from "../src/layouts/recall-window-layout.injectable";
import { renameWindowLayoutInjectable } from "../src/layouts/rename-window-layout.injectable";
import { reopeningOfClosedWindowInjectable } from "../src/layouts/reopening-of-closed-window.injectable";
import { saveWindowLayoutInjectable } from "../src/layouts/save-window-layout.injectable";
import { savedWindowLayoutsBunch } from "../src/layouts/saved-window-layouts.injectable";
import { tileWindowsInjectable } from "../src/layouts/tile-windows.injectable";
import { keyOfWindow } from "../src/layouts/tiling-plan";
import {
  storedTilingPlanBunch,
  tilingPlanInjectable,
} from "../src/layouts/tiling-plan.injectable";
import { windowLayoutListInjectable } from "../src/layouts/window-layout-list.injectable";
import {
  windowContinuesBunch,
  windowLineageBunch,
} from "../src/layouts/window-lineage.injectable";
import { windowReopeningsBunch } from "../src/layouts/window-reopenings.injectable";
import { deleteLayoutModalKind } from "../src/ui/delete-layout-modal.injectable";
import { windowLayoutsModelInjectable } from "../src/ui/window-layouts-model.injectable";
import { disposeWindowLayoutsModelInjectable } from "../src/ui/window-layouts-model.purge.injectable";

export const workArea: WindowBounds = { x: 0, y: 0, width: 1200, height: 800 };

const display: DisplayRecord = {
  id: 1,
  label: computed(() => "Built-in"),
  isPrimary: computed(() => true),
  bounds: computed(() => workArea),
  workArea: computed(() => workArea),
  scaleFactor: computed(() => 1),
  rotation: computed(() => 0),
};

export const subWindowId = (id: string) =>
  ({ kind: "some-kind", id }) as WindowId;

// What a window shows, as Lens would describe it.
export const reopeningFor = (
  shows: string,
  name?: string,
): WindowReopening => ({
  kindId: "some-kind",
  description: { shows },
  title: shows,
  ...(name ? { name } : {}),
});

export interface FakeWindow {
  readonly record: WindowRecord;
  readonly title: IObservableValue<string>;
  readonly bounds: IObservableValue<WindowBounds>;
}

// Lens as far as the extension sees it: its windows and screens, and what it is asked to do.
export const createFakeLens = (persisted: Record<string, unknown> = {}) => {
  const windows = observable.array<FakeWindow>([], { deep: false });
  const calls = {
    describeReopening: [] as WindowId[],
    describeClosedWindow: [] as WindowId[],
    reopenWindow: [] as {
      reopening: WindowReopening;
      placement?: WindowReopeningPlacement;
    }[],
    focusWindow: [] as WindowId[],
    setWindowBounds: 0,
  };
  // What Lens described each window as as it closed, by its key.
  const closedDescriptions = new Map<string, WindowReopening>();
  // What a window shows, by its key: what describing it answers.
  const showing = new Map<string, WindowReopening>();
  const persistedStates = new Map<string, PersistedState>();
  let reopened = 0;
  const placeWindows = new Map<string, WindowId>();
  // The places being opened or opened, by the id each was opened as.
  const openingPlaces = new Set<string>();
  // The places whose opening has settled, by the id each was opened as.
  const placesSettled = observable.set<string>();
  let places = 0;

  const addWindow = (
    window: WindowId,
    title: string,
    shows?: WindowReopening,
    at: WindowBounds = { x: 10, y: 10, width: 400, height: 300 },
  ) => {
    const titleBox = observable.box(title);
    const bounds = observable.box<WindowBounds>(at, { deep: false });

    if (shows) {
      showing.set(keyOfWindow(window), shows);
    }

    const record: WindowRecord = {
      window,
      title: computed(() => titleBox.get()),
      bounds: computed(() => bounds.get()),
      normalBounds: computed(() => bounds.get()),
      state: computed(() => "normal" as const),
      isFocused: computed(() => false),
      displayId: computed(() => 1),
      isResizable: true,
      minimumSize: { width: 100, height: 100 },
      describeReopening: async () => {
        calls.describeReopening.push(window);

        return showing.get(keyOfWindow(window));
      },
    };

    const fake = { record, title: titleBox, bounds };

    runInAction(() => windows.push(fake));

    return fake;
  };

  // Closes the window as the user does, Lens describing it as it closes.
  const closeWindow = (window: WindowId) => {
    const key = keyOfWindow(window);
    const shows = showing.get(key);

    if (shows) {
      closedDescriptions.set(key, shows);
    }

    runInAction(() =>
      windows.replace(
        windows.filter((it) => keyOfWindow(it.record.window) !== key),
      ),
    );
  };

  // Opens the window again as Lens does: a new window, listed before it is answered with. Replaced
  // by a test to answer otherwise.
  const defaultReopen = async (
    reopening: WindowReopening,
    placement?: WindowReopeningPlacement,
  ): Promise<WindowId | undefined> => {
    const window = subWindowId(`reopened-${++reopened}`);
    const at = placement?.bounds;

    addWindow(
      window,
      reopening.name ?? reopening.title ?? "",
      reopening,
      at && {
        x: at.x ?? 0,
        y: at.y ?? 0,
        width: at.width ?? 400,
        height: at.height ?? 300,
      },
    );

    return window;
  };

  const lens = {
    windows,
    calls,
    closedDescriptions,
    persistedStates,
    addWindow,
    closeWindow,
    // Told as Lens is asked to focus a window, as a recall does once it has opened windows again
    // and before it places them.
    onFocusWindow: undefined as (() => void) | undefined,
    // Opens a place in a window of its own, as Lens does; by default, as a window of another kind
    // under an id of Lens's own, listed before it is answered.
    openPlace: async (opening: { id: string }) => {
      const window = subWindowId(`place-${++places}`);

      placeWindows.set(opening.id, window);
      addWindow(window, "Pods - colima");
    },
    // The window each place was opened in, by the id it was opened as.
    placeWindows,
    reopen: defaultReopen as (
      reopening: WindowReopening,
      placement?: WindowReopeningPlacement,
    ) => Promise<WindowId | undefined>,
    defaultReopen,
  };

  const fake = <F extends (...args: never[]) => unknown>(
    id: string,
    injectionToken: unknown,
    implementation: F,
  ) =>
    getInjectable2({
      id: `fake-${id}`,
      injectionToken: injectionToken as never,
      instantiate: () => () => implementation,
    });

  const records = computed(() => windows.map((it) => it.record));

  const listed = computed(() =>
    windows
      .filter((it) => it.record.window !== applicationWindowId)
      .map((it) => ({
        id: keyOfWindow(it.record.window),
        title: it.title.get(),
      })),
  );

  const di: DiContainer = createContainer("test");

  di.register(
    // Lens's own, faked.
    getInjectable2({
      id: "fake-persist",
      injectionToken: persistInjectionToken,
      instantiate:
        () => () => async (storageKey: string[], state: PersistedState) => {
          const id = storageKey[storageKey.length - 1];
          const value = persisted[id];

          persistedStates.set(id, state);

          if (value !== undefined) {
            runInAction(() => {
              if (isObservableMap(state)) {
                (state as ObservableMap<unknown, unknown>).replace(
                  Object.entries(value as object),
                );
              } else {
                (state as IObservableValue<unknown>).set(value);
              }
            });
          }
        },
    }),
    fake("window-records", windowRecordsInjectionToken, async () =>
      records.get(),
    ),
    getInjectable2({
      id: "fake-window-records-reactive",
      injectionToken: windowRecordsReactiveInjectionToken,
      instantiate: () => () => records,
    }),
    fake("display-records", displayRecordsInjectionToken, async () => [
      display,
    ]),
    getInjectable2({
      id: "fake-display-records-reactive",
      injectionToken: displayRecordsReactiveInjectionToken,
      instantiate: () => () => computed(() => [display]),
    }),
    fake("set-window-bounds", setWindowBoundsInjectionToken, async () => {
      calls.setWindowBounds++;
    }),
    fake("set-window-state", setWindowStateInjectionToken, async () => {}),
    fake(
      "focus-window",
      focusWindowInjectionToken,
      async (window: WindowId) => {
        calls.focusWindow.push(window);
        lens.onFocusWindow?.();
      },
    ),
    fake("can-reopen-window", canReopenWindowInjectionToken, async () => true),
    fake(
      "can-reopen-window-reactive",
      canReopenWindowReactiveInjectionToken,
      () => computed(() => true),
    ),
    fake(
      "reopen-window",
      reopenWindowInjectionToken,
      async (
        reopening: WindowReopening,
        placement?: WindowReopeningPlacement,
      ) => {
        calls.reopenWindow.push({
          reopening,
          ...(placement ? { placement } : {}),
        });

        return lens.reopen(reopening, placement);
      },
    ),
    fake(
      "window-record-of",
      windowRecordOfInjectionToken,
      // As Lens does: settles as soon as the window a place is opened in is listed, before the
      // opening does; none once the opening has settled without one.
      async (window: WindowId) => {
        const recordOf = () => {
          const id = isApplicationWindow(window)
            ? window
            : (placeWindows.get(window.id) ?? window);

          return records
            .get()
            .find((it) => keyOfWindow(it.window) === keyOfWindow(id));
        };

        if (!isApplicationWindow(window) && openingPlaces.has(window.id)) {
          await when(() => !!recordOf() || placesSettled.has(window.id));
        }

        return recordOf();
      },
    ),
    fake(
      "describe-closed-window",
      describeClosedWindowInjectionToken,
      async (window: WindowId) => {
        calls.describeClosedWindow.push(window);

        return closedDescriptions.get(keyOfWindow(window));
      },
    ),
    // Its factory answers the promise itself.
    getInjectable2({
      id: "fake-all-cluster-records-reactive",
      injectionToken: allClusterRecordsReactiveInjectionToken,
      instantiate: () => async () => computed(() => []),
    }),
    fake("sub-windows", subWindowsInjectionToken, async () => listed.get()),
    getInjectable2({
      id: "fake-sub-windows-reactive",
      injectionToken: subWindowsReactiveInjectionToken,
      instantiate: () => () => listed,
    }),
    fake(
      "close-any-sub-window",
      closeAnySubWindowInjectionToken,
      async (id: string) => {
        const window = windows.find(
          (it) => keyOfWindow(it.record.window) === id,
        );

        if (window) {
          closeWindow(window.record.window);
        }
      },
    ),
    fake(
      "rename-any-sub-window",
      renameAnySubWindowInjectionToken,
      async (id: string, name: string) => {
        const window = windows.find(
          (it) => keyOfWindow(it.record.window) === id,
        );

        runInAction(() => window?.title.set(name));
      },
    ),
  );

  // The extension's own, registered as Lens registers an extension: in a feature, which scopes
  // what it persists, and the modal and window kinds it opens.
  const feature = getFeature({
    id: "@k8slens/window-layouts",
    register: (featureDi) =>
      featureDi.register(
        getInjectable2({
          id: "fake-open-delete-modal",
          injectionToken: ({ scopeIds }) =>
            openModalInjectionToken.for(deleteLayoutModalKind).for(scopeIds),
          instantiate: () => () => async () => true,
        }),
        getInjectable2({
          id: "fake-open-place",
          injectionToken: ({ scopeIds }) =>
            openSubWindowInjectionToken.for(placesSubWindowKind).for(scopeIds),
          instantiate: () => () => (opening: { id: string }) => {
            openingPlaces.add(opening.id);

            return lens.openPlace(opening).finally(() =>
              runInAction(() => placesSettled.add(opening.id)),
            );
          },
        }),
        savedWindowLayoutsBunch,
        storedTilingPlanBunch,
        windowReopeningsBunch,
        windowLineageBunch,
        windowContinuesBunch,
        windowLayoutListInjectable,
        saveWindowLayoutInjectable,
        recallWindowLayoutInjectable,
        deleteWindowLayoutInjectable,
        renameWindowLayoutInjectable,
        duplicateWindowLayoutInjectable,
        layoutTilingInjectable,
        tilingPlanInjectable,
        tileWindowsInjectable,
        reopeningOfClosedWindowInjectable,
        windowLayoutsModelInjectable,
        disposeWindowLayoutsModelInjectable,
      ),
  });

  registerFeature(di, feature);

  // Takes the extension away, as Lens does as it is rebuilt, disabled or uninstalled.
  const deregister = () => deregisterFeature(di, feature);

  return Object.assign(lens, { di, deregister });
};

// Lets what is under way settle: persisted state loading, awaits chained on fakes.
export const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};
