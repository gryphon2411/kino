#!/bin/bash

CLUSTER_ENVIRONMENT=""

# Check for required dependencies
check_dependencies() {
    local dependencies=("kubectl" "yq" "minikube" "helm" "jq")
    
    while true; do
        local missing=false
        
        for tool in "${dependencies[@]}"; do
            if ! command -v "$tool" &> /dev/null; then
                echo "Error: $tool is required but not installed."
                missing=true
            fi
        done
        
        if [ "$missing" = false ]; then
            break
        fi
        
        echo
        read -p "Install the missing tools and press Enter to retry (or Ctrl+C to exit): "
    done
}

prompt_cluster_environment() {
    while true; do
        echo
        read -p "Select cluster environment (local/dev, default: local): " env
        env=${env:-local}
        case $env in
            local|dev ) 
                CLUSTER_ENVIRONMENT=$env
                break;;
            * ) echo "Invalid cluster environment. Please enter 'local' or 'dev'.";;
        esac
    done
    echo
}


confirm() {
    echo
    read -p "Do you wish to create $1? (y/N) " yn
    case $yn in
        [Yy]* ) return 0;;
        * ) return 1;;
    esac
    echo
}

create_deploy_and_wait() {
    local yaml_file=$1

    echo -e "\nkubectl apply -f $yaml_file"
    kubectl apply -f $yaml_file

    local namespace=$(yq ea 'select(.metadata.namespace?) | .metadata.namespace? // "default"' $yaml_file | head -n 1)

    if [ -z "$namespace" ]; then
        namespace="default"
    fi

    local deployment_name=$(yq e 'select(.kind == "Deployment") | .metadata.name' $yaml_file)

    echo -n -e "\nCreating deployment.apps/$deployment_name..."
    while [[ $(kubectl -n $namespace get deployments $deployment_name -o 'jsonpath={..status.conditions[?(@.type=="Available")].status}') != "True" ]]; do
        sleep 1
        echo -n "."
    done
    echo

    kubectl -n $namespace get deployments $deployment_name

    kubectl -n $namespace get pods -l app=$deployment_name
}

create_statefulset_and_wait() {
    local yaml_file=$1

    echo -e "\nkubectl apply -f $yaml_file"
    kubectl apply -f $yaml_file

    local namespace=$(yq ea 'select(.metadata.namespace?) | .metadata.namespace? // "default"' $yaml_file | head -n 1)
    
    if [ -z "$namespace" ]; then
        namespace="default"
    fi

    local statefulset_name=$(kubectl -n $namespace get statefulsets -o jsonpath='{.items[0].metadata.name}')

    echo -n -e "\nCreating statefulset.apps/$statefulset_name..."
    while true; do
        local replicas=$(kubectl -n $namespace get statefulsets $statefulset_name -o 'jsonpath={..status.replicas}')
        local readyReplicas=$(kubectl -n $namespace get statefulsets $statefulset_name -o 'jsonpath={..status.readyReplicas}')

        if [ "$replicas" == "$readyReplicas" ]; then
            break
        fi

        sleep 1
        echo -n "."
    done
    echo

    kubectl -n $namespace get statefulsets $statefulset_name

    kubectl -n $namespace get pods -l app=$statefulset_name
}

create_job_and_wait() {
    local yaml_file=$1

    echo -e "\nkubectl apply -f $yaml_file"
    kubectl apply -f $yaml_file

    local namespace=$(yq ea 'select(.metadata.namespace?) | .metadata.namespace? // "default"' $yaml_file | head -n 1)

    if [ -z "$namespace" ]; then
        namespace="default"
    fi

    local job_name=$(kubectl -n $namespace get jobs -o jsonpath='{.items[0].metadata.name}')

    echo -n -e "\nCreating job.batch/$job_name..."
    while [[ $(kubectl -n $namespace get jobs $job_name -o 'jsonpath={..status.conditions[?(@.type=="Complete")].status}') != "True" ]]; do
        sleep 1
        echo -n "."
    done
    echo

    kubectl -n $namespace get jobs $job_name

    kubectl -n $namespace get pods -l job-name=$job_name
}

create_ingress_and_wait() {
    local yaml_file=$1

    echo -e "\nminikube addons enable ingress"
    minikube addons enable ingress

    sleep 20

    echo -e "\nkubectl apply -f $yaml_file"
    kubectl apply -f $yaml_file

    local namespace=$(yq ea 'select(.metadata.namespace?) | .metadata.namespace? // "default"' $yaml_file | head -n 1)

    if [ -z "$namespace" ]; then
        namespace="default"
    fi

    local ingress_name=$(kubectl -n $namespace get ingress -o jsonpath='{.items[0].metadata.name}')

    echo -n -e "\nCreating ingress.networking.k8s.io/$ingress_name..."
    while [[ $(kubectl -n $namespace get ingress $ingress_name -o 'jsonpath={..status.loadBalancer.ingress[0].ip}') == "" ]]; do
        sleep 1
        echo -n "."
    done
    echo

    minikube_ip=$(minikube ip)

    if [ "$CLUSTER_ENVIRONMENT" = "dev" ]; then
        hostname="dev.kino.com"
    else
        hostname="local.kino.com"
    fi

    if ! grep -q "$minikube_ip $hostname" /etc/hosts; then
        echo -e "\n$minikube_ip $hostname\n"
        echo -e "$minikube_ip $hostname" | sudo tee -a /etc/hosts
    fi

    kubectl -n $namespace describe ingress $ingress_name --show-events=false

    echo -e "\nhttp://${hostname}"
}

helm_install_and_wait() {
    local namespace=$1
    local release_name=$2
    local chart=$3
    local version=$4
    local values_file=$5

    echo -e "\nhelm -n $namespace install $release_name $chart --version $version -f $values_file --create-namespace"
    helm -n $namespace install $release_name $chart --version $version -f $values_file --create-namespace

    sleep 2

    echo -n -e "Installing $chart ($version)..."

    while [[ $(helm status $release_name -n $namespace --output json | jq -r '.info.status') != "deployed" ]]; do
        sleep 1
        echo -n "."
    done
    echo

    helm status $release_name -n $namespace
}

create_secret_and_wait() {
    local yaml_file=$1

    echo -e "\nkubectl apply -f $yaml_file"
    kubectl apply -f $yaml_file

    local namespace=$(yq ea 'select(.metadata.namespace?) | .metadata.namespace? // "default"' $yaml_file | head -n 1)

    if [ -z "$namespace" ]; then
        namespace="default"
    fi

    local secret_name=$(yq e '.metadata.name' $yaml_file)

    echo -n -e "\nCreating secret/$secret_name"
    while [[ $(kubectl -n $namespace get secret $secret_name -o 'jsonpath={.metadata.creationTimestamp}') == "" ]]; do
        sleep 1
        echo -n "."
    done
    echo

    kubectl -n $namespace get secret $secret_name
}

start_time=$(date +%s)

check_dependencies
prompt_cluster_environment

echo -e "\nProvisioning Kino k8s $CLUSTER_ENVIRONMENT cluster...\n"

if minikube status | grep -q "host: Running"; then
    echo "Minikube is already running."
else
    echo -e "\nminikube start --cpus=max --memory=max"
    minikube start --cpus=max --memory=max
fi

if confirm "Mongodb system"; then
    create_statefulset_and_wait orchestrators/k8s/mongodb-system.yaml
    echo
    echo "MongoDB URI: mongodb://
$(kubectl -n mongodb-system get secret mongodb-root-user-credentials -o jsonpath='{.data.username}' | base64 --decode):
$(kubectl -n mongodb-system get secret mongodb-root-user-credentials -o jsonpath='{.data.password}' | base64 --decode)@
$(minikube -n mongodb-system service mongodb --url | sed 's/http:\/\///')" | tr -d '\n' && echo
fi

if confirm "Mongodb init"; then
    create_job_and_wait orchestrators/k8s/mongodb-init-job.yaml
    kubectl -n mongodb-system logs jobs/mongodb-init | jq -r '.message'
fi

if confirm "Postgres system"; then
    kubectl create namespace postgres-system
    kubectl -n postgres-system create configmap postgres-initdb --from-file orchestrators/k8s/postgres-initdb.sh
    create_statefulset_and_wait orchestrators/k8s/postgres-system.yaml
    echo $(kubectl -n postgres-system get secret postgres-root-user-credentials -o jsonpath='{.data.username}' | base64 --decode)
    echo $(kubectl -n postgres-system get secret postgres-root-user-credentials -o jsonpath='{.data.password}' | base64 --decode)
    minikube -n postgres-system service list
fi

if confirm "Redis-Stack system"; then
    create_statefulset_and_wait orchestrators/k8s/redis-stack-system.yaml
    echo
    echo "Redis URI: redis://
$(kubectl -n redis-stack-system get secret redis-stack-default-user-credentials -o jsonpath='{.data.username}' | base64 --decode):
$(kubectl -n redis-stack-system get secret redis-stack-default-user-credentials -o jsonpath='{.data.password}' | base64 --decode)@
$(minikube -n redis-stack-system service redis-stack --url | head -n 1 | sed 's/http:\/\///')" | tr -d '\n' && echo
fi

if confirm "Kafka system"; then
    # https://artifacthub.io/packages/helm/bitnami/kafka
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm_install_and_wait kafka-system kafka bitnami/kafka 32.4.3 orchestrators/k8s/charts/kafka/values.yaml
    echo
    kubectl get secret kafka-user-passwords --namespace kafka-system -o jsonpath='{.data.client-passwords}' | base64 -d
fi

if confirm "RabbitMQ system"; then
    # https://artifacthub.io/packages/helm/bitnami/rabbitmq
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm_install_and_wait rabbitmq-system rabbitmq bitnami/rabbitmq 14.6.5 orchestrators/k8s/charts/rabbitmq/values.yaml
    echo -e "\n$(yq e '.auth.username, .auth.password' orchestrators/k8s/charts/rabbitmq/values.yaml)"
    minikube -n rabbitmq-system service list | grep --color -E "http-stats|"
fi

if confirm "Kino auth service"; then
    if [ "$CLUSTER_ENVIRONMENT" = "dev" ]; then
        kubectl delete -f orchestrators/k8s/auth-service-deployment.yaml
        create_deploy_and_wait orchestrators/k8s/dev-auth-service-deployment.yaml
    else
        kubectl delete -f orchestrators/k8s/dev-auth-service-deployment.yaml
        create_deploy_and_wait orchestrators/k8s/auth-service-deployment.yaml
    fi
fi


if confirm "Kino data service"; then
    create_deploy_and_wait orchestrators/k8s/data-service-deployment.yaml
    # Perform at least 1 data search so all Kafka input topics will be created
fi

if confirm "Kino trend service"; then
    create_deploy_and_wait orchestrators/k8s/trend-service-deployment.yaml
fi

if confirm "Kino generative service"; then
    create_secret_and_wait orchestrators/k8s/generative-service/huggingface-secret.yaml
    create_secret_and_wait orchestrators/k8s/generative-service/gemini-secret.yaml
    create_deploy_and_wait orchestrators/k8s/generative-service/deployment.yaml
fi

if confirm "Kino ui"; then
    if [ "$CLUSTER_ENVIRONMENT" = "dev" ]; then
        kubectl delete -f orchestrators/k8s/ui-deployment.yaml
        create_deploy_and_wait orchestrators/k8s/dev-ui-deployment.yaml
    else
        kubectl delete -f orchestrators/k8s/dev-ui-deployment.yaml
        create_deploy_and_wait orchestrators/k8s/ui-deployment.yaml
    fi
fi

if confirm "Prometheus system"; then
    # https://artifacthub.io/packages/helm/prometheus-community/prometheus
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm_install_and_wait prometheus-system prometheus prometheus-community/prometheus 25.8.2 orchestrators/k8s/charts/prometheus/values.yaml
    # Expression (temporary view): kafka_server_brokertopicmetrics_messagesinpersec_count{topic="title-searches"}
fi

if confirm "Grafana system"; then
    # https://artifacthub.io/packages/helm/grafana/grafana?modal=install
    helm repo add grafana https://grafana.github.io/helm-charts
    helm_install_and_wait grafana-system grafana grafana/grafana 7.0.19 orchestrators/k8s/charts/grafana/values.yaml
    echo "admin"
    kubectl -n grafana-system get secret grafana -o jsonpath="{.data.admin-password}" | base64 --decode
    
    # Data sources:
    # - Type: Prometheus
    # - Name: prometheus-server
    # - Prometheus server URL: http://prometheus-server.prometheus-system
    # Query (permanent view): kafka_server_brokertopicmetrics_messagesinpersec_count{topic="title-searches"}
fi

if confirm "Gateway ingress"; then
    if [ "$CLUSTER_ENVIRONMENT" = "dev" ]; then
        kubectl delete -f orchestrators/k8s/gateway-ingress.yaml
        create_ingress_and_wait orchestrators/k8s/dev-gateway-ingress.yaml
    else
        kubectl delete -f orchestrators/k8s/dev-gateway-ingress.yaml
        create_ingress_and_wait orchestrators/k8s/gateway-ingress.yaml
    fi
fi

end_time=$(date +%s)

time_duration=$((end_time - start_time))
minutes=$((time_duration / 60))
seconds=$((time_duration % 60))

echo -e "\nProvisioned Kino k8s $CLUSTER_ENVIRONMENT cluster. took ${minutes}m ${seconds}s\n"
