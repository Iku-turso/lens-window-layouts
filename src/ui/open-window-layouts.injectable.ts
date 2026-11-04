import { getInjectable2 } from "@k8slens/injectable";
import { openModalInjectionToken } from "@k8slens/modal-contracts";
import { windowLayoutsModalKind } from "./window-layouts-modal.injectable";
import { windowLayoutsModelInjectable } from "./window-layouts-model.injectable";

export const openWindowLayoutsInjectable = getInjectable2({
  id: "window-manager.open-window-layouts",
  consumptions: [openModalInjectionToken],

  instantiate: (di) => {
    const openWindowLayoutsModal = di.inject(
      openModalInjectionToken.for(windowLayoutsModalKind).for(di.scopeIds),
    )();

    return () => async () => {
      // The model is made as the dialog first opens, not as the status bar shows its button: what the
      // model needs failing then fails the dialog alone, not the window's frame with the button in it.
      di.inject(windowLayoutsModelInjectable)().reset();
      await openWindowLayoutsModal();
    };
  },
});
