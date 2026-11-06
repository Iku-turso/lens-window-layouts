import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationWindowId } from "@k8slens/messaging-contracts";
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
