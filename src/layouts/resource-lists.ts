import {
  clusterRolesNavigationTargetKind,
  configMapsNavigationTargetKind,
  cronJobsNavigationTargetKind,
  customResourceDefinitionsNavigationTargetKind,
  daemonSetsNavigationTargetKind,
  deploymentsNavigationTargetKind,
  horizontalPodAutoscalersNavigationTargetKind,
  ingressesNavigationTargetKind,
  jobsNavigationTargetKind,
  namespacesNavigationTargetKind,
  networkPoliciesNavigationTargetKind,
  nodesNavigationTargetKind,
  persistentVolumeClaimsNavigationTargetKind,
  persistentVolumesNavigationTargetKind,
  podsNavigationTargetKind,
  replicaSetsNavigationTargetKind,
  roleBindingsNavigationTargetKind,
  rolesNavigationTargetKind,
  secretsNavigationTargetKind,
  serviceAccountsNavigationTargetKind,
  servicesNavigationTargetKind,
  statefulSetsNavigationTargetKind,
  storageClassesNavigationTargetKind,
} from "@k8slens/kubernetes-resources-contracts";
import { clusterOverviewNavigationTargetKind } from "@k8slens/cluster-contracts";
import { placeOf } from "@k8slens/navigation-contracts";

// The pages of a cluster a window can be opened on: its overview, and the lists of its kube
// resources, in the order Lens's navigator has them, with the kind each lists, the overview none.
// Each takes the cluster alone.
const lists = [
  ["Overview", clusterOverviewNavigationTargetKind, undefined],
  ["Pods", podsNavigationTargetKind, "Pod"],
  ["Deployments", deploymentsNavigationTargetKind, "Deployment"],
  ["Daemon Sets", daemonSetsNavigationTargetKind, "DaemonSet"],
  ["Stateful Sets", statefulSetsNavigationTargetKind, "StatefulSet"],
  ["Replica Sets", replicaSetsNavigationTargetKind, "ReplicaSet"],
  ["Jobs", jobsNavigationTargetKind, "Job"],
  ["Cron Jobs", cronJobsNavigationTargetKind, "CronJob"],
  ["Config Maps", configMapsNavigationTargetKind, "ConfigMap"],
  ["Secrets", secretsNavigationTargetKind, "Secret"],
  [
    "Horizontal Pod Autoscalers",
    horizontalPodAutoscalersNavigationTargetKind,
    "HorizontalPodAutoscaler",
  ],
  ["Services", servicesNavigationTargetKind, "Service"],
  ["Ingresses", ingressesNavigationTargetKind, "Ingress"],
  ["Network Policies", networkPoliciesNavigationTargetKind, "NetworkPolicy"],
  [
    "Persistent Volume Claims",
    persistentVolumeClaimsNavigationTargetKind,
    "PersistentVolumeClaim",
  ],
  [
    "Persistent Volumes",
    persistentVolumesNavigationTargetKind,
    "PersistentVolume",
  ],
  ["Storage Classes", storageClassesNavigationTargetKind, "StorageClass"],
  ["Nodes", nodesNavigationTargetKind, "Node"],
  ["Namespaces", namespacesNavigationTargetKind, "Namespace"],
  ["Service Accounts", serviceAccountsNavigationTargetKind, "ServiceAccount"],
  ["Roles", rolesNavigationTargetKind, "Role"],
  ["Role Bindings", roleBindingsNavigationTargetKind, "RoleBinding"],
  ["Cluster Roles", clusterRolesNavigationTargetKind, "ClusterRole"],
  [
    "Custom Resource Definitions",
    customResourceDefinitionsNavigationTargetKind,
    "CustomResourceDefinition",
  ],
] as const;

export interface ResourceList {
  readonly label: string;
  // The kind as Kubernetes names it, "Pod" say; none for the overview.
  readonly kind: string | undefined;
  readonly placeFor: (clusterId: string) => ReturnType<typeof placeOf>;
}

export const resourceLists: readonly ResourceList[] = lists.map(
  ([label, target, kind]) => ({
    label,
    kind,
    placeFor: (clusterId: string) =>
      placeOf(target as typeof podsNavigationTargetKind, { clusterId }),
  }),
);
