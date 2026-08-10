#!/usr/bin/env bash
set -euo pipefail

readonly profile="minikube"
readonly max_fraction=80
readonly kino_namespaces='["default","mongodb-system","postgres-system","redis-stack-system","kafka-system","rabbitmq-system","prometheus-system","grafana-system"]'

for command in docker kubectl jq numfmt awk; do
  command -v "$command" >/dev/null || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

docker inspect "$profile" >/dev/null 2>&1 || {
  echo "The Docker-backed minikube profile is not running." >&2
  exit 1
}

read -r nano_cpus memory_limit memory_swap < <(
  docker inspect --format '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}}' "$profile"
)

if (( nano_cpus < 6000000000 || memory_limit < 15032385536 )); then
  echo "Minikube must have at least 6 CPUs and 14 GiB memory; found ${nano_cpus}ns / ${memory_limit} bytes." >&2
  exit 1
fi
if (( memory_limit == 0 || memory_limit != memory_swap )); then
  echo "Minikube swap is not disabled (memory=${memory_limit}, memorySwap=${memory_swap})." >&2
  exit 1
fi

quantity_bytes() {
  local value="${1%i}"
  numfmt --from=iec "$value"
}

quantity_millicpu() {
  local value="$1"
  if [[ "$value" == *m ]]; then
    printf '%s\n' "${value%m}"
  else
    awk -v value="$value" 'BEGIN { printf "%.0f\n", value * 1000 }'
  fi
}

node_json=$(kubectl --context "$profile" get nodes -o json)
allocatable_memory=$(jq -r '.items[0].status.allocatable.memory' <<<"$node_json")
allocatable_cpu=$(jq -r '.items[0].status.allocatable.cpu' <<<"$node_json")
allocatable_memory_bytes=$(quantity_bytes "$allocatable_memory")
allocatable_cpu_millicpu=$(quantity_millicpu "$allocatable_cpu")

pods_json=$(kubectl --context "$profile" get pods --all-namespaces -o json)

missing_resources=$(jq -r --argjson namespaces "$kino_namespaces" '
  .items[]
  | select(.metadata.namespace as $namespace | $namespaces | index($namespace))
  | . as $pod
  | ((.spec.initContainers // []) + (.spec.containers // []))[]
  | select(
      (.resources.requests.cpu? // "") == ""
      or (.resources.requests.memory? // "") == ""
      or (.resources.limits.cpu? // "") == ""
      or (.resources.limits.memory? // "") == ""
    )
  | "\($pod.metadata.namespace)/\($pod.metadata.name): \(.name)"
' <<<"$pods_json")

if [[ -n "$missing_resources" ]]; then
  printf '%s\n%s\n' \
    'Kino container(s) are missing explicit requests/limits:' \
    "$missing_resources" >&2
  exit 1
fi

read -r requested_memory_bytes requested_cpu_millicpu < <(
  jq -r --argjson namespaces "$kino_namespaces" '
    .items[]
    | select(.metadata.namespace as $namespace | $namespaces | index($namespace))
    | select(.status.phase == "Pending" or .status.phase == "Running")
    # Include init containers conservatively. Kubernetes runs each init phase
    # before the app containers, but counting both is safer than understating
    # the local request budget during bootstrap.
    | ((.spec.initContainers // []) + .spec.containers)[]
    | "\(.resources.requests.memory) \(.resources.requests.cpu)"
  ' <<<"$pods_json" \
    | while read -r memory cpu; do
        printf '%s %s\n' "$(quantity_bytes "$memory")" "$(quantity_millicpu "$cpu")"
      done \
    | awk '{ memory += $1; cpu += $2 } END { print memory + 0, cpu + 0 }'
)

# With this Minikube/Docker combination kubelet can advertise host capacity
# rather than the Docker cgroup. The lower value is the only safe admission
# budget; resource requests cannot protect the host if the node reports more
# capacity than its container is actually allowed to consume.
cgroup_cpu_millicpu=$((nano_cpus / 1000000))
usable_memory_bytes=$allocatable_memory_bytes
usable_cpu_millicpu=$allocatable_cpu_millicpu
if (( memory_limit < usable_memory_bytes )); then
  usable_memory_bytes=$memory_limit
fi
if (( cgroup_cpu_millicpu < usable_cpu_millicpu )); then
  usable_cpu_millicpu=$cgroup_cpu_millicpu
fi

memory_percent=$(( requested_memory_bytes * 100 / usable_memory_bytes ))
cpu_percent=$(( requested_cpu_millicpu * 100 / usable_cpu_millicpu ))

printf '%s\n' 'Kino local capacity:'
printf '  node allocatable: %s MiB, %sm CPU\n' \
  "$((allocatable_memory_bytes / 1024 / 1024))" "$allocatable_cpu_millicpu"
printf '  enforceable budget: %s MiB, %sm CPU\n' \
  "$((usable_memory_bytes / 1024 / 1024))" "$usable_cpu_millicpu"
printf '  active Kino requests: %s MiB (%s%%), %sm CPU (%s%%)\n' \
  "$((requested_memory_bytes / 1024 / 1024))" "$memory_percent" \
  "$requested_cpu_millicpu" "$cpu_percent"
printf '  minikube Docker cgroup: %s MiB, swap disabled\n' \
  "$((memory_limit / 1024 / 1024))"
if (( allocatable_memory_bytes > memory_limit || allocatable_cpu_millicpu > cgroup_cpu_millicpu )); then
  echo '  note: kubelet advertises more than the Docker cgroup; the lower cgroup budget is enforced.'
fi
printf '  host: '
free -h | awk 'NR == 2 { printf "MemAvailable=%s; ", $7 } NR == 3 { printf "SwapFree=%s\n", $4 }'
printf '  host memory PSI: '
cat /proc/pressure/memory

if (( memory_percent > max_fraction || cpu_percent > max_fraction )); then
  echo "Kino requests exceed the ${max_fraction}% local safety budget." >&2
  exit 1
fi

unhealthy=$(jq -r --argjson namespaces "$kino_namespaces" '
  .items[]
  | select(.metadata.namespace as $namespace | $namespaces | index($namespace))
  | . as $pod
  | .status.containerStatuses[]?
  | select((.restartCount // 0) > 0 or (.state.waiting.reason? == "CrashLoopBackOff"))
  | "\($pod.metadata.namespace)/\($pod.metadata.name): \(.name), restarts=\(.restartCount)"
' <<<"$pods_json")

if [[ -n "$unhealthy" ]]; then
  printf '%s\n%s\n' 'Kino workload restart/CrashLoop evidence:' "$unhealthy" >&2
  exit 1
fi

if kubectl --context "$profile" get events --all-namespaces \
  --field-selector type=Warning -o json \
  | jq -e '.items[] | select(.reason == "OOMKilling" or .reason == "OOMKilled" or .reason == "Evicted")' >/dev/null; then
  echo 'Kubernetes reported an OOM or eviction event.' >&2
  exit 1
fi
