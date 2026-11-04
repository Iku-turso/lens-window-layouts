import {
  getInjectable2,
  instancePurgeCallbackToken,
} from "@k8slens/injectable";
import { windowLayoutsModelInjectable } from "./window-layouts-model.injectable";

// Stops the reactions and timers of the model as it is thrown away, as when the extension is
// rebuilt, disabled or uninstalled, so that none of them outlives it. Its file sorts after the
// model's, so that it is registered after the model and still is when the model leaves.
export const disposeWindowLayoutsModelInjectable = getInjectable2({
  id: "window-manager.dispose-window-layouts-model",
  injectionToken: instancePurgeCallbackToken.for(windowLayoutsModelInjectable),

  instantiate:
    () =>
    () =>
    ({ instance }) => {
      instance.dispose();

      // Required by the type only: what the callback returns is not used.
      return () => instance;
    },
});
