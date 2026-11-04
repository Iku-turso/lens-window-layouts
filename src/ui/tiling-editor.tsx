import { Button, Div, Form, Span } from "@k8slens/element-components";
import { dropDownMenu } from "@k8slens/drop-down-menu-contracts";
import {
  AddCircleOutlineIcon,
  CloseIcon,
  DashboardIcon,
  EditIcon,
  MoveUpIcon,
  ReplayIcon,
  RemoveCircleOutlineIcon,
  SpinnerIcon,
} from "@k8slens/icon";
import {
  PlainButton,
  PrimaryButton,
  TextInput,
} from "@k8slens/input-components";
import { isApplicationWindow } from "@k8slens/messaging-contracts";
import { useInject } from "@k8slens/use-inject";
import type {
  DisplayRecord,
  WindowBounds,
} from "@k8slens/window-layout-contracts";
import { observer } from "mobx-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { nameOfScreen } from "../layouts/screens";
import {
  maxColumns,
  maxRows,
  moveInPlan,
  resizeInPlan,
  setColumnsInPlan,
  setRowsInPlan,
  targetInGrid,
  untileScreenInPlan,
  type PlannedScreen,
  type PlannedWindow,
  type PlanTarget,
  type ResolvedTilingPlan,
} from "../layouts/tiling-plan";
import styles from "./tiling-editor.module.scss";
import { newWindowMenuKind } from "./new-window-menu.injectable";
import { windowLayoutsModelInjectable } from "./window-layouts-model.injectable";

// The height of the band over each screen naming it, above the grid.
const band = 40;
// The room left between screens drawn side by side.
const gap = 32;
// The least width a screen is drawn at as the screens lie: narrower, they are drawn in rows instead.
const minScreenWidth = 360;

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const overlaps = (a: WindowBounds, b: WindowBounds) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

// Where each screen is drawn, in percent of the drawing, as the screens lie to each other. A screen
// not connected is drawn where it was, unless a screen is there now: then right of them all. When
// the width the drawing has would draw a screen narrower than it can be used at, the screens wrap
// onto rows instead, taking the height they need.
const drawScreens = (
  screens: readonly PlannedScreen[],
  room: number | undefined,
) => {
  if (screens.length === 0) {
    return { rects: new Map<number, Rect>(), aspectRatio: 1, wraps: false };
  }

  const placed: WindowBounds[] = [];

  for (const screen of [...screens].sort(
    (a, b) => Number(a.missing) - Number(b.missing),
  )) {
    const bounds = screen.display.bounds.get();

    placed[screens.indexOf(screen)] =
      screen.missing && placed.some((it) => it && overlaps(it, bounds))
        ? {
            ...bounds,
            x: Math.max(...placed.filter(Boolean).map((it) => it.x + it.width)),
            y: Math.min(...placed.filter(Boolean).map((it) => it.y)),
          }
        : bounds;
  }

  const minX = Math.min(...placed.map((it) => it.x));
  const minY = Math.min(...placed.map((it) => it.y));
  const width = Math.max(...placed.map((it) => it.x + it.width)) - minX;
  const height = Math.max(...placed.map((it) => it.y + it.height)) - minY;

  const rects = new Map<number, Rect>(
    screens.map((screen, index) => {
      const bounds = placed[index];

      return [
        screen.display.id,
        {
          left: ((bounds.x - minX) / width) * 100,
          top: ((bounds.y - minY) / height) * 100,
          width: (bounds.width / width) * 100,
          height: (bounds.height / height) * 100,
        },
      ];
    }),
  );

  const fits =
    !room ||
    placed.every((it) => (it.width / width) * room - gap >= minScreenWidth);

  return fits
    ? { rects, aspectRatio: width / height, wraps: false }
    : {
        ...wrapScreens(
          screens.map((screen, index) => ({
            id: screen.display.id,
            bounds: placed[index],
          })),
          room,
        ),
        wraps: true,
      };
};

// The screens in rows, left to right as they lie, at one scale so that they keep their sizes to
// each other: as many in a row as fit at a usable width, every row centred.
const wrapScreens = (
  screens: readonly { id: number; bounds: WindowBounds }[],
  room: number,
) => {
  const ordered = [...screens].sort(
    (a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y,
  );
  const widest = ordered.map((it) => it.bounds.width).sort((a, b) => b - a);
  const narrowest = widest[widest.length - 1];

  // The largest scale at which the widest of as many screens as can share a row fill it, the
  // narrowest of them still usable; one screen to a row at the least.
  const scale =
    Array.from(
      { length: ordered.length - 1 },
      (_, index) => ordered.length - 1 - index,
    )
      .map(
        (count) =>
          room / widest.slice(0, count).reduce((sum, it) => sum + it, 0),
      )
      .find((it) => narrowest * it - gap >= minScreenWidth) ?? room / widest[0];

  const rows: { id: number; width: number; height: number }[][] = [];

  for (const { id, bounds } of ordered) {
    const slot = {
      id,
      width: bounds.width * scale,
      height: bounds.height * scale,
    };
    const row = rows[rows.length - 1];

    if (
      row &&
      row.reduce((sum, it) => sum + it.width, 0) + slot.width <= room + 0.5
    ) {
      row.push(slot);
    } else {
      rows.push([slot]);
    }
  }

  const height = rows.reduce(
    (sum, row) => sum + Math.max(...row.map((it) => it.height)),
    0,
  );
  const rects = new Map<number, Rect>();
  let top = 0;

  for (const row of rows) {
    let left = (room - row.reduce((sum, it) => sum + it.width, 0)) / 2;

    for (const slot of row) {
      rects.set(slot.id, {
        left: (left / room) * 100,
        top: (top / height) * 100,
        width: (slot.width / room) * 100,
        height: (slot.height / height) * 100,
      });

      left += slot.width;
    }

    top += Math.max(...row.map((it) => it.height));
  }

  return { rects, aspectRatio: room / height };
};

// The grid of a screen in pixels on the page, from the drawing's place on the page.
const gridOnPage = (drawing: DOMRect, rect: Rect) => {
  const left = drawing.left + (rect.left / 100) * drawing.width + gap / 2;
  const top = drawing.top + (rect.top / 100) * drawing.height + gap / 2 + band;

  return {
    left,
    top,
    width: (rect.width / 100) * drawing.width - gap,
    height: (rect.height / 100) * drawing.height - gap - band,
  };
};

// Where every window of the plan is: on which screen, in which cells; and every screen's grid.
const placesOf = (plan: ResolvedTilingPlan) =>
  JSON.stringify([
    plan.screens.map((screen) => [
      screen.display.id,
      screen.columns,
      screen.rows,
      screen.windows
        .map((it) => [it.key, it.column, it.row, it.columns, it.rows])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ]),
    plan.untiled.map((it) => it.key).sort(),
  ]);

type Drag =
  | {
      readonly kind: "move";
      readonly key: string;
      readonly title: string;
      // The cell of the window that was grabbed, counted from its top left.
      readonly grabbed: { readonly column: number; readonly row: number };
    }
  | {
      readonly kind: "resize";
      readonly key: string;
      readonly displayId: number;
    };

const drawingSelector = "[data-tiling-screens]";
const traySelector = "[data-tiling-tray]";

// Where a window dragged to the point goes: on a screen, with the cell it was grabbed by in the cell
// under the point, or in the first free cell over the screen's name; in the tray, left as it is. The
// cells are those of the plan before the drag, so that the preview growing a screen's grid does not
// move them under the pointer.
const targetAt = (
  x: number,
  y: number,
  plan: ResolvedTilingPlan,
  rects: Map<number, Rect>,
  grabbed: { readonly column: number; readonly row: number },
): PlanTarget | undefined => {
  if (document.elementFromPoint(x, y)?.closest(traySelector)) {
    return { displayId: null };
  }

  const drawing = document
    .querySelector(drawingSelector)
    ?.getBoundingClientRect();

  if (!drawing) {
    return undefined;
  }

  for (const screen of plan.screens) {
    const grid = gridOnPage(drawing, rects.get(screen.display.id)!);

    if (
      x < grid.left ||
      x > grid.left + grid.width ||
      y < grid.top - band ||
      y > grid.top + grid.height
    ) {
      continue;
    }

    return y < grid.top
      ? { displayId: screen.display.id }
      : targetInGrid(x, y, grid, screen, grabbed);
  }

  return undefined;
};

// Closes a sub-window and takes it out of the layout; one not open is only taken out of it.
const CloseWindowButton = observer(
  ({ window, inline }: { window: PlannedWindow; inline?: boolean }) => {
    const model = useInject(windowLayoutsModelInjectable)();

    if (isApplicationWindow(window.record.window)) {
      return null;
    }

    return (
      <button
        type="button"
        className={[
          styles.closeWindow,
          inline ? styles.closeWindowInline : "",
        ].join(" ")}
        aria-label={
          window.missing
            ? "Remove from the layout"
            : "Close the window and remove it from the layout"
        }
        title={
          window.missing
            ? "Remove from the layout"
            : "Close the window and remove it from the layout"
        }
        // Not the start of dragging the window.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => void model.closeWindow(window)}
      >
        {/* Larger on a tile than on a chip of the windows not tiled. */}
        <CloseIcon $size={inline ? "s" : "m"} />
      </button>
    );
  },
);

// The window's name, renamed in place as a layout's is: Enter or leaving it keeps the name typed,
// Escape the name it had.
const WindowTitle = observer(({ window }: { window: PlannedWindow }) => {
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

  if (model.renamingWindow.get() !== window.key) {
    return <span className={styles.tileTitle}>{titleOf(window)}</span>;
  }

  return (
    <Form
      className={styles.tileTitleForm}
      // Not the start of dragging the window, nor of selecting text by dragging over it.
      onPointerDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        void model.renameWindow(window);
      }}
    >
      <TextInput
        aria-label="Name of the window"
        value={model.windowNameDraft.get()}
        onChange={(event) => model.setWindowNameDraft(event.target.value)}
        $ref={selectWhenShown}
        onBlur={() => void model.renameWindow(window)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            model.cancelRenamingWindow();
          }
        }}
      />
    </Form>
  );
});

// Renames the window, right after its name, as a layout's pen is: only a sub-window open can be.
const RenameWindowButton = observer(
  ({ window, onTile }: { window: PlannedWindow; onTile?: boolean }) => {
    const model = useInject(windowLayoutsModelInjectable)();

    if (
      !model.canRenameWindow(window) ||
      model.renamingWindow.get() === window.key
    ) {
      return null;
    }

    return (
      <button
        type="button"
        className={styles.renameWindow}
        aria-label="Rename the window"
        title="Rename the window"
        // Not the start of dragging the window.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => model.startRenamingWindow(window)}
      >
        {/* Larger on a tile than on a chip of the windows not tiled. */}
        <EditIcon $size={onTile ? "m" : "s"} />
      </button>
    );
  },
);

// Opens the window not open again, as it was, where its tile is: shown only when Lens kept how.
const ReopenWindowButton = observer(({ window }: { window: PlannedWindow }) => {
  const model = useInject(windowLayoutsModelInjectable)();

  if (!model.canReopen(window)) {
    return null;
  }

  return (
    <Button
      className={styles.reopenWindow}
      $interactive
      aria-label="Open the window again"
      $tooltip="Open the window again, where its tile is"
      // Not the start of dragging the window.
      onPointerDown={(event) => event.stopPropagation()}
      $onClick={() => void model.reopenWindow(window)}
    >
      <ReplayIcon $size="m" $color="primary" />
    </Button>
  );
});

const titleOf = (window: PlannedWindow) =>
  isApplicationWindow(window.record.window)
    ? `${window.record.title.get()} (main window)`
    : window.record.title.get();

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

// Steps a count down and up, its buttons telling the count: across for columns, along the top of
// the screen, and up and down for rows, along its side, more above fewer.
const Stepper = ({
  value,
  word,
  min,
  max,
  where,
  vertical = false,
  onChange,
}: {
  value: number;
  word: string;
  min: number;
  max: number;
  where: string;
  vertical?: boolean;
  onChange: (value: number) => void;
}) => {
  const fewer = (
    <StepperButton
      label={`Fewer ${word}s on ${where}`}
      tooltip={
        value > min
          ? `Remove a ${word}: ${plural(value - 1, word)}`
          : value > 1
            ? `${plural(value, word)}: the windows here need no fewer`
            : `${plural(value, word)}: the fewest`
      }
      enabled={value > min}
      onClick={() => onChange(value - 1)}
    >
      <RemoveCircleOutlineIcon $size="m" $color="primary" />
    </StepperButton>
  );

  const more = (
    <StepperButton
      label={`More ${word}s on ${where}`}
      tooltip={
        value < max
          ? `Add a ${word}: ${plural(value + 1, word)}`
          : `${plural(value, word)}: the most`
      }
      enabled={value < max}
      onClick={() => onChange(value + 1)}
    >
      <AddCircleOutlineIcon $size="m" $color="primary" />
    </StepperButton>
  );

  const name = `${word[0].toUpperCase()}${word.slice(1)}s`;

  return vertical ? (
    <span className={styles.verticalStepperGroup}>
      {more}
      <span className={[styles.label, styles.verticalLabel].join(" ")}>
        {name}
      </span>
      {fewer}
    </span>
  ) : (
    <span className={styles.stepperGroup}>
      {fewer}
      <span className={styles.label}>{name}</span>
      {more}
    </span>
  );
};

// The tooltip is the wrapper's, so that it shows on a disabled button too, telling why.
const StepperButton = ({
  label,
  tooltip,
  enabled,
  onClick,
  children,
}: {
  label: string;
  tooltip: string;
  enabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Span className={styles.stepperTip} $tooltip={tooltip}>
    <Button
      className={styles.stepper}
      aria-label={label}
      $enabled={enabled}
      $onClick={onClick}
    >
      {children}
    </Button>
  </Span>
);

const ScreenBand = observer(
  ({
    screen,
    index,
    isHovered,
  }: {
    screen: PlannedScreen;
    index: number;
    isHovered: boolean;
  }) => {
    const model = useInject(windowLayoutsModelInjectable)();
    const name = nameOfScreen(screen.display.label.get(), index);
    const { width, height } = screen.display.workArea.get();
    const hasWindows = screen.windows.length > 0;

    return (
      <Div className={styles.band} $color="textMuted" $font={{ size: "s" }}>
        <span className={styles.screenName}>
          {/* The name in the text's own colour, to stand out from the details after it. */}
          <Span $color="textDefault">{name}</Span>
          {screen.display.isPrimary.get() ? " · primary" : ""} · {width} ×{" "}
          {height}
          {screen.missing && (
            <Span $color="critical">
              {" "}
              · not connected; its windows are not tiled
            </Span>
          )}
        </span>

        {/* Untile: every window of the screen back to those not tiled, above the screens. */}
        <Button
          // Shown while the pointer is over the screen, or the button has the keyboard's focus.
          className={[styles.untile, isHovered ? styles.shown : ""].join(" ")}
          $interactive
          aria-label={`Untile ${name}`}
          $tooltip={
            hasWindows
              ? `Untile: move the windows of ${name} to Not tiled`
              : `No windows tiled on ${name}`
          }
          $enabled={hasWindows}
          $onClick={() =>
            model.tilingPlan.commit(
              untileScreenInPlan(
                model.tilingPlan.resolved.get(),
                screen.display.id,
              ),
            )
          }
        >
          <MoveUpIcon $size="m" />
        </Button>
      </Div>
    );
  },
);

// Pills over the screen's grid sizing it: its columns on the middle of its top edge, its rows on
// the middle of its left edge. Laid over the screen's tiles, so that a tile never hides them.
const ScreenSteppers = observer(
  ({ screen, index }: { screen: PlannedScreen; index: number }) => {
    const model = useInject(windowLayoutsModelInjectable)();
    const name = nameOfScreen(screen.display.label.get(), index);
    const plan = () => model.tilingPlan.resolved.get();

    return (
      <>
        <Div
          className={[styles.pill, styles.columnsPill].join(" ")}
          $backgroundColor="backgroundSecondary"
          $border={{ color: "borderPrimary", width: "xxs", radius: "full" }}
          $color="textMuted"
          $font={{ size: "s" }}
          // On the middle of the grid's top line, a pixel thick.
          $style={{ top: `calc(${band}px + 0.5px)` }}
        >
          <Stepper
            value={screen.columns}
            word="column"
            min={1}
            max={maxColumns}
            where={name}
            onChange={(columns) =>
              model.tilingPlan.commit(
                setColumnsInPlan(plan(), screen.display.id, columns),
              )
            }
          />
        </Div>

        <Div
          className={[styles.pill, styles.rowsPill].join(" ")}
          $backgroundColor="backgroundSecondary"
          $border={{ color: "borderPrimary", width: "xxs", radius: "full" }}
          $color="textMuted"
          $font={{ size: "s" }}
          $style={{ top: `calc(${band}px + (100% - ${band}px) / 2)` }}
        >
          <Stepper
            value={Math.max(screen.rows, 1)}
            word="row"
            min={Math.max(screen.neededRows, 1)}
            max={maxRows}
            where={name}
            vertical
            onChange={(rows) =>
              model.tilingPlan.commit(
                setRowsInPlan(plan(), screen.display.id, rows),
              )
            }
          />
        </Div>
      </>
    );
  },
);

// Arrange how the windows are tiled: drag a window onto a screen and into its place in the order,
// or into the tray to leave it as it is; drag its corner to have it span more cells.
export const TilingEditor = observer(() => {
  const model = useInject(windowLayoutsModelInjectable)();
  const plan = model.tilingPlan.resolved.get();
  // A window not open, as opposed to one being opened, which shows as such already.
  const isNotOpen = (window: PlannedWindow) =>
    window.missing && !model.isReopeningWindow(window);
  const [drag, setDrag] = useState<Drag | undefined>();
  const [preview, setPreview] = useState<ResolvedTilingPlan | undefined>();
  const [pointer, setPointer] = useState<
    { x: number; y: number } | undefined
  >();
  // The screen the pointer is over, its tiles and pills counting as it: its Untile shows then.
  const [hoveredScreen, setHoveredScreen] = useState<number | undefined>();
  const previewRef = useRef(preview);
  const drawingRef = useRef<HTMLDivElement>(null);
  const displays = plan.screens.map((it) => it.display);
  const [room, setRoom] = useState<
    { width: number; height: number } | undefined
  >();
  const { rects, aspectRatio, wraps } = drawScreens(plan.screens, room?.width);
  const shown = preview ?? plan;
  // Tile all places the windows not tiled, those open.
  const canAutoTile = shown.untiled.some((window) => !window.missing);

  previewRef.current = preview;

  // The room the drawing has, followed as the dialog resizes, to draw the screens as large as fits
  // without changing their proportions.
  useEffect(() => {
    const drawing = drawingRef.current;

    if (!drawing) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) =>
      setRoom({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );

    observer.observe(drawing);

    return () => observer.disconnect();
  }, []);

  // In rows, as wide as there is room for, as tall as that makes them: the dialog scrolls.
  const drawnWidth = room
    ? wraps
      ? room.width
      : Math.min(room.width, room.height * aspectRatio)
    : 0;

  useEffect(() => {
    if (!drag) {
      return undefined;
    }

    const base = model.tilingPlan.resolved.get();

    const onMove = (event: PointerEvent) => {
      // The button let go where this window did not hear it, as outside the window: the drag is over.
      if (event.buttons === 0) {
        end(true);

        return;
      }

      if (drag.kind === "move") {
        setPointer({ x: event.clientX, y: event.clientY });

        const target = targetAt(
          event.clientX,
          event.clientY,
          base,
          rects,
          drag.grabbed,
        );
        const next = target ? moveInPlan(base, drag.key, target) : undefined;

        previewRef.current = next;
        setPreview(next);

        return;
      }

      const screen = base.screens.find(
        (it) => it.display.id === drag.displayId,
      );
      const window = screen?.windows.find((it) => it.key === drag.key);
      const drawing = document
        .querySelector(drawingSelector)
        ?.getBoundingClientRect();

      if (!screen || !window || !drawing) {
        return;
      }

      const grid = gridOnPage(drawing, rects.get(screen.display.id)!);
      const cellWidth = grid.width / screen.columns;
      const cellHeight = grid.height / Math.max(screen.rows, 1);
      const columns = Math.ceil(
        (event.clientX - grid.left - window.column * cellWidth) / cellWidth,
      );
      const rows = Math.ceil(
        (event.clientY - grid.top - window.row * cellHeight) / cellHeight,
      );

      const next = resizeInPlan(base, drag.key, columns, rows);

      previewRef.current = next;
      setPreview(next);
    };

    const end = (keep: boolean) => {
      // A drag that leaves every window where it was, as a click or a drop back in place, changes
      // nothing, and tiles nothing again.
      if (
        keep &&
        previewRef.current &&
        placesOf(previewRef.current) !== placesOf(base)
      ) {
        model.tilingPlan.commit(previewRef.current);
      }

      setDrag(undefined);
      setPreview(undefined);
      setPointer(undefined);
    };

    const onUp = () => end(true);
    const onCancel = () => end(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        end(false);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    window.addEventListener("keydown", onKey, true);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [drag]);

  const startMove =
    (window: PlannedWindow) => (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }

      // Which of the window's cells is under the pointer; a window in the tray is held by its first.
      const tile = event.currentTarget.getBoundingClientRect();

      const grabbed = {
        column: Math.min(
          Math.floor(
            ((event.clientX - tile.left) / tile.width) * window.columns,
          ),
          window.columns - 1,
        ),
        row: Math.min(
          Math.floor(((event.clientY - tile.top) / tile.height) * window.rows),
          window.rows - 1,
        ),
      };

      event.preventDefault();
      setPointer({ x: event.clientX, y: event.clientY });
      setDrag({
        kind: "move",
        key: window.key,
        title: titleOf(window),
        grabbed: event.currentTarget.closest(traySelector)
          ? { column: 0, row: 0 }
          : grabbed,
      });
    };

  const startResize =
    (window: PlannedWindow, displayId: number) =>
    (event: React.PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setDrag({ kind: "resize", key: window.key, displayId });
    };

  return (
    <Div $flex={{ direction: "vertical", gap: "s" }} $flexChild>
      {displays.length === 0 && (
        <Span $color="textMuted">Finding the screens…</Span>
      )}

      <Div
        data-tiling-tray
        className={styles.tray}
        $padding={{ vertical: "xs", horizontal: "s" }}
        $border={{ color: "borderPrimary", width: "xxs", radius: "m" }}
      >
        <Span $color="textMuted" $font={{ size: "s" }}>
          Not tiled:
        </Span>

        {shown.untiled.length === 0 && (
          <Span $color="textMuted" $font={{ size: "s" }}>
            drop a window here to leave it out of tiling.
          </Span>
        )}

        {shown.untiled.map((window) => (
          <Div
            key={window.key}
            className={[
              styles.chip,
              drag?.key === window.key ? styles.dragging : "",
            ].join(" ")}
            $backgroundColor="backgroundSecondary"
            $border={{
              color: isNotOpen(window) ? "critical" : "borderPrimary",
              width: "xxs",
              radius: "s",
            }}
            $style={isNotOpen(window) ? { borderStyle: "dashed" } : undefined}
            $font={{ size: "s" }}
            onPointerDown={startMove(window)}
          >
            <WindowTitle window={window} />
            <RenameWindowButton window={window} />
            {window.missing
              ? " (not open)"
              : window.record.state.get() === "minimized"
                ? " (minimized)"
                : ""}
            {window.missing &&
              (model.isReopeningWindow(window) ? (
                <SpinnerIcon
                  $size="s"
                  $color="primary"
                  aria-label="Opening it again"
                />
              ) : (
                <ReopenWindowButton window={window} />
              ))}
            {model.isOutOfPlace(window) && (
              <Span $color="warning"> not saved</Span>
            )}
            <CloseWindowButton window={window} inline />
          </Div>
        ))}

        <PrimaryButton
          Icon={DashboardIcon}
          $style={{ marginLeft: "auto" }}
          $disabled={!canAutoTile}
          $tooltip={
            canAutoTile
              ? "Tile the windows not tiled too: each goes to the screen with the most room, in its first free cell, and is moved there."
              : "Nothing to tile: every open window is tiled already. Drag a window here to take it out of the tiling."
          }
          onClick={() => model.tilingPlan.autoTile()}
        >
          Tile all
        </PrimaryButton>
      </Div>

      <div
        ref={drawingRef}
        className={styles.drawing}
        style={wraps ? { minHeight: drawnWidth / aspectRatio } : undefined}
        hidden={displays.length === 0}
      >
        <div
          data-tiling-screens
          className={styles.screens}
          onPointerOver={(event) => {
            const id = (event.target as Element)
              .closest("[data-screen-id]")
              ?.getAttribute("data-screen-id");

            setHoveredScreen(id ? Number(id) : undefined);
          }}
          onPointerLeave={() => setHoveredScreen(undefined)}
          style={{ width: drawnWidth, height: drawnWidth / aspectRatio }}
        >
          {shown.screens.map((screen, index) => {
            const rect = rects.get(screen.display.id)!;

            return (
              <Div
                key={screen.display.id}
                data-screen-id={screen.display.id}
                className={styles.screen}
                $backgroundColor="backgroundPrimaryDimmed"
                $border={{
                  color: screen.missing ? "critical" : "borderPrimary",
                  width: "xxs",
                  radius: "m",
                }}
                $style={{
                  borderStyle: screen.missing ? "dashed" : undefined,
                  left: `calc(${rect.left}% + ${gap / 2}px)`,
                  top: `calc(${rect.top}% + ${gap / 2}px)`,
                  width: `calc(${rect.width}% - ${gap}px)`,
                  height: `calc(${rect.height}% - ${gap}px)`,
                }}
              >
                <ScreenBand
                  screen={screen}
                  index={index}
                  isHovered={hoveredScreen === screen.display.id}
                />

                {Array.from(
                  { length: screen.columns * screen.rows },
                  (_, cell) => {
                    const column = cell % screen.columns;
                    const row = Math.floor(cell / screen.columns);

                    const style = {
                      left: `${(column / screen.columns) * 100}%`,
                      top: `calc(${band}px + (100% - ${band}px) * ${row / screen.rows})`,
                      width: `${100 / screen.columns}%`,
                      height: `calc((100% - ${band}px) / ${screen.rows})`,
                    };

                    // An empty cell opens a new window in it, with a plus showing on hover.
                    const isEmpty = !screen.windows.some(
                      (it) =>
                        column >= it.column &&
                        column < it.column + it.columns &&
                        row >= it.row &&
                        row < it.row + it.rows,
                    );

                    return isEmpty &&
                      !screen.missing &&
                      !drag &&
                      model.canOpenPlaces.get() ? (
                      <Button
                        key={cell}
                        className={[styles.cell, styles.emptyCell].join(" ")}
                        style={style}
                        aria-label="Open a new window in this cell"
                        $dropDownMenu={dropDownMenu(newWindowMenuKind, {
                          data: { displayId: screen.display.id, column, row },
                          position: "bottom",
                        })}
                      >
                        <Span
                          className={styles.plus}
                          // Solid, so that what is behind it, as the empty screen's text, does not show through.
                          $backgroundColor="backgroundSecondary"
                          $tooltip="Open a cluster's page in a new window here"
                        >
                          <AddCircleOutlineIcon $size="l" $color="primary" />
                        </Span>
                      </Button>
                    ) : (
                      <div key={cell} className={styles.cell} style={style} />
                    );
                  },
                )}

                {screen.windows.length === 0 && (
                  <Div
                    $color="textMuted"
                    $font={{ size: "s" }}
                    $textAlign="center"
                    $style={{
                      position: "absolute",
                      pointerEvents: "none",
                      left: 0,
                      right: 0,
                      // In the middle of the screen's grid, below its band.
                      top: `calc(${band}px + (100% - ${band}px) / 2)`,
                      transform: "translateY(-50%)",
                    }}
                  >
                    No windows tiled yet
                  </Div>
                )}
              </Div>
            );
          })}

          {shown.screens.flatMap((screen) => {
            const rect = rects.get(screen.display.id)!;
            const gridTop = `${rect.top}% + ${gap / 2 + band}px`;
            const gridHeight = `(${rect.height}% - ${gap + band}px)`;
            const gridLeft = `${rect.left}% + ${gap / 2}px`;
            const gridWidth = `(${rect.width}% - ${gap}px)`;

            return screen.windows.map((window) => {
              return (
                <div
                  key={window.key}
                  data-screen-id={screen.display.id}
                  className={[
                    styles.tile,
                    drag?.key === window.key ? styles.dragging : "",
                  ].join(" ")}
                  style={{
                    left: `calc(${gridLeft} + ${gridWidth} * ${window.column / screen.columns})`,
                    top: `calc(${gridTop} + ${gridHeight} * ${window.row / screen.rows})`,
                    width: `calc(${gridWidth} * ${window.columns / screen.columns})`,
                    height: `calc(${gridHeight} * ${window.rows / screen.rows})`,
                  }}
                  onPointerDown={startMove(window)}
                >
                  <Div
                    className={styles.tileBody}
                    $backgroundColor="backgroundSecondary"
                    $border={{
                      color: isNotOpen(window)
                        ? "critical"
                        : model.isOutOfPlace(window, screen)
                          ? "warning"
                          : isApplicationWindow(window.record.window)
                            ? "primary"
                            : "borderPrimary",
                      width: "xxs",
                      radius: "s",
                    }}
                    $style={
                      isNotOpen(window) ? { borderStyle: "dashed" } : undefined
                    }
                    $font={{ size: "s" }}
                  >
                    {/* The name first; what is told of the window after it, on the next line where
                          it does not fit beside it. */}
                    <span className={styles.tileTitleLine}>
                      <span className={styles.tileName}>
                        <WindowTitle window={window} />
                        <RenameWindowButton window={window} onTile />
                      </span>
                      {window.missing &&
                        (model.reopening.get() ||
                        model.isReopeningWindow(window) ? (
                          <SpinnerIcon
                            $size="s"
                            $color="primary"
                            aria-label="Opening it again"
                          />
                        ) : (
                          <span className={styles.tileLabel}>
                            <Span $color="critical">not open</Span>
                            <ReopenWindowButton window={window} />
                          </span>
                        ))}
                      {model.isOutOfPlace(window, screen) && (
                        <Span className={styles.tileLabel} $color="warning">
                          not saved
                        </Span>
                      )}
                    </span>

                    <CloseWindowButton window={window} />

                    <div
                      className={styles.handle}
                      aria-label="Drag to span more or fewer cells"
                      onPointerDown={startResize(window, screen.display.id)}
                    />
                  </Div>
                </div>
              );
            });
          })}

          {shown.screens.map((screen, index) => {
            const rect = rects.get(screen.display.id)!;

            return (
              <div
                key={screen.display.id}
                data-screen-id={screen.display.id}
                className={styles.screenControls}
                style={{
                  left: `calc(${rect.left}% + ${gap / 2}px)`,
                  top: `calc(${rect.top}% + ${gap / 2}px)`,
                  width: `calc(${rect.width}% - ${gap}px)`,
                  height: `calc(${rect.height}% - ${gap}px)`,
                }}
              >
                <ScreenSteppers screen={screen} index={index} />
              </div>
            );
          })}
        </div>
      </div>

      {drag?.kind === "move" && pointer && (
        <Div
          className={styles.ghost}
          $backgroundColor="backgroundSecondary"
          $border={{ color: "primary", width: "xxs", radius: "s" }}
          $font={{ size: "s" }}
          $style={{ left: pointer.x, top: pointer.y }}
        >
          {drag.title}
        </Div>
      )}
    </Div>
  );
});

// The tiling row of the dialog: the editor, and the buttons to tile as it shows, start over, or
// keep it with the layout shown.
export const TileWindows = observer(() => {
  const model = useInject(windowLayoutsModelInjectable)();
  const layout = model.selectedLayout.get();

  return (
    <Div
      $flex={{ direction: "vertical", gap: "s" }}
      // Taking the height the dialog has left, for the screens to be drawn as large as it lets them.
      $flexChild
      $padding={{ vertical: "s", horizontal: "m" }}
      $border={{ color: "borderPrimary", width: "xxs", radius: "m" }}
    >
      <Div
        $flex={{ direction: "horizontal", gap: "m", verticalAlign: "center" }}
      >
        <Div $flex={{ direction: "vertical", gap: "xxs" }} $flexChild>
          <Span $font={{ bold: true }}>Tiling</Span>
          <Span $color="textMuted" $font={{ size: "s" }}>
            Drag windows to any cell of the screens; drag a window's corner to
            make it wider or taller. The windows follow as you change it.
          </Span>
        </Div>
      </Div>

      {model.canArrange.get() && <TilingEditor />}
    </Div>
  );
});
