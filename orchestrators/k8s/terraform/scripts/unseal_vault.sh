#!/bin/bash
set -e
set -x  # Enable tracing for debugging

# Configuration
VAULT_POD="vault-0"
KEYS_FILE="cluster-keys.json"
NAMESPACE="default"
CONFIG_MANIFEST="k8s/vault-secrets.yaml"

echo "Waiting for $VAULT_POD to be ready..."
# Wait for pod to be running and responding to commands
# Note: vault status returns exit 0 when unsealed, exit 2 when sealed
# Both mean vault is reachable - we only care about connectivity here
echo "Waiting for Vault pod to be reachable..."
MAX_RETRIES=30
count=0
while true; do
    rc=0
    kubectl exec -n $NAMESPACE $VAULT_POD -- vault status >/dev/null 2>&1 || rc=$?
    # Exit codes: 0 = unsealed, 2 = sealed, other = error/not reachable
    if [ $rc -eq 0 ] || [ $rc -eq 2 ]; then
        echo "Vault is reachable (exit code: $rc)"
        break
    fi
    echo "Waiting for Vault to accept commands (exit code: $rc)..."
    sleep 5
    count=$((count+1))
    if [ $count -ge $MAX_RETRIES ]; then
        echo "Timed out waiting for Vault."
        exit 1
    fi
done


echo "Checking Vault initialization status..."
# Check init status inside the pod
INIT_STATUS=$(kubectl exec -n $NAMESPACE $VAULT_POD -- vault status -format=json 2>/dev/null | jq -r '.initialized')

if [ "$INIT_STATUS" == "false" ]; then
    echo "Vault is NOT initialized. Initializing..."
    kubectl exec -n $NAMESPACE $VAULT_POD -- vault operator init -key-shares=1 -key-threshold=1 -format=json > $KEYS_FILE
    echo "Vault initialized. Keys saved to $KEYS_FILE"
else
    echo "Vault is already initialized."
fi

echo "Checking seal status..."
SEAL_STATUS=$(kubectl exec -n $NAMESPACE $VAULT_POD -- vault status -format=json 2>/dev/null | jq -r '.sealed')

# Read Keys
UNSEAL_KEY=$(jq -r ".unseal_keys_b64[0]" $KEYS_FILE)
ROOT_TOKEN=$(jq -r ".root_token" $KEYS_FILE)

if [ "$SEAL_STATUS" == "true" ]; then
    echo "Vault is SEALED. Unsealing..."
    
    if [ -z "$UNSEAL_KEY" ] || [ "$UNSEAL_KEY" == "null" ]; then
        echo "Error: Could not find unseal key in $KEYS_FILE. Manual intervention required."
        exit 1
    fi
    
    kubectl exec -n $NAMESPACE $VAULT_POD -- vault operator unseal $UNSEAL_KEY
    echo "Vault successfully unsealed."
else
    echo "Vault is already UNSEALED."
fi

# Authenticate for Config
echo "Logging in to Vault..."
kubectl exec -n $NAMESPACE $VAULT_POD -- vault login $ROOT_TOKEN > /dev/null

# Enable KV v2 Engine
echo "Ensuring KV v2 engine is enabled at secret/..."
# Try enabling at 'secret' path explicitly
kubectl exec -n $NAMESPACE $VAULT_POD -- vault secrets enable -path=secret -version=2 kv || echo "Secrets engine might already be enabled at secret/"

# Populate Secrets
echo "Populating Secrets..."
if [ -z "$TF_VAR_huggingface_hub_access_token" ] || [ -z "$TF_VAR_gemini_api_key" ]; then
    echo "WARNING: API Keys (TF_VAR_...) are missing in environment. Vault secrets will be empty."
fi

# Note: We use the TF_VAR_ names because that's what is likely loaded in current env context
kubectl exec -n $NAMESPACE $VAULT_POD -- sh -c "vault kv put secret/generative-service HUGGINGFACE_HUB_ACCESS_TOKEN='$TF_VAR_huggingface_hub_access_token' GEMINI_API_KEY='$TF_VAR_gemini_api_key'"
echo "Secrets written to Vault."

# Create K8s Secret for ESO
echo "Creating/Updating 'vault-token' secret for ESO..."
kubectl create secret generic vault-token \
    --from-literal=token=$ROOT_TOKEN \
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
    until [ "$n" -ge $MAX_RETRIES ]
    do
       kubectl apply -f $CONFIG_MANIFEST && break
       echo "Apply failed (attempt $((n+1))/$MAX_RETRIES). Retrying in 5s..."
       n=$((n+1))
       sleep 5
    done
    
    if [ $n -ge $MAX_RETRIES ]; then
        echo "Failed to apply manifests after $MAX_RETRIES attempts."
        exit 1
    fi
else
    echo "Error: Manifest file $CONFIG_MANIFEST not found!"
    exit 1
fi

echo "Vault Bootstrap Complete."
