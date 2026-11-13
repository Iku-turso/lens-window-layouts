import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationWindowId } from "@k8slens/messaging-contracts";
import { runInAction } from "mobx";
import { windowLayoutsModelInjectable } from "../src/ui/window-layouts-model.injectable";
import { createFakeLens, settle, subWindowId } from "./fake-lens";

// Lens with a window open and a layout of it saved, "Layout 1".
const withLayout = async () => {
  const lens = createFakeLens();

  lens.addWindow(applicationWindowId, "Lens");
  lens.addWindow(subWindowId("preferences"), "Preferences");

  const model = lens.di.inject2(windowLayoutsModelInjectable)();

  await settle();
  await model.create();
  await settle();

  return { lens, model };
};

test("a layout pinned to the hotbar is shown pinned, and unpinning takes it off", async () => {
  const { lens, model } = await withLayout();
  const isPinned = model.isPinned("Layout 1");

  assert.equal(isPinned.get(), false);

  await model.togglePinned("Layout 1");

  assert.deepEqual([...lens.hotbar], ["Layout 1"]);
  assert.equal(isPinned.get(), true);

  await model.togglePinned("Layout 1");

  assert.deepEqual([...lens.hotbar], []);
  assert.equal(isPinned.get(), false);
});

test("renaming a pinned layout keeps it pinned, by its new name", async () => {
  const { lens, model } = await withLayout();

  await model.togglePinned("Layout 1");
  model.startRenaming("Layout 1");
  model.setRenameDraft("Work");
  await model.rename();

  assert.deepEqual([...lens.hotbar], ["Work"]);
  assert.equal(model.isPinned("Work").get(), true);
  assert.equal(model.status.get(), undefined);
});

test("renaming a layout not pinned pins nothing", async () => {
  const { lens, model } = await withLayout();

  model.startRenaming("Layout 1");
  model.setRenameDraft("Work");
  await model.rename();

  assert.deepEqual([...lens.hotbar], []);
});

test("deleting a pinned layout takes it off the hotbar", async () => {
  const { lens, model } = await withLayout();

  await model.togglePinned("Layout 1");
  await model.remove("Layout 1");

  assert.deepEqual([...lens.hotbar], []);
});

test("a hotbar that cannot be changed is told of, and the layout is renamed anyway", async () => {
  const { lens, model } = await withLayout();

  await model.togglePinned("Layout 1");
  // Another item already goes by the new name, as one left on the page by a layout of that name.
  lens.hotbar.push("Work");
  model.startRenaming("Layout 1");
  model.setRenameDraft("Work");
  await model.rename();

  assert.deepEqual(
    model.layouts.get()?.map((it) => it.name),
    ["Work"],
  );
  assert.match(model.status.get() ?? "", /^Could not change the hotbar: /);
});

test("tiling and saving into a layout not shown in the dialog tiles the windows by its own tiling, then saves them", async () => {
  const { lens, model } = await withLayout();

  model.tilingPlan.autoTile();
  await model.saveOver("Layout 1");
  // A second layout, every window left out of tiling, shown in the dialog.
  await model.create();
  await settle();
  const tiledBefore = lens.calls.setWindowBounds;

  const result = await model.tileAndSaveInto("Layout 1");
  const layout = model.layouts.get()?.find((it) => it.name === "Layout 1");

  assert.equal(result, 2);
  assert.ok(lens.calls.setWindowBounds > tiledBefore, "the windows tiled");
  assert.ok(
    layout?.tiling?.windows.length &&
      layout.tiling.windows.every((it) => it.displayId !== null),
    "every window of Layout 1 still tiled",
  );
  assert.equal(model.selected.get(), "Layout 1");
});

test("tiling and saving saves a window the layout's tiling has not as not tiled", async () => {
  const { lens, model } = await withLayout();

  model.tilingPlan.autoTile();
  await model.saveOver("Layout 1");
  lens.addWindow(subWindowId("logs"), "Logs");
  await settle();

  await model.tileAndSaveInto("Layout 1");

  const layout = model.layouts.get()?.find((it) => it.name === "Layout 1");
  const logs = layout?.windows.findIndex((it) => it.title === "Logs");

  assert.ok(logs !== undefined && logs >= 0, "Logs saved into the layout");
  assert.equal(
    layout?.tiling?.windows.find((it) => it.index === logs)?.displayId ?? null,
    null,
  );
});

test("tiling and saving into a layout there is none of saves nothing", async () => {
  const { model } = await withLayout();

  assert.equal(await model.tileAndSaveInto("Gone"), "no-layout");
  assert.deepEqual(
    model.layouts.get()?.map((it) => it.name),
    ["Layout 1"],
  );
});

test("a layout tells which of its windows are not open, also when it is not the one shown", async () => {
  const { lens, model } = await withLayout();
  const layout = () =>
    model.layouts.get()!.find((it) => it.name === "Layout 1")!;
  const preferences = () =>
    layout().windows.findIndex((it) => it.title === "Preferences");

  assert.deepEqual([...model.notOpenOf(layout())], []);

  // Another layout shown in the dialog.
  await model.create();
  await settle();
  lens.closeWindow(subWindowId("preferences"));
  await settle();

  assert.deepEqual([...model.notOpenOf(layout())], [preferences()]);
});

test("a layout tells which of its open windows are not where it saved them, also when it is not the one shown", async () => {
  const { lens, model } = await withLayout();
  const layout = () =>
    model.layouts.get()!.find((it) => it.name === "Layout 1")!;
  const preferences = () =>
    layout().windows.findIndex((it) => it.title === "Preferences");

  assert.deepEqual([...model.notSavedOf(layout())], []);

  // Another layout shown in the dialog.
  await model.create();
  await settle();
  runInAction(() =>
    lens.windows
      .find((it) => it.title.get() === "Preferences")!
      .bounds.set({ x: 500, y: 500, width: 400, height: 300 }),
  );

  assert.deepEqual([...model.notSavedOf(layout())], [preferences()]);
});
