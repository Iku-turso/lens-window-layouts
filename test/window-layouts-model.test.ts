import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applicationWindowId,
  type WindowId,
} from "@k8slens/messaging-contracts";
import type { WindowReopening } from "@k8slens/window-layout-contracts";
import { autorun, runInAction } from "mobx";
import {
  keyOfWindow,
  setColumnsInPlan,
  setRowsInPlan,
  type PlannedWindow,
} from "../src/layouts/tiling-plan";
import { windowLayoutsModelInjectable } from "../src/ui/window-layouts-model.injectable";
import { createFakeLens, reopeningFor, settle, subWindowId } from "./fake-lens";

const tilesOf = (model: ReturnType<typeof modelOf>) => {
  const plan = model.tilingPlan.resolved.get();

  return [...plan.screens.flatMap((screen) => screen.windows), ...plan.untiled];
};

const modelOf = (lens: ReturnType<typeof createFakeLens>) =>
  lens.di.inject2(windowLayoutsModelInjectable)();

const tileOf = (
  model: ReturnType<typeof modelOf>,
  title: string,
): PlannedWindow => {
  const tile = tilesOf(model).find((it) => it.record.title.get() === title);

  assert.ok(tile, `a tile for "${title}"`);

  return tile;
};

// The keys of the windows the tiling shows under "Not tiled" at any time until stopped, as the editor
// renders it: once what is under way has settled, never in the midst of it.
const everUntiled = (model: ReturnType<typeof modelOf>) => {
  const keys = new Set<string>();
  const stop = autorun(
    () => {
      for (const it of model.tilingPlan.resolved.get().untiled) {
        keys.add(it.key);
      }
    },
    { scheduler: (run) => setImmediate(run) },
  );

  return {
    stop: () => {
      stop();

      return [...keys];
    },
  };
};

const keysOf = (windows: readonly WindowId[]) => windows.map(keyOfWindow);

// Lens with the application window and the windows given open, a layout saved of them, selected,
// and every window tiled on the screen.
const withLayoutOf = async (
  windows: readonly { id: string; title: string; shows?: WindowReopening }[],
) => {
  const lens = createFakeLens();

  lens.addWindow(applicationWindowId, "Lens");

  for (const { id, title, shows } of windows) {
    lens.addWindow(subWindowId(id), title, shows);
  }

  const model = modelOf(lens);

  await settle();
  await model.create();
  await settle();
  model.tilingPlan.autoTile();
  await model.saveOver("Layout 1");
  await settle();

  return { lens, model };
};

test("a window opened after saving, closed and never saved, opens again from its tile as Lens described it as it closed", async () => {
  const { lens, model } = await withLayoutOf([]);
  const logs = subWindowId("logs");

  lens.addWindow(logs, "Logs", reopeningFor("Logs"));
  model.tilingPlan.autoTile();
  await settle();
  lens.closeWindow(logs);
  await settle();

  const tile = tileOf(model, "Logs");

  assert.equal(tile.missing, true);
  assert.equal(model.canReopen(tile), true);

  await model.reopenWindow(tile);
  await settle();

  assert.deepEqual(keysOf(lens.calls.describeClosedWindow), [
    keyOfWindow(logs),
  ]);
  assert.deepEqual(
    lens.calls.reopenWindow.map((it) => it.reopening),
    [reopeningFor("Logs")],
  );

  const reopened = tileOf(model, "Logs");

  assert.equal(reopened.missing, undefined);
  assert.equal(reopened.key, keyOfWindow(subWindowId("reopened-1")));
  assert.deepEqual(keysOf(lens.calls.focusWindow), [
    keyOfWindow(subWindowId("reopened-1")),
  ]);

  model.dispose();
});

test("opening and closing windows and changing their titles describes nothing", async () => {
  const { lens, model } = await withLayoutOf([
    { id: "pods", title: "Pods", shows: reopeningFor("Pods") },
  ]);

  lens.calls.describeReopening.length = 0;
  lens.calls.describeClosedWindow.length = 0;

  const logs = lens.addWindow(
    subWindowId("logs"),
    "Logs",
    reopeningFor("logs"),
  );

  await settle();
  runInAction(() => logs.title.set("Logs of nginx"));
  runInAction(() =>
    lens.windows[1].bounds.set({ x: 50, y: 50, width: 500, height: 400 }),
  );
  await settle();
  lens.closeWindow(subWindowId("logs"));
  await settle();

  // What the editor shows is worked out meanwhile, as when it renders.
  tilesOf(model).forEach((it) => model.isOutOfPlace(it));
  model.isSelectedSaved.get();
  await settle();

  assert.deepEqual(lens.calls.describeReopening, []);
  assert.deepEqual(lens.calls.describeClosedWindow, []);

  model.dispose();
});

test("recalling a layout keys, names and focuses each window opened again by the id Lens answered with", async () => {
  const { lens, model } = await withLayoutOf([
    { id: "pods", title: "Pods", shows: reopeningFor("Pods", "My pods") },
    { id: "logs", title: "Logs", shows: reopeningFor("Logs") },
  ]);

  lens.closeWindow(subWindowId("pods"));
  lens.closeWindow(subWindowId("logs"));
  await settle();

  // Another window shows just before each answer, as one the user opened meanwhile: the tile is the
  // window answered with all the same.
  let other = 0;

  lens.reopen = async (reopening, placement) => {
    lens.addWindow(subWindowId(`other-${++other}`), `Other ${other}`);

    return lens.defaultReopen(reopening, placement);
  };

  lens.calls.focusWindow.length = 0;
  await model.recall("Layout 1");
  await settle();

  const pods = tileOf(model, "My pods");
  const logs = tileOf(model, "Logs");

  assert.equal(pods.key, keyOfWindow(subWindowId("reopened-1")));
  assert.equal(logs.key, keyOfWindow(subWindowId("reopened-2")));
  assert.equal(pods.missing, undefined);
  assert.equal(logs.missing, undefined);

  const focused = keysOf(lens.calls.focusWindow);

  assert.ok(focused.includes(keyOfWindow(subWindowId("reopened-1"))));
  assert.ok(focused.includes(keyOfWindow(subWindowId("reopened-2"))));
  assert.ok(!focused.some((it) => it.includes("other-")));

  model.dispose();
});

test("windows opened again from their tiles at once each get the window Lens answers for them, whichever answers first", async () => {
  const { lens, model } = await withLayoutOf([
    { id: "pods", title: "Pods", shows: reopeningFor("Pods") },
    { id: "logs", title: "Logs", shows: reopeningFor("Logs") },
  ]);

  lens.closeWindow(subWindowId("pods"));
  lens.closeWindow(subWindowId("logs"));
  await settle();

  // Lens answers the second first.
  const answers: (() => void)[] = [];

  lens.reopen = (reopening) =>
    new Promise((resolve) => {
      answers.push(() => {
        const shows = (reopening.description as { shows: string }).shows;
        const window = subWindowId(`new-${shows.toLowerCase()}`);

        lens.addWindow(window, reopening.title ?? "", reopening);
        resolve(window);
      });
    });

  const reopeningPods = model.reopenWindow(tileOf(model, "Pods"));
  const reopeningLogs = model.reopenWindow(tileOf(model, "Logs"));

  await settle();
  assert.equal(answers.length, 2);
  assert.equal(model.isReopeningWindow(tileOf(model, "Pods")), true);

  answers[1]();
  await settle();
  answers[0]();
  await Promise.all([reopeningPods, reopeningLogs]);
  await settle();

  assert.equal(tileOf(model, "Pods").key, keyOfWindow(subWindowId("new-pods")));
  assert.equal(tileOf(model, "Logs").key, keyOfWindow(subWindowId("new-logs")));
  assert.deepEqual(keysOf(lens.calls.focusWindow).slice(-2), [
    keyOfWindow(subWindowId("new-logs")),
    keyOfWindow(subWindowId("new-pods")),
  ]);

  model.dispose();
});

test("a window Lens answers none for when opened again stays shown as not open", async () => {
  const { lens, model } = await withLayoutOf([
    { id: "pods", title: "Pods", shows: reopeningFor("Pods") },
  ]);

  lens.closeWindow(subWindowId("pods"));
  await settle();
  lens.reopen = async () => undefined;

  await model.reopenWindow(tileOf(model, "Pods"));
  await settle();

  const tile = tileOf(model, "Pods");

  assert.equal(tile.missing, true);
  assert.equal(model.isReopeningWindow(tile), false);
  assert.equal(model.status.get(), 'Could not open "Pods" again.');
  assert.deepEqual(
    lens.calls.focusWindow.filter((it) => keyOfWindow(it).includes("reopened")),
    [],
  );

  model.dispose();
});

test("a window closed before Lens described closed windows opens again as this extension last described it", async () => {
  const logs = subWindowId("logs");
  const kept = reopeningFor("logs, as described before");

  const lens = createFakeLens({
    "window-reopenings": { [keyOfWindow(logs)]: kept },
    // A plan kept before plans kept windows' ids.
    "tiling-plan-2": {
      windows: [
        {
          key: "application",
          title: "Lens",
          displayId: 1,
          column: 0,
          row: 0,
          columns: 1,
          rows: 1,
        },
        {
          key: keyOfWindow(logs),
          title: "Logs",
          displayId: 1,
          column: 1,
          row: 0,
          columns: 1,
          rows: 1,
        },
      ],
      columns: { "1": 2 },
      rows: { "1": 1 },
    },
  });

  lens.addWindow(applicationWindowId, "Lens");

  const model = modelOf(lens);

  await settle();

  const tile = tileOf(model, "Logs");

  assert.equal(tile.missing, true);

  await model.reopenWindow(tile);
  await settle();

  assert.deepEqual(keysOf(lens.calls.describeClosedWindow), [
    keyOfWindow(logs),
  ]);
  assert.deepEqual(
    lens.calls.reopenWindow.map((it) => it.reopening),
    [kept],
  );
  assert.equal(
    tileOf(model, "logs, as described before").key,
    keyOfWindow(subWindowId("reopened-1")),
  );

  // What was kept before is read, never written.
  const reopenings = lens.persistedStates.get("window-reopenings") as Map<
    string,
    WindowReopening
  >;

  assert.deepEqual([...reopenings.keys()], [keyOfWindow(logs)]);

  model.dispose();
});

for (const purged of [false, true]) {
  test(
    purged
      ? "throwing the model away stops what it was about to do"
      : "the model tiles soon after an edit",
    async () => {
      const { lens, model } = await withLayoutOf([
        { id: "pods", title: "Pods", shows: reopeningFor("Pods") },
      ]);

      lens.calls.setWindowBounds = 0;
      // Tiles the windows once edits pause.
      model.tilingPlan.autoTile();

      if (purged) {
        lens.deregister();
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
      await settle();

      assert.equal(lens.calls.setWindowBounds > 0, !purged);

      if (!purged) {
        model.dispose();
      }
    },
  );
}

test("opening a window again from its tile moves no other window", async () => {
  const { lens, model } = await withLayoutOf([
    { id: "pods", title: "Pods", shows: reopeningFor("Pods") },
    { id: "logs", title: "Logs", shows: reopeningFor("Logs") },
  ]);

  // The tiling the layout's setup started is done with first.
  await new Promise((resolve) => setTimeout(resolve, 400));
  lens.closeWindow(subWindowId("pods"));
  await settle();
  lens.calls.setWindowBounds = 0;

  await model.reopenWindow(tileOf(model, "Pods"));
  await new Promise((resolve) => setTimeout(resolve, 400));
  await settle();

  assert.equal(tileOf(model, "Pods").missing, undefined);
  assert.equal(lens.calls.setWindowBounds, 0);

  model.dispose();
});

test("a window opened again from its tile where the layout tiled it comes back as the layout saved it", async () => {
  const { lens, model } = await withLayoutOf([
    { id: "pods", title: "Pods", shows: reopeningFor("Pods") },
  ]);

  lens.closeWindow(subWindowId("pods"));
  await settle();
  await model.reopenWindow(tileOf(model, "Pods"));
  await settle();

  assert.deepEqual(lens.calls.reopenWindow[0]?.placement, {
    bounds: { x: 10, y: 10, width: 400, height: 300 },
    state: "normal",
    displayId: 1,
  });
  assert.equal(model.isOutOfPlace(tileOf(model, "Pods")), false);

  model.dispose();
});

test("recalling a layout puts a window opened again in its tile, which goes by the window it was opened again as before", async () => {
  const { lens, model } = await withLayoutOf([
    { id: "pods", title: "Pods", shows: reopeningFor("Pods") },
  ]);

  // Opened again once, from its tile, and closed again: its tile goes by that window now.
  lens.closeWindow(subWindowId("pods"));
  await settle();
  await model.reopenWindow(tileOf(model, "Pods"));
  await settle();
  lens.closeWindow(subWindowId("reopened-1"));
  await settle();
  assert.equal(
    tileOf(model, "Pods").key,
    keyOfWindow(subWindowId("reopened-1")),
  );

  // What the tiling shows once the recall has opened it again, before it places the windows.
  const shown: string[] = [];

  lens.onFocusWindow = () => {
    if (shown.length === 0) {
      shown.push(
        ...tilesOf(model).map(
          (it) =>
            `${it.record.title.get()}${it.missing ? " (not open)" : ""} as ${it.key}`,
        ),
      );
    }
  };

  await model.recall("Layout 1");
  await settle();

  assert.deepEqual(
    shown.filter((it) => it.startsWith("Pods")),
    [`Pods as ${keyOfWindow(subWindowId("reopened-2"))}`],
  );

  model.dispose();
});

test("a place opened in a cell is placed into it as soon as its window is listed, before the opening resolves, never shown under Not tiled, and can be opened again once closed", async () => {
  const { lens, model } = await withLayoutOf([]);
  const untiled = everUntiled(model);
  let answer = () => {};

  lens.openPlace = (opening) =>
    new Promise<void>((resolve) => {
      lens.placeWindows.set(opening.id, subWindowId("lens-own-id"));
      answer = resolve;
    });

  const opening = model.openInCell(
    {} as never,
    { displayId: 1, column: 0, row: 1 },
    "Pods - colima",
  );

  await settle();

  // Listed under an id of Lens's own, later than asked for, the opening not resolved yet.
  lens.addWindow(
    subWindowId("lens-own-id"),
    "Pods - colima",
    reopeningFor("Pods - colima"),
  );
  await settle();

  const tile = tileOf(model, "Pods - colima");

  assert.equal(tile.key, keyOfWindow(subWindowId("lens-own-id")));
  assert.equal("column" in tile && tile.column, 0);
  assert.equal("row" in tile && tile.row, 1);

  answer();
  await opening;
  await settle();

  assert.equal(
    tileOf(model, "Pods - colima").key,
    keyOfWindow(subWindowId("lens-own-id")),
  );
  assert.deepEqual(untiled.stop(), []);

  lens.closeWindow(subWindowId("lens-own-id"));
  await settle();
  assert.equal(model.canReopen(tileOf(model, "Pods - colima")), true);

  model.dispose();
});

test("a window opened again from its tile lands there as soon as Lens answers with it, never shown under Not tiled", async () => {
  const { lens, model } = await withLayoutOf([
    { id: "pods", title: "Pods", shows: reopeningFor("Pods") },
  ]);

  lens.closeWindow(subWindowId("pods"));
  await settle();

  const untiled = everUntiled(model);

  // As Lens does: answered as the window is listed, before it shows.
  await model.reopenWindow(tileOf(model, "Pods"));
  await settle();

  const tile = tileOf(model, "Pods");

  assert.equal(tile.key, keyOfWindow(subWindowId("reopened-1")));
  assert.ok(!tile.missing);
  assert.deepEqual(untiled.stop(), []);

  model.dispose();
});

test("a new window the user opens while windows are being opened in a cell or again from a tile shows under Not tiled at once", async () => {
  const { lens, model } = await withLayoutOf([
    { id: "pods", title: "Pods", shows: reopeningFor("Pods") },
  ]);

  lens.closeWindow(subWindowId("pods"));
  await settle();

  const answers: (() => void)[] = [];

  lens.openPlace = () => new Promise<void>((resolve) => answers.push(resolve));
  lens.reopen = (reopening, placement) =>
    new Promise((resolve) =>
      answers.push(() => resolve(lens.defaultReopen(reopening, placement))),
    );

  const openingInCell = model.openInCell(
    {} as never,
    { displayId: 1, column: 0, row: 1 },
    "Pods - colima",
  );
  const reopening = model.reopenWindow(tileOf(model, "Pods"));

  await settle();
  lens.addWindow(subWindowId("users-own"), "Logs");
  await settle();

  assert.deepEqual(
    model.tilingPlan.resolved.get().untiled.map((it) => it.key),
    [keyOfWindow(subWindowId("users-own"))],
  );

  for (const answer of answers) {
    answer();
  }

  await Promise.all([openingInCell, reopening]);
  model.dispose();
});

test("a place whose opening fails before Lens chooses a window for it leaves the cell empty", async () => {
  const { lens, model } = await withLayoutOf([]);

  lens.openPlace = async () => {
    throw new Error("The cluster is gone");
  };

  await model.openInCell(
    {} as never,
    { displayId: 1, column: 0, row: 1 },
    "Pods - colima",
  );
  await settle();

  assert.deepEqual(
    tilesOf(model).map((it) => it.record.title.get()),
    ["Lens"],
  );
  assert.equal(
    model.status.get(),
    'Could not open "Pods - colima": The cluster is gone',
  );

  model.dispose();
});

test("a window being opened in a cell when the extension was last loaded leaves no tile behind", async () => {
  const lens = createFakeLens({
    "tiling-plan-2": {
      windows: [
        {
          key: "application",
          title: "Lens",
          displayId: 1,
          column: 0,
          row: 0,
          columns: 1,
          rows: 1,
        },
        {
          key: "opening:123-0",
          title: "Pods - colima",
          displayId: 1,
          column: 1,
          row: 0,
          columns: 1,
          rows: 1,
        },
      ],
      columns: { "1": 2 },
      rows: { "1": 1 },
    },
  });

  lens.addWindow(applicationWindowId, "Lens");

  const model = modelOf(lens);

  await settle();

  assert.deepEqual(
    tilesOf(model).map((it) => it.record.title.get()),
    ["Lens"],
  );

  model.dispose();
});

test("a screen can be given more rows and columns than it would be given by itself, past eight", async () => {
  const { model } = await withLayoutOf([
    { id: "preferences", title: "Preferences" },
  ]);
  const displayId = model.tilingPlan.resolved.get().screens[0].display.id;

  model.tilingPlan.commit(
    setRowsInPlan(model.tilingPlan.resolved.get(), displayId, 12),
  );
  model.tilingPlan.commit(
    setColumnsInPlan(model.tilingPlan.resolved.get(), displayId, 10),
  );

  const [screen] = model.tilingPlan.resolved.get().screens;

  assert.equal(screen.rows, 12);
  assert.equal(screen.columns, 10);
});
