# Changelog

What changed in each version of this extension, newest first.

## Unreleased

- Rows and columns can always be added to a screen's tiling, also past eight: a screen whose windows needed more than eight rows had both its row buttons disabled.
- Needs a Lens whose window layouts tell what a closed window was and which window they opened again (@k8slens/window-layout-contracts 1.1).
- Windows are no longer described ahead of time, as they change: a closed window is opened again as Lens described it as it closed, asked for only when it is opened again or saved. Windows closed before this version still open again as the extension last described them.
- A window opened again, from its tile or by Recall, is the window Lens answers with, so several opened at once each land in their own tile, even when other windows show meanwhile; a window Lens cannot open again stays shown as not open.
- Opening a window again from its tile moves no other window, and brings it back as the layout saved it while its tile is where the layout tiled it, so it is not marked "not saved".
- Recall puts a window it opens again straight in its tile also when the tile goes by a window that was opened again before, rather than showing it under Not tiled for a moment.
- A window opened in a cell is that cell's window, the one Lens says it opened the place in, rather than a guess, from the moment Lens lists it, before it shows; it can be opened again from its tile once closed, and a cell whose opening fails is left empty. A tile left over from a window being opened as the extension was reloaded goes.
- Windows you open while others are being opened in a cell, again from a tile, or by Recall show under Not tiled at once, rather than once those have opened.
- Closing a window from its tile takes its tile away at once, and renaming or closing one no longer needs Lens's list of windows followed all along.
- Rebuilding, disabling or uninstalling the extension stops everything it had running.
- A window not open when a layout was shown is that tile's window once it is open again under its own id, as after a restart; saving no longer keeps such a window twice, and a layout saved so shows each window once.
- A window opened again is that window still for every layout that saved it, whichever layout opened it again.
- A window not open shows "not saved" too when its tile is not where the layout's tiling has it, moved, resized or tiled or not unlike then, or when the layout does not have it, as one opened after saving and closed since; saving keeps it in the layout as its tile is.
- A window filling its screen's work area, which Lens tells maximized, is not marked "not saved" against a layout that saved it so as a normal window.
- A window opened since the layout was saved is marked "not saved" until saved, as it is not in the layout; Save is enabled whenever a window is not saved or the tiling changed.
- Saving a layout keeps its windows not open at the time, with their tiles, rather than dropping them; only the × takes a window out of a layout.
- Windows open where they belong from their first frame, rather than being moved there once they show: opened in a cell, opened again from a tile, or by Recall.
- Recall a layout from its row in the list, with the button shown at the row's right end as you point at it; long names are shortened there.
- A window opened since the tiling was arranged shows under Not tiled, until put on a screen, rather than in a cell of a screen.
- "Not saved" (formerly "out of place") means the window differs from what the layout saved of it, where it is or how it shows, also for a window opened again under another id. Recalling a layout that opens windows again no longer tiles the others away from where it puts them.
- Renamed from @k8slens/window-manager to @k8slens/window-layouts. Layouts saved under the old name do not carry over.
- Select a layout to see its tiling; its Recall, Save and Delete show only while it is selected.
- New layouts are made with + and named "Layout 1", "Layout 2" and so on; rename a layout by clicking its name.
- Duplicate the selected layout, its tiling with it, with the copy button beside +.
- New layouts start with every window not tiled; Tile all places them on the screens.
- Open the Preferences, or a cluster's overview or resource list, in a new window right in an empty cell of the tiling; clusters show their icons and colours, the connected ones first, and each page the icon of its kind. A cluster's pages open beside its row, scrolling, with a search of their own.
- Close a window, or take a missing one out of the layout, with the × on its tile.
- Rename a window with the pen beside its ×, as a layout is renamed; Lens keeps the name.
- Open a window that is not open again from its tile, as it was, where its tile is; Lens keeps how for windows closed in the last 180 days.
- Layouts and tiling saved by earlier versions are not read: Lens now describes every window it can open again, Preferences included, and older layouts lack that.
- Untile a screen, its windows back to Not tiled, with the button in its top-right corner, shown while the pointer is over the screen.
- A screen connected again under a new id, as macOS gives one, is no longer shown twice, once as missing.
- Releasing a drag that moved nothing no longer tiles the windows again.
- The windows follow every change to the tiling; there is no Tile button any more.
- A layout's tiling shows screens not connected and windows not open, outlined in red, and leaves them untiled.
- Arrange the tiling by dragging: which screen and cell each window goes in, and how many cells it spans; set each screen's columns and rows with the pills on its edges. Screens too many for the dialog's width wrap onto rows.
- Gathering the sub-windows onto one screen is gone; drag them onto that screen instead.
- Layouts keep their tiling setup: saving saves it, recalling makes it the current one.

## 0.1.0

- Recalling a layout opens again the windows closed since it was saved.
- Save the arrangement of Lens's windows as a named layout, and recall it from the status bar or the command palette.
- Rename saved layouts.
- Gather all sub-windows onto a chosen screen, from the dialog or, with two screens, the command palette.
- Layouts remember their screens; recalling one puts windows from a screen that is no longer connected onto the primary screen.
- Delete saved layouts.
- Tile the windows to fit the screen, from the dialog or the command palette.
