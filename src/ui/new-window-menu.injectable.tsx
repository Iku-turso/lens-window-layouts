import { Div, Img, Span, useFocusableItem } from "@k8slens/element-components";
import {
  type IconProps,
  KubeResourceKindIcon,
  KubernetesTillerCrestIcon,
} from "@k8slens/icon";
import {
  DefaultDropDownMenuContainer,
  dropDownMenu,
  dropDownMenuContainerComponentInjectionToken,
  type DropDownMenuContainerProps,
  getDropDownMenuItemInjectableBunch,
  getDropDownMenuItemsInjectableBunch,
  getDropDownMenuKind,
  useCloseDropDownMenu,
} from "@k8slens/drop-down-menu-contracts";
import {
  DropDownMenuItemRow,
  DropDownMenuSubMenu,
} from "@k8slens/drop-down-menu-items";
import { SearchInput } from "@k8slens/input-components";
import { getInjectable2 } from "@k8slens/injectable";
import { useInject } from "@k8slens/use-inject";
import { computed } from "mobx";
import { placeOf } from "@k8slens/navigation-contracts";
import { preferencesNavigationTargetKind } from "@k8slens/preferences-contracts";
import { observer } from "mobx-react";
import { useEffect, useMemo } from "react";
import { resourceLists, type ResourceList } from "../layouts/resource-lists";
import {
  type Cell,
  windowLayoutsModelInjectable,
} from "./window-layouts-model.injectable";

// Opened from an empty cell: the clusters, each opening its lists, to open one in a new window there.
export const newWindowMenuKind = getDropDownMenuKind<Cell>()(
  "window-manager-new-window-menu",
);

type ClusterCell = Cell & {
  readonly clusterId: string;
  readonly clusterName: string;
};

// A cluster's lists of kube resources, opened beside the cluster in the menu above.
export const resourceListMenuKind = getDropDownMenuKind<ClusterCell>()(
  "window-manager-resource-list-menu",
);

// What a menu is for, as a heading no row of which can be picked.
// Its width is the menu's least, so that the names in it fit on a line.
const Heading = ({ text }: { text: string }) => (
  <DropDownMenuItemRow
    $color="textMuted"
    $enabled={false}
    $font={{ size: "s" }}
    $style={{ minWidth: 300 }}
  >
    {text}
  </DropDownMenuItemRow>
);

const NewWindowHeading = () => (
  <Heading text="Open a page in a new window here" />
);

// A search of a menu, an item of the menu of its own, so that each row it narrows is pointed at and
// arrowed to as any row of a menu is.
const MenuSearch = ({
  value,
  onChange,
  placeholder,
  width,
  autoFocus = false,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  width: number;
  // Taking the focus as it shows, for a menu opened by clicking; one opened by hovering leaves the
  // focus where it is, taking it when arrowed into.
  autoFocus?: boolean;
}) => {
  const focusable = useFocusableItem();

  return (
    <Div
      // The search is the menu's first item that can be used: the menu focuses it as it opens, and
      // leaves the focus there as the rows below it come and go.
      $focusable={focusable}
      // Focused as the menu's item, it hands the focus to its search box.
      onFocus={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.querySelector("input")?.focus();
        }
      }}
      $padding={{ horizontal: "xs", vertical: "xxs" }}
      $style={{ width }}
      // Typing is the search's alone: the menu would take keys to move between its rows, and the
      // focus with them, after every character. Escape and the arrows up and down still reach it.
      onKeyDown={(event) => {
        if (!["Escape", "ArrowUp", "ArrowDown", "Tab"].includes(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      <SearchInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </Div>
  );
};

// Finds clusters, and Lens's own pages, by name.
const ClusterSearch = observer(() => {
  const model = useInject(windowLayoutsModelInjectable)();

  // A menu opened anew searches anew.
  useEffect(() => model.setClusterSearch(""), []);

  return (
    <MenuSearch
      value={model.clusterSearch.get()}
      onChange={(text) => model.setClusterSearch(text)}
      placeholder="Search clusters and pages"
      width={420}
      autoFocus
    />
  );
});

// Finds a cluster's pages by name.
const PageSearch = observer(() => {
  const model = useInject(windowLayoutsModelInjectable)();

  // A cluster's pages opened anew are searched anew.
  useEffect(() => model.setPageSearch(""), []);

  return (
    <MenuSearch
      value={model.pageSearch.get()}
      onChange={(text) => model.setPageSearch(text)}
      placeholder="Search pages"
      width={280}
    />
  );
});

// Shown only while no page matches the search.
const NoPages = observer(() => {
  const model = useInject(windowLayoutsModelInjectable)();

  return resourceLists.some((list) =>
    isMatch(list.label, model.pageSearch.get()),
  ) ? null : (
    <DropDownMenuItemRow $color="textMuted" $enabled={false}>
      No page matches
    </DropDownMenuItemRow>
  );
});

// Whether the cluster's name has what is searched for in it.
const isMatch = (name: string, search: string) =>
  name.toLowerCase().includes(search.trim().toLowerCase());

// Shown only while no cluster is.
const NoClusters = observer(() => {
  const model = useInject(windowLayoutsModelInjectable)();
  const clusters = model.clusters.get();
  const search = model.clusterSearch.get();

  if (clusters.some((cluster) => isMatch(cluster.name.get(), search))) {
    return null;
  }

  return (
    <DropDownMenuItemRow $color="textMuted" $enabled={false}>
      {clusters.length === 0 ? "No clusters" : "No cluster matches"}
    </DropDownMenuItemRow>
  );
});

interface ClusterLooks {
  readonly isConnected: boolean;
  // The colour the user tells the cluster apart by; empty when they turned colours off.
  readonly color: string;
  // The image the user gave the cluster, if any.
  readonly icon: string | undefined;
}

// The cluster as Lens shows it: its image, or else the Kubernetes crest in its colour.
const ClusterAvatar = ({
  color,
  icon,
}: Pick<ClusterLooks, "color" | "icon">) =>
  icon ? (
    <Img
      src={icon}
      alt=""
      $style={{
        width: 20,
        height: 20,
        borderRadius: 4,
        objectFit: "cover",
        flexShrink: 0,
      }}
    />
  ) : (
    <KubernetesTillerCrestIcon
      $size="m"
      $style={color ? { color } : undefined}
    />
  );

// Lens is connected to the cluster.
const ConnectedDot = () => (
  <Span
    role="img"
    aria-label="Connected"
    $backgroundColor="success"
    // At the far end of the row, by its chevron.
    $style={{
      width: 8,
      height: 8,
      borderRadius: "50%",
      display: "inline-block",
      flexShrink: 0,
      marginLeft: "auto",
    }}
  />
);

// A cluster, shown while its name matches the search: hidden rather than taken out of the menu, as
// the menu focuses its first row whenever its rows change, which would take the focus from the search.
const ClusterRow = observer(
  ({
    data,
    clusterId,
    clusterName,
    looks,
  }: {
    data: Cell;
    clusterId: string;
    clusterName: string;
    looks: ClusterLooks;
  }) => {
    const model = useInject(windowLayoutsModelInjectable)();

    if (!isMatch(clusterName, model.clusterSearch.get())) {
      return null;
    }

    return (
      <DropDownMenuSubMenu
        // Its pages open beside the whole row, at the menu's edge, level with the row.
        $style={{ alignSelf: "stretch", boxSizing: "border-box" }}
        menu={dropDownMenu(resourceListMenuKind, {
          data: { ...data, clusterId, clusterName },
          position: "right span-bottom",
        })}
        trailing={looks.isConnected ? <ConnectedDot /> : undefined}
      >
        <ClusterAvatar color={looks.color} icon={looks.icon} />
        {clusterName}
      </DropDownMenuSubMenu>
    );
  },
);

// Pages of Lens not of a cluster, after the clusters: the search stays the first item, focused as
// the menu opens, and narrows these too.
const lensPages = [
  {
    label: "Preferences",
    place: () => placeOf(preferencesNavigationTargetKind, {}),
  },
] as const;

const LensPagesHeading = observer(() => {
  const model = useInject(windowLayoutsModelInjectable)();

  return lensPages.some((page) =>
    isMatch(page.label, model.clusterSearch.get()),
  ) ? (
    <Heading text="Lens" />
  ) : null;
});

const LensPageRow = observer(
  ({ data, page }: { data: Cell; page: (typeof lensPages)[number] }) => {
    const model = useInject(windowLayoutsModelInjectable)();
    const closeDropDownMenu = useCloseDropDownMenu();

    if (!isMatch(page.label, model.clusterSearch.get())) {
      return null;
    }

    return (
      <DropDownMenuItemRow
        $onClick={() => {
          closeDropDownMenu();
          void model.openInCell(page.place(), data, page.label);
        }}
      >
        {page.label}
      </DropDownMenuItemRow>
    );
  },
);

export const lensPagesItemsBunch = getDropDownMenuItemsInjectableBunch({
  id: "window-manager-new-window-lens-pages",
  kind: newWindowMenuKind,

  instantiate: () => () => [
    {
      id: "window-manager-new-window-lens-pages-heading",
      orderNumber: 10_000,
      Component: LensPagesHeading,
    },
    ...lensPages.map((page, index) => ({
      id: `window-manager-new-window-lens-page-${index}`,
      orderNumber: 10_001 + index,
      Component: LensPageRow,
      componentProps: { page },
    })),
  ],
});

export const clusterItemsBunch = getDropDownMenuItemsInjectableBunch({
  id: "window-manager-new-window-clusters",
  kind: newWindowMenuKind,

  instantiate: (di) => {
    const model = di.inject(windowLayoutsModelInjectable)();

    return () =>
      computed(() => {
        // Every cluster, whatever is searched for: the rows hide themselves.
        const clusters = model.clusters
          .get()
          .map((cluster) => ({
            id: cluster.id,
            name: cluster.name.get(),
            looks: {
              isConnected: cluster.isConnected.get(),
              color: cluster.color.get(),
              icon: cluster.icon.get(),
            },
          }))
          // Those connected first, as the likeliest to be opened.
          .sort(
            (a, b) =>
              Number(b.looks.isConnected) - Number(a.looks.isConnected) ||
              a.name.localeCompare(b.name),
          );

        return [
          {
            id: "window-manager-new-window-no-clusters",
            orderNumber: 2,
            Component: NoClusters,
          },
          ...clusters.map((cluster, index) => ({
            id: `window-manager-new-window-cluster-${cluster.id}`,
            orderNumber: 10 + index,
            Component: ClusterRow,
            componentProps: {
              clusterId: cluster.id,
              clusterName: cluster.name,
              looks: cluster.looks,
            },
          })),
        ];
      });
  },
});

// The heading and the search, items of their own that stay as they are while the clusters below
// them follow what is typed: rebuilt with them, the search would lose the focus at each key.
export const newWindowHeadingBunch = getDropDownMenuItemInjectableBunch({
  id: "window-manager-new-window-heading",
  kind: newWindowMenuKind,
  orderNumber: 0,
  Component: NewWindowHeading,
});

export const clusterSearchBunch = getDropDownMenuItemInjectableBunch({
  id: "window-manager-new-window-search",
  kind: newWindowMenuKind,
  orderNumber: 1,
  Component: ClusterSearch,
});

const ResourceListsHeading = ({ data }: { data: ClusterCell }) => (
  <Heading text={`Pages of ${data.clusterName}`} />
);

// Each list with its kind's icon, made once so that the rows keep the same component.
const iconsOfLists = new Map(
  resourceLists.map((list) => [
    list,
    list.kind
      ? // The row names the kind already: no tooltip to say it again.
        (props: IconProps) => (
          <KubeResourceKindIcon
            kind={list.kind!}
            {...props}
            $tooltip={undefined}
          />
        )
      : undefined,
  ]),
);

const ResourceListRow = observer(
  ({ data, list }: { data: ClusterCell; list: ResourceList }) => {
    const model = useInject(windowLayoutsModelInjectable)();
    const closeDropDownMenu = useCloseDropDownMenu();
    const cluster = model.clusters.get().find((it) => it.id === data.clusterId);
    const color = cluster?.color.get() ?? "";
    const icon = cluster?.icon.get();

    // Hidden rather than taken out of the menu while it does not match the search, which would take
    // the focus from the search.
    const matches = isMatch(list.label, model.pageSearch.get());

    // The overview, of no kind, shows the cluster as the menu before showed it.
    const ClusterIcon = useMemo(
      () => () => <ClusterAvatar color={color} icon={icon} />,
      [color, icon],
    );

    if (!matches) {
      return null;
    }

    return (
      <DropDownMenuItemRow
        Icon={iconsOfLists.get(list) ?? ClusterIcon}
        $onClick={() => {
          closeDropDownMenu();
          // Named as Lens names such a window, until it shows and names itself.
          void model.openInCell(
            list.placeFor(data.clusterId),
            data,
            `${list.label} - ${data.clusterName}`,
          );
        }}
      >
        {list.label}
      </DropDownMenuItemRow>
    );
  },
);

export const resourceListItemsBunch = getDropDownMenuItemsInjectableBunch({
  id: "window-manager-new-window-resource-lists",
  kind: resourceListMenuKind,

  instantiate: () => () => [
    {
      id: "window-manager-new-window-resource-lists-heading",
      orderNumber: 0,
      Component: ResourceListsHeading,
    },
    {
      id: "window-manager-new-window-resource-lists-search",
      orderNumber: 1,
      Component: PageSearch,
    },
    {
      id: "window-manager-new-window-resource-lists-none",
      orderNumber: 2,
      Component: NoPages,
    },
    ...resourceLists.map((list, index) => ({
      id: `window-manager-new-window-resource-list-${index}`,
      orderNumber: 10 + index,
      Component: ResourceListRow,
      componentProps: { list },
    })),
  ],
});

// A cluster's pages are more than a window can be tall, and a menu taller than the room beside its
// row is placed wherever it fits instead. Lens's own panel, half the window tall and scrolling,
// always fits beside the row, below it or above.
const ResourceListMenuContainer = ({
  children,
  items: _items,
  ...menuProps
}: DropDownMenuContainerProps) => (
  <DefaultDropDownMenuContainer
    {...menuProps}
    // Of the one height as its search hides pages: opened upwards, from its row's bottom, a panel
    // growing shorter would move its search out from under the pointer, and close. Scrolling up and
    // down only: what reaches past the panel's sides, as the strip that keeps a pointer crossing the
    // gap to it on it, is no reason to scroll sideways.
    $style={{
      height: "50vh",
      boxSizing: "border-box",
      overflowY: "auto",
      overflowX: "hidden",
    }}
  >
    {children}
  </DefaultDropDownMenuContainer>
);

export const resourceListMenuContainerInjectable = getInjectable2({
  id: "window-manager-resource-list-menu-container",
  instantiate: () => () => ResourceListMenuContainer,
  injectionToken:
    dropDownMenuContainerComponentInjectionToken.for(resourceListMenuKind),
});
