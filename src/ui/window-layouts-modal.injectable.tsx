import { Button, Div, Form, Span } from "@k8slens/element-components";
import {
  PlainButton,
  PrimaryButton,
  TextInput,
} from "@k8slens/input-components";
import {
  ModalContainer,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@k8slens/modal-components";
import {
  getModalInjectableBunch,
  getModalKind,
  useRespondFromModal,
} from "@k8slens/modal-contracts";
import {
  AddIcon,
  ContentCopyIcon,
  DeleteOutlineIcon,
  IconButton,
  EditIcon,
  HistoryIcon,
  PushPinIcon,
  SaveIcon,
  SplitViewIcon,
} from "@k8slens/icon";
import "./icon-button.scss";
import styles from "./layout-list.module.scss";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { useCallback } from "react";
import type { SavedWindowLayout } from "../layouts/saved-window-layouts.injectable";
import { ModalErrorBoundary } from "./modal-error-boundary";
import { TileWindows } from "./tiling-editor";
import { windowLayoutsModelInjectable } from "./window-layouts-model.injectable";

export const windowLayoutsModalKind = getModalKind<[], void>()(
  "window-layouts",
);

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

// The layout's windows and screens, and the screens of its tiling that are not connected now.
const LayoutDescription = observer(
  ({ layout, stacked }: { layout: SavedWindowLayout; stacked?: boolean }) => {
    const model = useInject(windowLayoutsModelInjectable)();
    const missing = model.missingScreensOf(layout);

    return (
      <Span
        $color="textMuted"
        $font={{ size: "s" }}
        $tooltip={layout.windows.map((it) => it.title).join("\n")}
      >
        {[
          plural(layout.windows.length, "window"),
          ...(layout.displays
            ? [plural(layout.displays.length, "screen")]
            : []),
        ].join(" · ")}
        {missing > 0 &&
          (stacked ? (
            // On a line of its own, in the narrow list.
            <Span $color="critical" $style={{ display: "block" }}>
              {plural(missing, "screen")} missing
            </Span>
          ) : (
            <Span $color="critical">
              {" "}
              · {plural(missing, "screen")} missing
            </Span>
          ))}
      </Span>
    );
  },
);

// The name of the layout selected, renamed by clicking it: Enter or leaving it keeps the name
// typed, Escape the name it had.
const LayoutName = observer(({ name }: { name: string }) => {
  const model = useInject(windowLayoutsModelInjectable)();

  // Selects the name once its input shows, so that typing replaces it.
  const selectWhenShown = useCallback((input: HTMLInputElement | null) => {
    if (input) {
      setTimeout(() => {
        input.focus();
        input.select();
      });
    }
  }, []);

  if (model.renaming.get() !== name) {
    return (
      <Span
        $font={{ bold: true, size: "l" }}
        $flex={{ direction: "horizontal", gap: "xs", verticalAlign: "center" }}
        $style={{ cursor: "pointer", alignSelf: "flex-start" }}
        $tooltip="Click to rename"
        role="button"
        tabIndex={0}
        onClick={() => model.startRenaming(name)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            model.startRenaming(name);
          }
        }}
      >
        {name}
        <EditIcon $size="l" $color="textMuted" />
      </Span>
    );
  }

  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        void model.rename();
      }}
    >
      <TextInput
        autoFocus
        aria-label="Name of the layout"
        value={model.renameDraft.get()}
        onChange={(event) => model.setRenameDraft(event.target.value)}
        $ref={selectWhenShown}
        onBlur={() => void model.rename()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            model.cancelRenaming();
          }
        }}
      />
    </Form>
  );
});

// One layout in the list on the left, a row of it, selected by clicking it.
const LayoutItem = observer(({ layout }: { layout: SavedWindowLayout }) => {
  const model = useInject(windowLayoutsModelInjectable)();
  const isSelected = model.selected.get() === layout.name;

  return (
    <Div
      className={[styles.row, isSelected ? styles.selected : ""].join(" ")}
      $flex={{ direction: "vertical", gap: "xxs" }}
      $padding={{ vertical: "m", horizontal: "m" }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => void model.select(layout.name)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void model.select(layout.name);
        }
      }}
    >
      {isSelected && (
        <Span
          className={styles.marker}
          $backgroundColor="primary"
          aria-hidden="true"
        />
      )}
      <Span className={styles.nameLine}>
        <Span className={styles.name} $tooltip={layout.name}>
          {layout.name}
        </Span>

        {/* At the row's right end, shown while the pointer is on the row. */}
        <Button
          className={styles.recall}
          $interactive
          aria-label={`Recall ${layout.name}`}
          $tooltip="Recall: put the windows back where this layout has them"
          $enabled={model.canArrange.get()}
          // Not selecting the layout by the row: recalling selects it itself.
          onClick={(event) => {
            event.stopPropagation();
            void model.recall(layout.name);
          }}
        >
          <HistoryIcon $size="l" $color="primary" />
        </Button>
      </Span>
      <LayoutDescription layout={layout} stacked />
    </Div>
  );
});

// The left panel: the layouts, and the button saving the windows as they are now as a new one.
const LayoutList = observer(() => {
  const model = useInject(windowLayoutsModelInjectable)();
  const layouts = model.layouts.get();

  return (
    <Div
      $flex={{ direction: "vertical", gap: "s" }}
      $style={{ width: "17%", minWidth: 200, flexShrink: 0 }}
    >
      <Div
        $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}
      >
        <Span $font={{ bold: true }} $flexChild>
          Layouts
        </Span>

        {/* Side by side, closer to each other than to the heading. */}
        <Div
          $flex={{
            direction: "horizontal",
            gap: "xs",
            verticalAlign: "center",
          }}
        >
          <Button
            $interactive
            aria-label="Duplicate layout"
            $tooltip={
              model.selectedLayout.get()
                ? `Copy "${model.selectedLayout.get()!.name}", with its tiling, as a new layout`
                : "Select a layout to copy it"
            }
            $enabled={!!model.selectedLayout.get()}
            $onClick={() => model.duplicate()}
          >
            {/* Smaller than the plus beside it: the copy glyph fills its box where the plus does not. */}
            <ContentCopyIcon $size="s" />
          </Button>

          <Button
            $interactive
            aria-label="New layout"
            $tooltip="Save the windows as they are now, and the tiling, as a new layout"
            $enabled={model.canArrange.get()}
            $onClick={() => model.create()}
          >
            <AddIcon />
          </Button>
        </Div>
      </Div>

      {layouts?.length === 0 && (
        <Span $color="textMuted">
          No layouts yet. Arrange the windows of Lens the way you like, then
          click + to save them as a layout.
        </Span>
      )}

      {/* The height the panel has, without the layouts making it taller: the box of them fits them,
          scrolling when they are more than fit. */}
      <Div $flexChild $style={{ minHeight: 0 }}>
        {!!layouts?.length && (
          <Div
            className={styles.list}
            $flex={{ direction: "vertical" }}
            $backgroundColor="backgroundSecondary"
            $border={{ color: "borderPrimary", width: "xxs", radius: "m" }}
          >
            {layouts.map((layout) => (
              <LayoutItem key={layout.name} layout={layout} />
            ))}
          </Div>
        )}
      </Div>
    </Div>
  );
});

// Pins the layout to the hotbar, to recall it from there, or takes it off.
const PinToHotbar = observer(({ name }: { name: string }) => {
  const model = useInject(windowLayoutsModelInjectable)();
  const isPinned = model.isPinned(name).get();

  return (
    <button
      type="button"
      className="window-manager-icon-button"
      aria-label={isPinned ? `Unpin ${name} from the hotbar` : `Pin ${name} to the hotbar`}
      aria-pressed={isPinned}
      title={
        isPinned
          ? "Unpin from the hotbar"
          : "Pin to the hotbar, to recall this layout from there"
      }
      onClick={() => void model.togglePinned(name)}
    >
      <PushPinIcon $size="l" $color={isPinned ? "primary" : "textMuted"} />
    </button>
  );
});

// The top of the right panel: the layout selected, and what can be done with it.
const SelectedLayout = observer(() => {
  const model = useInject(windowLayoutsModelInjectable)();
  const layout = model.selectedLayout.get();

  if (!layout) {
    return null;
  }

  return (
    <Div $flex={{ direction: "horizontal", gap: "m", verticalAlign: "center" }}>
      <Div $flex={{ direction: "vertical", gap: "xxs" }} $flexChild>
        <Div
          $flex={{
            direction: "horizontal",
            gap: "xxs",
            verticalAlign: "center",
          }}
        >
          <LayoutName name={layout.name} />

          {model.renaming.get() !== layout.name && (
            <PinToHotbar name={layout.name} />
          )}

          {model.renaming.get() !== layout.name && (
            <button
              type="button"
              className="window-manager-icon-button"
              aria-label={`Delete ${layout.name}`}
              title="Delete this layout"
              onClick={() => void model.remove(layout.name)}
            >
              <DeleteOutlineIcon $size="l" $color="critical" />
            </button>
          )}
        </Div>
        <LayoutDescription layout={layout} />
      </Div>

      <PlainButton
        $disabled={!model.canArrange.get()}
        $tooltip="Put the windows back where the layout has them"
        onClick={() => void model.recall(layout.name)}
      >
        Recall
      </PlainButton>

      {model.savedNote.get() && (
        <Span $color="success" role="status">
          {model.savedNote.get()}
        </Span>
      )}

      <PrimaryButton
        Icon={SaveIcon}
        $disabled={!model.canArrange.get() || model.isSelectedSaved.get()}
        $tooltip={
          model.isSelectedSaved.get()
            ? "Nothing to save: the windows and the tiling below are as this layout has them"
            : "Save the windows as they are now, and the tiling below, into this layout"
        }
        onClick={() => model.saveOver(layout.name)}
      >
        Save
      </PrimaryButton>
    </Div>
  );
});

const WindowLayoutsModal = observer(() => {
  const model = useInject(windowLayoutsModelInjectable)();
  const respond = useRespondFromModal(windowLayoutsModalKind);
  const status = model.status.get();

  return (
    <ModalContainer
      $style={{
        width: "calc(var(--unit) * 260)",
        maxWidth: "95vw",
        height: "100%",
      }}
    >
      <ModalHeader icon={<SplitViewIcon />}>Window layouts</ModalHeader>

      <ModalContent
        $flex={{ direction: "vertical", gap: "m" }}
        $style={{ flexGrow: 1 }}
      >
        {!model.canArrange.get() && (
          <Span $color="warning">
            This Lens does not let windows be arranged. Window layouts need Lens
            Studio.
          </Span>
        )}

        {status && <Span $color="textMuted">{status}</Span>}

        <Div
          $flex={{ direction: "horizontal", gap: "l" }}
          $flexChild
          $style={{ alignItems: "stretch" }}
        >
          <LayoutList />

          {/* Empty until a layout is selected. */}
          <Div
            $flex={{ direction: "vertical", gap: "m" }}
            $flexChild
            $style={{ minWidth: 0 }}
          >
            {model.selectedLayout.get() && (
              <>
                <SelectedLayout />
                <TileWindows />
              </>
            )}
          </Div>
        </Div>
      </ModalContent>

      <ModalFooter>
        <PlainButton onClick={() => respond()}>Close</PlainButton>
      </ModalFooter>
    </ModalContainer>
  );
});

// Uses nothing of the extension but the modal's own answering, which Lens provides.
const OutOfDateModal = ({ error }: { error: unknown }) => {
  const respond = useRespondFromModal(windowLayoutsModalKind);

  return (
    <ModalContainer
      $style={{ width: "calc(var(--unit) * 140)", maxWidth: "90vw" }}
    >
      <ModalHeader icon={<SplitViewIcon />}>Window layouts</ModalHeader>

      <ModalContent $flex={{ direction: "vertical", gap: "m" }}>
        <Span>
          This dialog stopped working, most likely because the extension was
          updated while it was open.
        </Span>
        <Span $color="textMuted">
          Close it and open it again. ({String(error)})
        </Span>
        {/* Where it failed, for whoever looks into it. */}
        <pre hidden data-error-stack>
          {error instanceof Error ? error.stack : undefined}
        </pre>
      </ModalContent>

      <ModalFooter>
        <PlainButton onClick={() => respond()}>Close</PlainButton>
      </ModalFooter>
    </ModalContainer>
  );
};

const GuardedWindowLayoutsModal = () => (
  <ModalErrorBoundary fallback={(error) => <OutOfDateModal error={error} />}>
    <WindowLayoutsModal />
  </ModalErrorBoundary>
);

export const windowLayoutsModalBunch = getModalInjectableBunch({
  kind: windowLayoutsModalKind,
  Component: GuardedWindowLayoutsModal,
  onClose: () => undefined,
});
