---
name: kubernetes
description: Reference for deploying and managing Go/Rust backend services on Kubernetes - deployments, services, config, secrets, and operational patterns.
license: MIT
metadata:
  stack: backend
  orchestration: kubernetes
---

# Kubernetes Skill

Reference for deploying backend services on Kubernetes.

## Core Resource Manifests

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: production
  labels:
    app: myapp
    version: v1.0.0
spec:
  replicas: 3
  revisionHistoryLimit: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
        version: v1.0.0
    spec:
      serviceAccountName: myapp
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
      
      containers:
      - name: myapp
        image: registry.example.com/myapp:v1.0.0
        imagePullPolicy: IfNotPresent
        
        ports:
        - name: http
          containerPort: 8080
          protocol: TCP
        - name: grpc
          containerPort: 9090
          protocol: TCP
        
        env:
        - name: PORT
          value: "8080"
        - name: LOG_LEVEL
          value: "info"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: myapp-secrets
              key: database-url
        
        envFrom:
        - configMapRef:
            name: myapp-config
        
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
        
        livenessProbe:
          httpGet:
            path: /health/live
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /health/ready
            port: http
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        
        startupProbe:
          httpGet:
            path: /health/startup
            port: http
          initialDelaySeconds: 0
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 30
        
        volumeMounts:
        - name: config
          mountPath: /etc/myapp
          readOnly: true
        - name: tmp
          mountPath: /tmp
      
      volumes:
      - name: config
        configMap:
          name: myapp-config
      - name: tmp
        emptyDir: {}
      
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: myapp
              topologyKey: kubernetes.io/hostname
```

---

## Service Resources

### ClusterIP Service (Internal)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
  namespace: production
  labels:
    app: myapp
spec:
  type: ClusterIP
  selector:
    app: myapp
  ports:
  - name: http
    port: 80
    targetPort: http
    protocol: TCP
  - name: grpc
    port: 9090
    targetPort: grpc
    protocol: TCP
```

### LoadBalancer Service (External)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-external
  namespace: production
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
spec:
  type: LoadBalancer
  selector:
    app: myapp
  ports:
  - name: http
    port: 80
    targetPort: http
    protocol: TCP
```

### Headless Service (StatefulSet)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-headless
  namespace: production
spec:
  clusterIP: None
  selector:
    app: myapp
  ports:
  - name: http
    port: 8080
    targetPort: 8080
```

---

## Configuration Management

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
  namespace: production
data:
  # Simple key-value
  LOG_LEVEL: "info"
  FEATURE_FLAG_X: "true"
  
  # File content
  app.yaml: |
    server:
      port: 8080
      timeout: 30s
    
    database:
      max_connections: 100
      connection_timeout: 5s
```

### Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secrets
  namespace: production
type: Opaque
data:
  # Base64 encoded values
  database-url: cG9zdGdyZXM6Ly91c2VyOnBhc3NAaG9zdDo1NDMyL2Ri
  api-key: c2VjcmV0LWtleQ==
```

Create secret from literal:
```bash
kubectl create secret generic myapp-secrets \
  --from-literal=database-url='postgres://user:pass@host:5432/db' \
  --from-literal=api-key='secret-key' \
  -n production
```

Create secret from file:
```bash
kubectl create secret generic myapp-tls \
  --from-file=tls.crt=./tls.crt \
  --from-file=tls.key=./tls.key \
  -n production
```

---

## Ingress

### NGINX Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: production
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.example.com
    secretName: myapp-tls
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp
            port:
              number: 80
```

---

## Autoscaling

### HorizontalPodAutoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
```

### VerticalPodAutoscaler (VPA)

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: myapp
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: myapp
      minAllowed:
        cpu: 100m
        memory: 128Mi
      maxAllowed:
        cpu: 2000m
        memory: 2Gi
```

---

## Jobs and CronJobs

### Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: migration
  namespace: production
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 600
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migrate
        image: registry.example.com/myapp:v1.0.0
        command: ["/app/migrate", "up"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: myapp-secrets
              key: database-url
```

### CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cleanup
  namespace: production
spec:
  schedule: "0 2 * * *"  # 2 AM daily
  timeZone: "UTC"
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: cleanup
            image: registry.example.com/myapp:v1.0.0
            command: ["/app/cleanup"]
            resources:
              requests:
                cpu: 100m
                memory: 128Mi
              limits:
                cpu: 500m
                memory: 512Mi
```

---

## StatefulSet (For Stateful Services)

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: production
spec:
  serviceName: kafka-headless
  replicas: 3
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      containers:
      - name: kafka
        image: confluentinc/cp-kafka:8.2.0
        ports:
        - containerPort: 9092
          name: kafka
        volumeMounts:
        - name: data
          mountPath: /var/lib/kafka/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 100Gi
```

---

## PersistentVolumeClaim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myapp-data
  namespace: production
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 10Gi
```

---

## RBAC (ServiceAccount, Role, RoleBinding)

### ServiceAccount

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp
  namespace: production
```

### Role

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: myapp
  namespace: production
rules:
- apiGroups: [""]
  resources: ["configmaps", "secrets"]
  verbs: ["get", "list"]
```

### RoleBinding

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: myapp
  namespace: production
subjects:
- kind: ServiceAccount
  name: myapp
  namespace: production
roleRef:
  kind: Role
  name: myapp
  apiGroup: rbac.authorization.k8s.io
```

---

## kubectl Commands

### Common Operations

```bash
# Apply manifests
kubectl apply -f deployment.yaml

# Apply directory
kubectl apply -f k8s/

# Get resources
kubectl get pods -n production
kubectl get deploy,svc,ing -n production

# Describe resource
kubectl describe pod myapp-xyz -n production

# Logs
kubectl logs -f myapp-xyz -n production
kubectl logs -f deployment/myapp -n production --all-containers

# Execute command in pod
kubectl exec -it myapp-xyz -n production -- /bin/sh

# Port forward
kubectl port-forward svc/myapp 8080:80 -n production

# Scale deployment
kubectl scale deployment myapp --replicas=5 -n production

# Restart deployment
kubectl rollout restart deployment/myapp -n production

# Rollout status
kubectl rollout status deployment/myapp -n production

# Rollback
kubectl rollout undo deployment/myapp -n production

# Get events
kubectl get events -n production --sort-by='.lastTimestamp'
```

### Debugging

```bash
# Debug node issues
kubectl describe node node-name

# Top (resource usage)
kubectl top pods -n production
kubectl top nodes

# Get pod on specific node
kubectl get pods -n production -o wide

# Drain node (for maintenance)
kubectl drain node-name --ignore-daemonsets --delete-emptydir-data

# Cordon node (prevent scheduling)
kubectl cordon node-name

# Uncordon node
kubectl uncordon node-name
```

---

## Kustomize

### Base Manifests (base/deployment.yaml)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: myapp
        image: myapp:latest
```

### Kustomization (base/kustomization.yaml)

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
- deployment.yaml
- service.yaml

configMapGenerator:
- name: myapp-config
  literals:
  - LOG_LEVEL=info
```

### Overlay (overlays/production/kustomization.yaml)

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

bases:
- ../../base

namespace: production

replicas:
- name: myapp
  count: 3

images:
- name: myapp
  newName: registry.example.com/myapp
  newTag: v1.0.0

configMapGenerator:
- name: myapp-config
  behavior: merge
  literals:
  - LOG_LEVEL=warn
```

Apply with:
```bash
kubectl apply -k overlays/production/
```

---

## Best Practices

### Resource Limits

```yaml
# ALWAYS set requests and limits
resources:
  requests:
    cpu: 100m      # Guaranteed CPU
    memory: 128Mi  # Guaranteed memory
  limits:
    cpu: 500m      # Max CPU (throttled if exceeded)
    memory: 512Mi  # Max memory (OOMKilled if exceeded)
```

### Health Checks

```yaml
# Liveness: Is the app alive? (restart if fails)
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 30

# Readiness: Is the app ready for traffic? (remove from service if fails)
readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 10

# Startup: Has the app finished starting? (allow slow startup)
startupProbe:
  httpGet:
    path: /health/startup
    port: 8080
  failureThreshold: 30
  periodSeconds: 5
```

### Security Context

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 65534
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
```

---

## Common Pitfalls

### ❌ No resource limits
- Pods can consume all node resources
- ALWAYS set requests and limits

### ❌ Missing readiness probe
- Pods receive traffic before ready
- ALWAYS add readiness probe

### ❌ Running as root
- Security risk
- ALWAYS use non-root user

### ❌ Using `latest` tag
- Unpredictable deployments
- ALWAYS use specific version tags

### ❌ Not using namespaces
- Resource collisions
- ALWAYS use namespaces for isolation

---

## References

- Kubernetes Documentation: https://kubernetes.io/docs/
- kubectl Cheat Sheet: https://kubernetes.io/docs/reference/kubectl/cheatsheet/
- Best Practices: https://kubernetes.io/docs/concepts/configuration/overview/
