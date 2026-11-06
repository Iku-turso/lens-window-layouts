# @k8slens/window-layouts

Save how the windows of Lens are arranged under a name, such as "Debugging" or "Two screens", and recall it whenever you like. A layout remembers where every window of Lens sits, the application window and every window opened from it, and whether it is maximized, minimized or full screen. Recalling a layout puts every window back where it was, opening again the ones closed since.

## Features

- Save the current arrangement of all Lens windows as a new layout with **+**. It is named "Layout 1", "Layout 2" and so on; click its name to rename it.
- Recall a layout in one click. Its windows go back to their places and states and come to the front, the one that had focus on top with focus again. Windows that were minimized stay minimized.
- A window that was closed since the layout was saved, even by restarting Lens, is opened again, doing what it did, in its place. A window you opened again yourself, doing the same thing, is moved instead of opening another. A window that can't be opened again, such as one whose extension is gone or one Lens cannot open afresh, stays closed: the dialog tells you which ones it couldn't open, and the tiling shows them as not open. Layouts saved before this version can't open closed windows; save them again.
- Arrange how the windows are tiled, by dragging. The dialog draws your screens as they lie, each as a grid with the window tiles on it. Drag a window to any cell of any screen; a window it lands on moves to the first free cell. Drag a window's corner to make it span more cells, wider or taller. Set each screen's columns and rows with − and +. Drop a window in **Not tiled**, above the screens, to keep it out of tiling; minimized windows start there. A screen with no windows on it gets none. The arrangement is kept across restarts; **Tile all**, in **Not tiled**, places the windows not tiled on the screens with the most room, in their first free cells. Every change to the arrangement tiles the windows so. Tiling shows a maximized, minimized or full-screen window normally again to place it, and brings every tiled window to the front, the one you were in staying focused.
- Layouts remember which screens they were saved on. If a window's saved place is on a screen that is no longer connected, such as an unplugged monitor, recalling the layout puts that window on the primary screen instead, and the dialog says so.
- Open a new window into an empty cell: hover the cell for a plus, click it, find a cluster by name in the list and pick one of its pages: its overview, or a list such as Pods or Deployments; or pick the Preferences, under Lens at the bottom of the menu. The page opens in a window of its own, placed over the cell and tiled there. This needs Lens Studio. The clusters show their icons in their own colours, those Lens is connected to first, marked with a green dot; type to narrow them by name.
- Close a window from its tile: the × at its top right closes the window and takes it out of the layout's tiling; for a window not open, it only takes it out. Save keeps the change in the layout.
- A layout's tiling still shows what is gone: a screen it uses that is not connected is drawn with its windows, outlined in red as not connected, and a window of it that is not open shows in its cell, outlined in red as not open. Neither is tiled; drag such a window onto a connected screen, or out of the way. The layout list says how many of a layout's screens are missing.
- The dialog lists the layouts on the left, a long name shortened. Recall one with the button at the right end of its row, shown as you point at the row. Select one by clicking it: the right side shows it with its **Recall**, **Save** and **Delete** buttons, and its tiling setup below them.
- A layout keeps the tiling setup too. Saving a layout saves the setup as it is in the tiling below; selecting or recalling it makes its setup the current one, so **Tile** tiles the layout's way. Selecting or recalling a layout saved before layouts kept a setup keeps the current setup.
- Duplicate the selected layout with the copy button beside **+**: the copy, named "<name> copy", has its windows and its tiling, and its name is ready to be typed over.
- Rename a layout by clicking its name.
- Rename a window with the pen beside the × on its tile or chip: Enter or clicking away keeps the name, Escape the old one. Lens keeps the name, whatever the window shows.
- A window marked "not saved" differs from what the layout saved of it: it is not where it was, not shown as it was, or not in the layout at all, as a window opened since, even once closed again: such a window shows both "not open" and "not saved". Save makes them agree again; Recall puts back the windows the layout has.
- A window opened since the tiling was arranged shows under Not tiled until you drag it onto a screen.
- A window that is not open shows outlined in red; open it again with the button beside "not open", as it was, where its tile is. Enter or clicking away keeps the new name, Escape the old one. Renaming never replaces another layout: a name that is taken is refused.
- Delete layouts you no longer need. Layouts are kept across restarts of Lens.

Arranging windows needs Lens Studio. Without it, the extension tells you that layouts can't be recalled.

## Install

[Open @k8slens/window-layouts in Lens](https://app.k8slens.dev/lens-launcher?c=lens%3A%2F%2Fapp%2Fopen%2Fextension%3Fname%3D@k8slens/window-layouts) and click Install there. The link offers Lens for download when it is not installed yet.

## Usage

- Click **Layouts** on the right of the status bar, or run **Window Layouts: Save or recall a layout** from the command palette.
- To save a new layout: click **+** next to **Layouts**.
- To save over a layout: select it, then click its **Save**. It saves where the windows are now and the tiling below.
- To recall: point at a layout in the list, then click the recall button at the right end of its row.
- To recall from the hotbar: select a layout and click the pin beside its name. The layout shows in the hotbar by its initials; click it to recall the layout, or click the pin again, or right-click the item and choose "Remove from hotbar", to take it off.
- To rename: select a layout, click its name, type the new name and press Enter.
- To delete: select a layout, then click **Delete**.
- To tile: arrange the windows under **Tiling** in the dialog. They follow every change you make there, a moment after it. **Window Layouts: Tile windows** in the command palette tiles them as arranged too.

What changed in each version is in [CHANGELOG.md](./CHANGELOG.md).
