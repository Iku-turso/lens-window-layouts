import { ClickableDiv, Div, Span } from "@k8slens/element-components";
import type { LayoutPreview as Preview } from "../layouts/layout-preview";

// The most room the screens are drawn in, together; the space between them, and above them for
// their names.
const maxWidth = 520;
const maxHeight = 260;
const gap = 6;
const labelHeight = 18;
// The least height of a window's box that shows its title.
const minTitleHeight = 16;

// What the dialog tells of a screen not connected.
const missingNote = "not connected; its windows are not tiled";

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

// The tiling a layout saved, drawn small: the screens side by side as they lie, each in its shape,
// its windows in their cells.
export const LayoutPreview = ({
  preview,
  onWindowClick,
}: {
  preview: Preview;
  // Told of a window clicked, by its place in the layout's windows.
  onWindowClick?: (index: number, title: string) => void;
}) => {
  const { screens } = preview;
  // Named when there is more than one, or one is not connected, to tell so.
  const withLabels =
    screens.length > 1 || screens.some((screen) => screen.missing);
  const left = Math.min(...screens.map((it) => it.area.x));
  const top = Math.min(...screens.map((it) => it.area.y));
  const right = Math.max(...screens.map((it) => it.area.x + it.area.width));
  const bottom = Math.max(...screens.map((it) => it.area.y + it.area.height));
  const scale = Math.min(maxWidth / (right - left), maxHeight / (bottom - top));

  return (
    <Div $flex={{ direction: "vertical", gap: "s" }}>
      {screens.length > 0 && (
        <Div
          $style={{
            position: "relative",
            width: (right - left) * scale,
            height: (bottom - top) * scale + (withLabels ? labelHeight : 0),
          }}
        >
          {screens.map((screen) => (
            <Div
              key={screen.id}
              $style={{
                position: "absolute",
                left: (screen.area.x - left) * scale + gap / 2,
                top: (screen.area.y - top) * scale + gap / 2,
                width: screen.area.width * scale - gap,
              }}
            >
              {withLabels && (
                <Span
                  $color="textMuted"
                  $font={{ size: "xs" }}
                  $tooltip={
                    screen.missing
                      ? `${screen.label ?? "A screen"} · ${missingNote}`
                      : screen.label
                  }
                  $style={{
                    display: "block",
                    height: labelHeight,
                    lineHeight: `${labelHeight}px`,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {/* As the dialog names a screen: the name in the text's own colour, a screen
                      not connected told so after it in the critical one. */}
                  <Span $color="textDefault">{screen.label ?? "A screen"}</Span>
                  {screen.missing && (
                    <Span $color="critical"> · {missingNote}</Span>
                  )}
                </Span>
              )}
              <Div
                $backgroundColor="backgroundPrimaryDimmed"
                // Framed as the dialog frames a screen: one not connected dashed in the critical
                // colour.
                $border={{
                  color: screen.missing ? "critical" : "borderPrimary",
                  width: "xxs",
                  radius: "s",
                }}
                $style={{
                  position: "relative",
                  height: screen.area.height * scale - gap,
                  ...(screen.missing ? { borderStyle: "dashed" } : {}),
                }}
              >
                {screen.windows.map((window) => (
                  <ClickableDiv
                    key={window.index}
                    // Brought to the front, opened again first when not open.
                    $onClick={
                      onWindowClick &&
                      (() => onWindowClick(window.index, window.title))
                    }
                    role="button"
                    aria-label={
                      window.isOpen
                        ? `Bring ${window.title} to the front`
                        : `Open ${window.title} again`
                    }
                    $backgroundColor="backgroundSecondary"
                    // Outlined as the dialog outlines its tile: the main window in the primary
                    // colour, a window not open dashed in the critical one, a window not where or
                    // as saved in the warning one.
                    $border={{
                      color: !window.isOpen
                        ? "critical"
                        : !window.isSaved
                          ? "warning"
                          : window.isApplicationWindow
                            ? "primary"
                            : "borderPrimary",
                      width: "xxs",
                      radius: "s",
                    }}
                    $font={{ size: "xs" }}
                    $tooltip={
                      !window.isOpen
                        ? `${window.title}: not open; click to open it again`
                        : `${window.title}: click to bring it to the front`
                    }
                    $style={{
                      position: "absolute",
                      boxSizing: "border-box",
                      left: `calc(${(window.column / screen.columns) * 100}% + 3px)`,
                      top: `calc(${(window.row / screen.rows) * 100}% + 3px)`,
                      width: `calc(${(window.columns / screen.columns) * 100}% - 6px)`,
                      height: `calc(${(window.rows / screen.rows) * 100}% - 6px)`,
                      padding: "0 6px",
                      cursor: onWindowClick ? "pointer" : undefined,
                      ...(window.isOpen ? {} : { borderStyle: "dashed" }),
                      display: "flex",
                      alignItems: "center",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {/* Its title where there is room for a line of it; its tooltip tells it anyway. */}
                    {((screen.area.height * scale - gap) * window.rows) /
                      screen.rows -
                      6 >=
                      minTitleHeight && (
                      <>
                        <Span
                          $style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {window.title}
                        </Span>
                        {/* Told as the dialog tells it, after the name. */}
                        {!window.isOpen && (
                          <Span
                            $color="critical"
                            $style={{ flexShrink: 0, marginLeft: 6 }}
                          >
                            not open
                          </Span>
                        )}
                      </>
                    )}
                  </ClickableDiv>
                ))}
              </Div>
            </Div>
          ))}
        </Div>
      )}

      {preview.screens.length === 0 && (
        <Span $color="textMuted" $font={{ size: "s" }}>
          No tiling saved with this layout.
        </Span>
      )}

      {(preview.notOpen > 0 || preview.untiled.length > 0) && (
        <Span $color="textMuted" $font={{ size: "xs" }}>
          {[
            // In the colour the dialog tells a window not open in.
            ...(preview.notOpen > 0
              ? [
                  <Span key="not-open" $color="critical">
                    {plural(preview.notOpen, "window")} not open
                  </Span>,
                ]
              : []),
            ...(preview.untiled.length > 0
              ? [
                  <Span key="not-tiled">
                    {plural(preview.untiled.length, "window")} not tiled
                  </Span>,
                ]
              : []),
          ].flatMap((it, index) => (index === 0 ? [it] : [" · ", it]))}
        </Span>
      )}
    </Div>
  );
};
