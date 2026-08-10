#!/usr/bin/env bash
set -euo pipefail

readonly profile="minikube"
readonly k6_image="grafana/k6@sha256:e7eeddf1ce2361df6920d925297f487c0ba549c44be242c6a9c22f28d9b08efa"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
readonly repo_root
readonly ui_dir="$repo_root/uis/react-ui/kino-ui"
readonly test_script="$repo_root/orchestrators/k8s/terraform/load-tests/ticket-bff.js"

for name in KINO_E2E_BASE_URL KINO_E2E_USERNAME KINO_E2E_PASSWORD; do
  [[ -n "${!name:-}" ]] || {
    echo "Missing required environment variable: $name" >&2
    exit 1
  }
done

for command in docker kubectl jq node awk; do
  command -v "$command" >/dev/null || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

bash "$(dirname "${BASH_SOURCE[0]}")/verify-local-capacity.sh"

ticket_service="ticket-service"
ui_service="ui"
if [[ "${TF_VAR_environment:-local}" == "dev" ]]; then
  ticket_service="dev-ticket-service"
  ui_service="dev-ui"
fi
kubectl --context "$profile" -n default rollout status "deployment/$ui_service" --timeout=180s
kubectl --context "$profile" -n default rollout status "deployment/$ticket_service" --timeout=180s

run_dir=$(mktemp -d)
session_file="$run_dir/session"
summary_file="$run_dir/summary.json"
watchdog_failure_file="$run_dir/watchdog-failed"
container_name="kino-ticket-load-${RANDOM}${RANDOM}"
baseline_swap_free=$(awk '/SwapFree:/ { print $2 * 1024 }' /proc/meminfo)
k6_pid=''
watchdog_pid=''

cleanup() {
  [[ -n "$watchdog_pid" ]] && kill "$watchdog_pid" 2>/dev/null || true
  [[ -n "$k6_pid" ]] && kill "$k6_pid" 2>/dev/null || true
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -rf "$run_dir"
}
trap cleanup EXIT

KINO_LOAD_SESSION_FILE="$session_file" node "$ui_dir/scripts/acquire-ticket-load-session.mjs"

watchdog() {
  while docker inspect "$container_name" >/dev/null 2>&1; do
    local memory_percent current_swap_free swap_consumed
    memory_percent=$(docker stats --no-stream --format '{{.MemPerc}}' minikube | tr -d '%')
    current_swap_free=$(awk '/SwapFree:/ { print $2 * 1024 }' /proc/meminfo)
    swap_consumed=$((baseline_swap_free - current_swap_free))
    printf '%s minikube-memory=%s%% swap-consumed=%sMiB\n' \
      "$(date --iso-8601=seconds)" "$memory_percent" "$((swap_consumed / 1024 / 1024))"
    if awk -v value="$memory_percent" 'BEGIN { exit !(value > 90) }' \
      || (( swap_consumed > 268435456 )); then
      echo 'Load-test safety watchdog stopped the k6 runner.' >&2
      touch "$watchdog_failure_file"
      docker kill "$container_name" >/dev/null 2>&1 || true
      return
    fi
    sleep 5
  done
}

docker run --rm --name "$container_name" --network host \
  --user "$(id -u):$(id -g)" \
  --cpus=0.25 --memory=256m --memory-swap=256m \
  --env "KINO_E2E_BASE_URL=$KINO_E2E_BASE_URL" \
  --env KINO_BFF_SESSION_FILE=/run/kino-load/session \
  --volume "$session_file:/run/kino-load/session:ro" \
  --volume "$test_script:/scripts/ticket-bff.js:ro" \
  --volume "$run_dir:/results" \
  "$k6_image" run --summary-export /results/summary.json /scripts/ticket-bff.js &
k6_pid=$!

for _ in $(seq 1 50); do
  docker inspect "$container_name" >/dev/null 2>&1 && break
  sleep 0.1
done
watchdog &
watchdog_pid=$!

if ! wait "$k6_pid"; then
  k6_failed=1
else
  k6_failed=0
fi
wait "$watchdog_pid" || true

if [[ -f "$summary_file" ]]; then
  printf '%s\n' 'Ticket BFF load-test summary:'
  jq '.metrics | with_entries(select(.key | startswith("ticket_bff")))' "$summary_file"
fi

printf '%s\n' 'Post-test local capacity:'
bash "$(dirname "${BASH_SOURCE[0]}")/verify-local-capacity.sh"

if [[ -f "$watchdog_failure_file" || "$k6_failed" -ne 0 ]]; then
  echo 'Ticket BFF load test failed; the cluster was intentionally left running for diagnosis.' >&2
  exit 1
fi
