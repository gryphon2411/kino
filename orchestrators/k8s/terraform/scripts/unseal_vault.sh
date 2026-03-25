#!/bin/bash
set -euo pipefail
umask 077

# Configuration
VAULT_POD="vault-0"
KEYS_FILE="cluster-keys.json"
NAMESPACE="default"
CONFIG_MANIFEST="k8s/vault-secrets.yaml"
ESO_POLICY_NAME="external-secrets"
ESO_TOKEN_SECRET_NAME="vault-eso-token"
ESO_TOKEN_SECRET_KEY="token"

vault_status_json() {
    local status_json
    local rc=0

    status_json=$(kubectl exec -n "$NAMESPACE" "$VAULT_POD" -- vault status -format=json 2>/dev/null) || rc=$?

    # Vault exits 0 when unsealed and 2 when sealed/uninitialized, while still printing valid JSON.
    if [ "$rc" -ne 0 ] && [ "$rc" -ne 2 ]; then
        echo "Error: unable to read Vault status (exit code: $rc)." >&2
        exit 1
    fi

    if [ -z "$status_json" ]; then
        echo "Error: Vault status returned no JSON output." >&2
        exit 1
    fi

    printf '%s\n' "$status_json"
}

is_placeholder() {
    case "${1:-}" in
        ""|your_*|example_*|changeme*|replace_me*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

echo "Waiting for $VAULT_POD to be ready..."
# Wait for pod to be running and responding to commands
# Note: vault status returns exit 0 when unsealed, exit 2 when sealed
# Both mean vault is reachable - we only care about connectivity here
echo "Waiting for Vault pod to be reachable..."
MAX_RETRIES=30
count=0
while true; do
    rc=0
    kubectl exec -n "$NAMESPACE" "$VAULT_POD" -- vault status >/dev/null 2>&1 || rc=$?
    # Exit codes: 0 = unsealed, 2 = sealed, other = error/not reachable
    if [ "$rc" -eq 0 ] || [ "$rc" -eq 2 ]; then
        echo "Vault is reachable (exit code: $rc)"
        break
    fi
    echo "Waiting for Vault to accept commands (exit code: $rc)..."
    sleep 5
    count=$((count+1))
    if [ "$count" -ge "$MAX_RETRIES" ]; then
        echo "Timed out waiting for Vault."
        exit 1
    fi
done


echo "Checking Vault initialization status..."
# Check init status inside the pod
VAULT_STATUS_JSON=$(vault_status_json)
INIT_STATUS=$(printf '%s\n' "$VAULT_STATUS_JSON" | jq -r '.initialized')

if [ "$INIT_STATUS" == "false" ]; then
    echo "Vault is NOT initialized. Initializing..."
    kubectl exec -n "$NAMESPACE" "$VAULT_POD" -- vault operator init -key-shares=1 -key-threshold=1 -format=json > "$KEYS_FILE"
    echo "Vault initialized. Keys saved to $KEYS_FILE"
else
    echo "Vault is already initialized."
fi

if [ ! -f "$KEYS_FILE" ]; then
    echo "Error: $KEYS_FILE is required to unseal Vault and mint the External Secrets token."
    exit 1
fi

echo "Checking seal status..."
VAULT_STATUS_JSON=$(vault_status_json)
SEAL_STATUS=$(printf '%s\n' "$VAULT_STATUS_JSON" | jq -r '.sealed')

# Read Keys
UNSEAL_KEY=$(jq -r ".unseal_keys_b64[0]" "$KEYS_FILE")
ROOT_TOKEN=$(jq -r ".root_token" "$KEYS_FILE")

if [ "$SEAL_STATUS" == "true" ]; then
    echo "Vault is SEALED. Unsealing..."
    
    if [ -z "$UNSEAL_KEY" ] || [ "$UNSEAL_KEY" == "null" ]; then
        echo "Error: Could not find unseal key in $KEYS_FILE. Manual intervention required."
        exit 1
    fi
    
    kubectl exec -n "$NAMESPACE" "$VAULT_POD" -- vault operator unseal "$UNSEAL_KEY" >/dev/null
    echo "Vault successfully unsealed."
else
    echo "Vault is already UNSEALED."
fi

# Enable KV v2 Engine
echo "Ensuring KV v2 engine is enabled at secret/..."
VAULT_SECRETS_JSON=$(kubectl exec -n "$NAMESPACE" "$VAULT_POD" -- sh -c 'VAULT_TOKEN="$1" vault secrets list -format=json' sh "$ROOT_TOKEN")
if ! printf '%s\n' "$VAULT_SECRETS_JSON" | jq -e '."secret/"' >/dev/null; then
    kubectl exec -n "$NAMESPACE" "$VAULT_POD" -- sh -c 'VAULT_TOKEN="$1" vault secrets enable -path=secret -version=2 kv >/dev/null' sh "$ROOT_TOKEN"
fi

# Populate Secrets
echo "Populating Secrets..."
if is_placeholder "${TF_VAR_huggingface_hub_access_token:-}" || is_placeholder "${TF_VAR_gemini_api_key:-}"; then
    echo "WARNING: TF_VAR_huggingface_hub_access_token and/or TF_VAR_gemini_api_key are missing or still placeholder values. Existing Vault secrets were left unchanged."
else
    kubectl exec -n "$NAMESPACE" "$VAULT_POD" -- sh -c 'VAULT_TOKEN="$1" vault kv put secret/generative-service HUGGINGFACE_HUB_ACCESS_TOKEN="$2" GEMINI_API_KEY="$3" >/dev/null' sh "$ROOT_TOKEN" "${TF_VAR_huggingface_hub_access_token}" "${TF_VAR_gemini_api_key}"
    echo "Secrets written to Vault."
fi

echo "Configuring External Secrets policy..."
cat <<'EOF' | kubectl exec -i -n "$NAMESPACE" "$VAULT_POD" -- sh -c 'VAULT_TOKEN="$1" vault policy write external-secrets - >/dev/null' sh "$ROOT_TOKEN"
path "secret/data/generative-service" {
  capabilities = ["read"]
}

path "secret/metadata/generative-service" {
  capabilities = ["read", "list"]
}
EOF

# Create least-privilege K8s Secret for ESO
echo "Creating/Updating '$ESO_TOKEN_SECRET_NAME' secret for ESO..."
ESO_TOKEN_JSON=$(kubectl exec -n "$NAMESPACE" "$VAULT_POD" -- sh -c 'VAULT_TOKEN="$1" vault token create -policy='"$ESO_POLICY_NAME"' -orphan -display-name=external-secrets -ttl=720h -format=json' sh "$ROOT_TOKEN")
ESO_TOKEN=$(printf '%s\n' "$ESO_TOKEN_JSON" | jq -r '.auth.client_token')

if [ -z "$ESO_TOKEN" ] || [ "$ESO_TOKEN" = "null" ]; then
    echo "Error: failed to mint External Secrets token."
    exit 1
fi

kubectl create secret generic "$ESO_TOKEN_SECRET_NAME" \
    --from-literal="${ESO_TOKEN_SECRET_KEY}=$ESO_TOKEN" \
    -n $NAMESPACE \
    --dry-run=client -o yaml | kubectl apply -f -

# Apply ESO Configuration (SecretStore, ExternalSecrets)
echo "Waiting for ExternalSecret CRDs..."
kubectl wait --for condition=established --timeout=60s crd/externalsecrets.external-secrets.io || echo "CRD externalsecrets not established yet"
kubectl wait --for condition=established --timeout=60s crd/secretstores.external-secrets.io || echo "CRD secretstores not established yet"

echo "Applying Vault-ESO Integration Manifests..."
# Refresh discovery cache to ensure new CRDs are picked up
kubectl api-resources >/dev/null || true

if [ -f "$CONFIG_MANIFEST" ]; then
    MAX_RETRIES=5
    n=0
    until [ "$n" -ge "$MAX_RETRIES" ]
    do
       kubectl apply -f "$CONFIG_MANIFEST" && break
       echo "Apply failed (attempt $((n+1))/$MAX_RETRIES). Retrying in 5s..."
       n=$((n+1))
       sleep 5
    done
    
    if [ "$n" -ge "$MAX_RETRIES" ]; then
        echo "Failed to apply manifests after $MAX_RETRIES attempts."
        exit 1
    fi
else
    echo "Error: Manifest file $CONFIG_MANIFEST not found!"
    exit 1
fi

echo "Vault Bootstrap Complete."
