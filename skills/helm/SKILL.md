---
name: helm
description: Reference for Helm charts - packaging Kubernetes applications, templating, values, and chart best practices for backend services.
license: MIT
metadata:
  stack: backend
  orchestration: kubernetes
---

# Helm Skill

Reference for packaging and deploying Kubernetes applications with Helm.

## Chart Structure

```
myapp/
├── Chart.yaml           # Chart metadata
├── values.yaml          # Default configuration values
├── values-prod.yaml     # Environment-specific overrides
├── templates/           # Kubernetes manifest templates
│   ├── NOTES.txt       # Post-install notes
│   ├── _helpers.tpl    # Template helpers
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── hpa.yaml
│   └── serviceaccount.yaml
└── charts/              # Chart dependencies (optional)
```

---

## Chart.yaml

```yaml
apiVersion: v2
name: myapp
description: A Helm chart for MyApp backend service
type: application
version: 1.0.0        # Chart version
appVersion: "1.0.0"   # Application version

maintainers:
- name: Your Team
  email: team@example.com

keywords:
- backend
- api
- microservice

home: https://github.com/example/myapp
sources:
- https://github.com/example/myapp

dependencies:
- name: postgresql
  version: "12.x.x"
  repository: https://charts.bitnami.com/bitnami
  condition: postgresql.enabled
- name: redis
  version: "18.x.x"
  repository: https://charts.bitnami.com/bitnami
  condition: redis.enabled
```

---

## values.yaml

```yaml
# Deployment configuration
replicaCount: 3

image:
  repository: registry.example.com/myapp
  pullPolicy: IfNotPresent
  tag: ""  # Defaults to appVersion if not set

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations: {}
  name: ""

podAnnotations: {}

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 65534
  fsGroup: 65534

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: true

service:
  type: ClusterIP
  port: 80
  targetPort: 8080
  annotations: {}

ingress:
  enabled: false
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
  - host: api.example.com
    paths:
    - path: /
      pathType: Prefix
  tls:
  - secretName: myapp-tls
    hosts:
    - api.example.com

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

livenessProbe:
  httpGet:
    path: /health/live
    port: http
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: http
  initialDelaySeconds: 10
  periodSeconds: 5

nodeSelector: {}

tolerations: []

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchLabels:
            app.kubernetes.io/name: myapp
        topologyKey: kubernetes.io/hostname

env:
  LOG_LEVEL: info
  PORT: "8080"

secrets:
  DATABASE_URL: ""
  API_KEY: ""

configMap:
  app.yaml: |
    server:
      port: 8080
      timeout: 30s

# Dependencies
postgresql:
  enabled: true
  auth:
    username: myapp
    database: myapp
    existingSecret: myapp-postgres-secret

redis:
  enabled: true
  auth:
    enabled: true
    existingSecret: myapp-redis-secret
```

---

## templates/_helpers.tpl

```yaml
{{/*
Expand the name of the chart.
*/}}
{{- define "myapp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "myapp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "myapp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "myapp.labels" -}}
helm.sh/chart: {{ include "myapp.chart" . }}
{{ include "myapp.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "myapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "myapp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "myapp.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
```

---

## templates/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
        {{- with .Values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "myapp.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
      - name: {{ .Chart.Name }}
        securityContext:
          {{- toYaml .Values.securityContext | nindent 12 }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: {{ .Values.service.targetPort }}
          protocol: TCP
        env:
        {{- range $key, $value := .Values.env }}
        - name: {{ $key }}
          value: {{ $value | quote }}
        {{- end }}
        envFrom:
        - secretRef:
            name: {{ include "myapp.fullname" . }}
        livenessProbe:
          {{- toYaml .Values.livenessProbe | nindent 12 }}
        readinessProbe:
          {{- toYaml .Values.readinessProbe | nindent 12 }}
        resources:
          {{- toYaml .Values.resources | nindent 12 }}
        volumeMounts:
        - name: config
          mountPath: /etc/myapp
          readOnly: true
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: config
        configMap:
          name: {{ include "myapp.fullname" . }}
      - name: tmp
        emptyDir: {}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

---

## Helm Commands

### Install/Upgrade

```bash
# Install chart
helm install myapp ./myapp -n production --create-namespace

# Install with custom values
helm install myapp ./myapp \
  -f values-prod.yaml \
  --set image.tag=v1.0.0 \
  -n production

# Upgrade release
helm upgrade myapp ./myapp \
  -f values-prod.yaml \
  --set image.tag=v1.1.0 \
  -n production

# Install or upgrade (idempotent)
helm upgrade --install myapp ./myapp \
  -f values-prod.yaml \
  --set image.tag=v1.1.0 \
  -n production

# Dry run (show manifests without installing)
helm install myapp ./myapp --dry-run --debug
```

### Management

```bash
# List releases
helm list -n production

# Get release status
helm status myapp -n production

# Get release values
helm get values myapp -n production

# Get manifest
helm get manifest myapp -n production

# History
helm history myapp -n production

# Rollback
helm rollback myapp 1 -n production

# Uninstall
helm uninstall myapp -n production
```

### Chart Development

```bash
# Create new chart
helm create myapp

# Lint chart
helm lint ./myapp

# Template (render locally)
helm template myapp ./myapp -f values-prod.yaml

# Package chart
helm package ./myapp

# Dependency update
helm dependency update ./myapp
```

---

## Environment-Specific Values

### values-dev.yaml

```yaml
replicaCount: 1

image:
  tag: dev

resources:
  limits:
    cpu: 200m
    memory: 256Mi
  requests:
    cpu: 50m
    memory: 64Mi

autoscaling:
  enabled: false

ingress:
  enabled: true
  hosts:
  - host: dev.example.com
```

### values-prod.yaml

```yaml
replicaCount: 5

image:
  tag: v1.0.0

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 200m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 5
  maxReplicas: 20

ingress:
  enabled: true
  hosts:
  - host: api.example.com

postgresql:
  enabled: false  # Use external DB in prod

redis:
  enabled: false  # Use external Redis in prod
```

---

## Makefile Integration

```makefile
CHART := myapp
NAMESPACE := production
VALUES := values-prod.yaml

.PHONY: helm-lint
helm-lint:
	helm lint $(CHART)

.PHONY: helm-template
helm-template:
	helm template $(CHART) ./$(CHART) -f $(VALUES)

.PHONY: helm-install
helm-install:
	helm upgrade --install $(CHART) ./$(CHART) \
		-f $(VALUES) \
		--namespace $(NAMESPACE) \
		--create-namespace

.PHONY: helm-uninstall
helm-uninstall:
	helm uninstall $(CHART) -n $(NAMESPACE)

.PHONY: helm-package
helm-package:
	helm package $(CHART) -d dist/

.PHONY: helm-diff
helm-diff:
	helm diff upgrade $(CHART) ./$(CHART) -f $(VALUES) -n $(NAMESPACE)
```

---

## Helm Secrets (sops)

### Install helm-secrets plugin

```bash
helm plugin install https://github.com/jkroepke/helm-secrets
```

### Create encrypted secrets

```bash
# Create secrets.yaml
cat > secrets.yaml <<EOF
secrets:
  DATABASE_URL: postgres://user:pass@host:5432/db
  API_KEY: secret-key
EOF

# Encrypt with sops
sops -e -i secrets.yaml
```

### Use encrypted secrets

```bash
helm secrets upgrade --install myapp ./myapp \
  -f values.yaml \
  -f secrets.yaml \
  -n production
```

---

## Best Practices

### 1. Use Semantic Versioning
```yaml
# Chart.yaml
version: 1.2.3  # MAJOR.MINOR.PATCH
appVersion: "1.2.3"
```

### 2. Template Everything
```yaml
# ✅ GOOD: Templated
image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"

# ❌ BAD: Hardcoded
image: "myapp:v1.0.0"
```

### 3. Use Checksum Annotations
```yaml
# Force pod restart on config/secret change
annotations:
  checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
```

### 4. Validate Values
```yaml
{{- if not .Values.image.repository }}
{{- fail "image.repository is required" }}
{{- end }}
```

### 5. Document Values
```yaml
# values.yaml with comments
# -- Number of replicas
replicaCount: 3

# -- Image configuration
image:
  # -- Image repository
  repository: myapp
  # -- Image tag (defaults to appVersion)
  tag: ""
```

---

## Common Pitfalls

### ❌ Not pinning dependency versions
```yaml
# BAD: Uses latest
dependencies:
- name: postgresql
  version: "*"

# GOOD: Specific version
dependencies:
- name: postgresql
  version: "12.5.6"
```

### ❌ No resource limits
- Charts should set default resource limits

### ❌ Hardcoded values
- Everything should be templated and configurable

### ❌ No health checks
- Charts should include liveness/readiness probes

### ❌ Missing NOTES.txt
- Users need post-install instructions

---

## References

- Helm Documentation: https://helm.sh/docs/
- Chart Best Practices: https://helm.sh/docs/chart_best_practices/
- Helm Secrets: https://github.com/jkroepke/helm-secrets
