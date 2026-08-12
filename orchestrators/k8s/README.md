# Orchestrators

## Kubernetes

```bash
cd orchestrators/k8s/terraform
task deploy
```

### Helm Cheatsheet 

```bash
helm list -A
```

### Optional manual ECK stack

`eck-system.yaml` is an optional, manually applied Elastic Cloud on Kubernetes
(ECK) workload stack. It is adapted from
[`gryphon2411/k8s-funzone`](https://github.com/gryphon2411/k8s-funzone/blob/master/eck-system.yaml)
with its workload names changed to `kino`.

Install the ECK CRDs and operator first, then apply this manifest with
`kubectl apply -f eck-system.yaml`. It is deliberately outside the canonical
Terraform workflow: `task deploy` neither creates nor destroys the ECK stack.
