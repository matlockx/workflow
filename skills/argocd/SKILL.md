---
name: argocd
description: Reference for GitOps continuous delivery with Argo CD - application manifests, sync policies, and operational patterns.
license: MIT
metadata:
  stack: backend
  orchestration: kubernetes
  cicd: gitops
---

# Argo CD Skill

Reference for GitOps continuous delivery with Argo CD.

## Core Concepts

- **Application**: Argo CD CRD that defines what to deploy (Git repo + path) and where (K8s cluster + namespace)
- **Sync**: Process of making live state match desired state in Git
- **Sync Policy**: Rules for when/how to sync (manual vs automatic)
- **Health**: Status of deployed resources (Healthy, Progressing, Degraded, Suspended)
- **Project**: Logical grouping of applications with RBAC

---

## Application Manifest

### Basic Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
  finalizers:
  - resources-finalizer.argocd.argoproj.io  # Enable cascading delete
spec:
  # Source - where to get manifests
  source:
    repoURL: https://github.com/example/myapp
    targetRevision: main
    path: k8s/overlays/production
  
  # Destination - where to deploy
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  
  # Project
  project: default
  
  # Sync policy
  syncPolicy:
    automated:
      prune: true      # Delete resources not in Git
      selfHeal: true   # Sync when live state differs
      allowEmpty: false
    syncOptions:
    - CreateNamespace=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

### Helm Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/example/myapp
    targetRevision: main
    path: helm/myapp
    helm:
      # Values files
      valueFiles:
      - values.yaml
      - values-prod.yaml
      
      # Inline values (highest priority)
      values: |
        replicaCount: 5
        image:
          tag: v1.0.0
      
      # Parameters (override individual values)
      parameters:
      - name: image.tag
        value: v1.0.0
      
      # Release name
      releaseName: myapp
      
      # Skip CRD installation
      skipCrds: false
  
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  
  project: default
  
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

### Kustomize Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/example/myapp
    targetRevision: main
    path: k8s/overlays/production
    kustomize:
      # Kustomize version
      version: v5.0.0
      
      # Namespace override
      namespace: production
      
      # Name prefix
      namePrefix: prod-
      
      # Common labels
      commonLabels:
        environment: production
        managed-by: argocd
      
      # Images (for image tag updates)
      images:
      - registry.example.com/myapp:v1.0.0
  
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  
  project: default
```

---

## AppProject (RBAC)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: backend-services
  namespace: argocd
spec:
  description: Backend microservices
  
  # Source repos allowed
  sourceRepos:
  - https://github.com/example/*
  - https://charts.bitnami.com/bitnami
  
  # Destinations allowed
  destinations:
  - namespace: production
    server: https://kubernetes.default.svc
  - namespace: staging
    server: https://kubernetes.default.svc
  
  # Cluster resources allowed
  clusterResourceWhitelist:
  - group: ''
    kind: Namespace
  
  # Namespace resources allowed
  namespaceResourceWhitelist:
  - group: 'apps'
    kind: Deployment
  - group: 'apps'
    kind: StatefulSet
  - group: ''
    kind: Service
  - group: ''
    kind: ConfigMap
  - group: ''
    kind: Secret
  - group: 'networking.k8s.io'
    kind: Ingress
  
  # Namespace resources denied (takes precedence)
  namespaceResourceBlacklist:
  - group: ''
    kind: ResourceQuota
  
  # Roles for RBAC
  roles:
  - name: developer
    description: Developers can view and sync
    policies:
    - p, proj:backend-services:developer, applications, get, backend-services/*, allow
    - p, proj:backend-services:developer, applications, sync, backend-services/*, allow
    groups:
    - dev-team
```

---

## Sync Waves and Hooks

### Sync Waves (Order Resources)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: database-config
  annotations:
    argocd.argoproj.io/sync-wave: "0"  # Deploy first
---
apiVersion: batch/v1
kind: Job
metadata:
  name: migration
  annotations:
    argocd.argoproj.io/sync-wave: "1"  # After configmap
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  annotations:
    argocd.argoproj.io/sync-wave: "2"  # After migration
```

### Hooks (Lifecycle Events)

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: pre-sync-backup
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
spec:
  template:
    spec:
      containers:
      - name: backup
        image: backup-tool
        command: ["/backup.sh"]
      restartPolicy: Never
---
apiVersion: batch/v1
kind: Job
metadata:
  name: post-sync-test
  annotations:
    argocd.argoproj.io/hook: PostSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  template:
    spec:
      containers:
      - name: test
        image: test-runner
        command: ["/test.sh"]
      restartPolicy: Never
```

**Hook Types**:
- `PreSync`: Before sync
- `Sync`: During sync (rarely used)
- `PostSync`: After sync
- `SyncFail`: If sync fails
- `Skip`: Don't create resource (use for hooks only)

**Delete Policies**:
- `HookSucceeded`: Delete after success
- `HookFailed`: Delete after failure
- `BeforeHookCreation`: Delete before creating new hook

---

## argocd CLI Commands

### Application Management

```bash
# Login
argocd login argocd.example.com

# Create app from CLI
argocd app create myapp \
  --repo https://github.com/example/myapp \
  --path k8s/overlays/production \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace production \
  --sync-policy automated \
  --auto-prune \
  --self-heal

# Create app from file
argocd app create -f application.yaml

# List apps
argocd app list

# Get app details
argocd app get myapp

# Sync app
argocd app sync myapp

# Sync specific resources
argocd app sync myapp --resource apps:Deployment:myapp

# Rollback
argocd app rollback myapp

# Delete app
argocd app delete myapp

# History
argocd app history myapp

# Diff (compare Git vs live)
argocd app diff myapp
```

### Logs and Events

```bash
# Get logs
argocd app logs myapp

# Get events
argocd app events myapp

# Watch sync
argocd app wait myapp --sync
```

---

## Image Update Strategies

### Strategy 1: Kustomize + ArgoCD Image Updater

Install Argo CD Image Updater:
```bash
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml
```

Annotate application:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  annotations:
    argocd-image-updater.argoproj.io/image-list: myapp=registry.example.com/myapp
    argocd-image-updater.argoproj.io/myapp.update-strategy: semver
    argocd-image-updater.argoproj.io/myapp.allow-tags: regexp:^v[0-9]+\.[0-9]+\.[0-9]+$
    argocd-image-updater.argoproj.io/write-back-method: git
spec:
  # ... rest of spec
```

### Strategy 2: CI Pipeline Updates values.yaml

```bash
# In CI/CD pipeline (GitHub Actions, GitLab CI)
git clone https://github.com/example/myapp
cd myapp
yq eval '.image.tag = "v1.0.0"' -i helm/myapp/values.yaml
git add helm/myapp/values.yaml
git commit -m "Update image to v1.0.0"
git push
```

---

## Multi-Environment Setup

### Directory Structure

```
myapp/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   └── service.yaml
├── overlays/
│   ├── dev/
│   │   ├── kustomization.yaml
│   │   └── patches/
│   ├── staging/
│   │   ├── kustomization.yaml
│   │   └── patches/
│   └── production/
│       ├── kustomization.yaml
│       └── patches/
└── argocd/
    ├── dev.yaml
    ├── staging.yaml
    └── production.yaml
```

### App of Apps Pattern

```yaml
# argocd/apps.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: apps
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/example/infrastructure
    targetRevision: main
    path: argocd/applications
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  project: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Then in `argocd/applications/`, create individual app manifests.

---

## Notifications

### Configure Slack

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.slack: |
    token: $slack-token
  
  template.app-deployed: |
    message: |
      Application {{.app.metadata.name}} is now {{.app.status.operationState.phase}}.
      Revision: {{.app.status.sync.revision}}
  
  trigger.on-deployed: |
    - when: app.status.operationState.phase in ['Succeeded']
      send: [app-deployed]
---
apiVersion: v1
kind: Secret
metadata:
  name: argocd-notifications-secret
  namespace: argocd
type: Opaque
stringData:
  slack-token: xoxb-your-token
```

Subscribe app to notifications:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  annotations:
    notifications.argoproj.io/subscribe.on-deployed.slack: my-channel
spec:
  # ... rest of spec
```

---

## Best Practices

### 1. Use Projects for RBAC
- Separate projects per team/environment
- Restrict source repos and destinations

### 2. Enable Auto-Sync with Caution
```yaml
syncPolicy:
  automated:
    prune: true      # Remove deleted resources
    selfHeal: true   # Revert manual changes
```
- Use for non-prod environments
- Consider manual sync for production

### 3. Use Sync Waves
- Order resources logically (DB → migrations → app)
- Lower wave numbers deploy first

### 4. Health Checks
```yaml
metadata:
  annotations:
    argocd.argoproj.io/health-check: |
      hs = {}
      if obj.status ~= nil then
        if obj.status.phase == "Running" then
          hs.status = "Healthy"
        else
          hs.status = "Progressing"
        end
      end
      return hs
```

### 5. Prune Resources Carefully
```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-options: Prune=false  # Never delete this resource
```

---

## Common Pitfalls

### ❌ Not using finalizers
- Resources remain after app deletion
- ALWAYS add `resources-finalizer.argocd.argoproj.io`

### ❌ Forgetting CreateNamespace
```yaml
syncOptions:
- CreateNamespace=true  # Required if namespace doesn't exist
```

### ❌ Too aggressive auto-sync
- Can cause outages if bad config pushed
- Consider manual sync for critical apps

### ❌ No resource limits in AppProject
- Apps can deploy anything anywhere
- ALWAYS set whitelists/blacklists

### ❌ Secrets in Git
- Never commit secrets to Git
- Use Sealed Secrets or External Secrets Operator

---

## References

- Argo CD Documentation: https://argo-cd.readthedocs.io/
- Best Practices: https://argo-cd.readthedocs.io/en/stable/user-guide/best_practices/
- Argo CD Image Updater: https://argocd-image-updater.readthedocs.io/
