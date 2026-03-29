---
name: cicd
description: Reference for GitHub Actions CI/CD pipelines for Go backend services - testing, building, and deploying containerized applications.
license: MIT
metadata:
  stack: backend
  languages: [go]
  cicd: [github-actions]
---

# CI/CD Skill

Reference for GitHub Actions pipelines for Go backend services.

## Basic Workflow Structure

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  GO_VERSION: '1.22'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      - name: Set up Go
        uses: actions/setup-go@v6
        with:
          go-version: ${{ env.GO_VERSION }}
          cache: true
      
      - name: Run tests
        run: go test -v -race -coverprofile=coverage.out ./...
      
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage.out
```

---

## Complete CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  GO_VERSION: '1.22'
  POSTGRES_VERSION: '16'

jobs:
  # Linting and formatting
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      - name: Set up Go
        uses: actions/setup-go@v6
        with:
          go-version: ${{ env.GO_VERSION }}
          cache: true
      
      - name: golangci-lint
        uses: golangci/golangci-lint-action@v4
        with:
          version: latest
          args: --timeout=5m
  
  # Unit tests
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      - name: Set up Go
        uses: actions/setup-go@v6
        with:
          go-version: ${{ env.GO_VERSION }}
          cache: true
      
      - name: Run unit tests
        run: go test -v -race -coverprofile=coverage.out ./...
      
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          file: ./coverage.out
  
  # Integration tests
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:${{ env.POSTGRES_VERSION }}
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      redis:
        image: redis:8-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v6
      
      - name: Set up Go
        uses: actions/setup-go@v6
        with:
          go-version: ${{ env.GO_VERSION }}
          cache: true
      
      - name: Run migrations
        run: |
          go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
          migrate -path migrations -database "postgres://test:test@localhost:5432/testdb?sslmode=disable" up
      
      - name: Run integration tests
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/testdb?sslmode=disable
          REDIS_URL: redis://localhost:6379
        run: go test -v -tags=integration ./...
  
  # Security scanning
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      - name: Run Gosec
        uses: securego/gosec@master
        with:
          args: ./...
      
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'
      
      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-results.sarif'
```

---

## Build and Push Docker Image

```yaml
# .github/workflows/build.yml
name: Build and Push

on:
  push:
    branches: [main]
    tags:
      - 'v*'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v6
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix={{branch}}-
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            VERSION=${{ github.ref_name }}
            BUILD_TIME=${{ github.event.head_commit.timestamp }}
```

---

## Deploy to Kubernetes

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    tags:
      - 'v*'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    
    steps:
      - uses: actions/checkout@v6
      
      - name: Install kubectl
        uses: azure/setup-kubectl@v3
        with:
          version: 'latest'
      
      - name: Configure kubectl
        run: |
          echo "${{ secrets.KUBECONFIG }}" | base64 -d > $HOME/.kube/config
      
      - name: Deploy with kubectl
        run: |
          kubectl set image deployment/myapp \
            myapp=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.ref_name }} \
            -n production
          
          kubectl rollout status deployment/myapp -n production
      
      - name: Verify deployment
        run: |
          kubectl get deployment myapp -n production
          kubectl get pods -n production -l app=myapp
```

---

## Deploy with Helm

```yaml
# .github/workflows/deploy-helm.yml
name: Deploy with Helm

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    
    steps:
      - uses: actions/checkout@v6
      
      - name: Install Helm
        uses: azure/setup-helm@v3
        with:
          version: 'latest'
      
      - name: Configure kubectl
        run: |
          echo "${{ secrets.KUBECONFIG }}" | base64 -d > $HOME/.kube/config
      
      - name: Deploy with Helm
        run: |
          helm upgrade --install myapp ./helm/myapp \
            --namespace production \
            --create-namespace \
            --set image.tag=${{ github.ref_name }} \
            --set replicaCount=3 \
            --wait \
            --timeout 5m
```

---

## GitOps with Argo CD

```yaml
# .github/workflows/gitops.yml
name: GitOps Update

on:
  push:
    tags:
      - 'v*'

jobs:
  update-manifests:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout manifests repo
        uses: actions/checkout@v6
        with:
          repository: example/k8s-manifests
          token: ${{ secrets.GITOPS_TOKEN }}
      
      - name: Update image tag
        run: |
          cd overlays/production
          kustomize edit set image myapp=ghcr.io/${{ github.repository }}:${{ github.ref_name }}
      
      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .
          git commit -m "Update myapp to ${{ github.ref_name }}"
          git push
```

---

## Matrix Testing (Multiple Go Versions)

```yaml
name: Test Matrix

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        go-version: ['1.21', '1.22', '1.23']
        os: [ubuntu-latest, macos-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v6
      
      - name: Set up Go
        uses: actions/setup-go@v6
        with:
          go-version: ${{ matrix.go-version }}
          cache: true
      
      - name: Run tests
        run: go test -v ./...
```

---

## Conditional Workflows

```yaml
name: Deploy

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'Dockerfile'
      - '.github/workflows/deploy.yml'

jobs:
  deploy:
    # Only run on main branch
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying..."
```

---

## Reusable Workflows

### Caller Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    uses: ./.github/workflows/test-reusable.yml
    with:
      go-version: '1.22'
  
  build:
    needs: test
    uses: ./.github/workflows/build-reusable.yml
    secrets: inherit
```

### Reusable Workflow

```yaml
# .github/workflows/test-reusable.yml
name: Test (Reusable)

on:
  workflow_call:
    inputs:
      go-version:
        required: true
        type: string

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      - name: Set up Go
        uses: actions/setup-go@v6
        with:
          go-version: ${{ inputs.go-version }}
          cache: true
      
      - name: Run tests
        run: go test -v ./...
```

---

## Caching

```yaml
- name: Cache Go modules
  uses: actions/cache@v5
  with:
    path: |
      ~/.cache/go-build
      ~/go/pkg/mod
    key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
    restore-keys: |
      ${{ runner.os }}-go-

- name: Cache Docker layers
  uses: actions/cache@v5
  with:
    path: /tmp/.buildx-cache
    key: ${{ runner.os }}-buildx-${{ github.sha }}
    restore-keys: |
      ${{ runner.os }}-buildx-
```

---

## Secrets Management

### Using GitHub Secrets

```yaml
steps:
  - name: Deploy
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      API_KEY: ${{ secrets.API_KEY }}
    run: ./deploy.sh
```

### Multiple Environments

```yaml
jobs:
  deploy-staging:
    environment: staging
    steps:
      - run: echo "Deploying to staging"
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
  
  deploy-production:
    environment: production
    needs: deploy-staging
    steps:
      - run: echo "Deploying to production"
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

## Notifications

### Slack

```yaml
- name: Notify Slack on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "CI failed on ${{ github.repository }}",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "Workflow *${{ github.workflow }}* failed\nBranch: `${{ github.ref_name }}`\nCommit: <${{ github.event.head_commit.url }}|${{ github.sha }}>"
            }
          }
        ]
      }
```

---

## Best Practices

### 1. Use Dependency Caching
```yaml
- uses: actions/setup-go@v6
  with:
    go-version: '1.22'
    cache: true  # Enables automatic caching
```

### 2. Fail Fast
```yaml
strategy:
  fail-fast: true  # Stop all jobs if one fails
  matrix:
    go-version: ['1.21', '1.22']
```

### 3. Use Environments for Protection
- Require approvals
- Set deployment branch restrictions
- Configure secrets per environment

### 4. Pin Action Versions
```yaml
# ✅ GOOD: Pin to SHA
- uses: actions/checkout@8e5e7e5ab8b370d6c329ec480221332ada57f0ab

# ❌ BAD: Use latest
- uses: actions/checkout@main
```

### 5. Limit Permissions
```yaml
permissions:
  contents: read
  packages: write
  # Only grant what's needed
```

---

## Common Pitfalls

### ❌ No caching
- Slow builds
- High costs

### ❌ Running tests without services
- Integration tests fail
- Use `services:` for dependencies

### ❌ Not using environments
- No approval gates
- Same secrets for all environments

### ❌ Secrets in logs
- Never echo secrets
- Use `::add-mask::` if needed

### ❌ Heavy matrix builds
- Expensive and slow
- Only test what's necessary

---

## References

- GitHub Actions: https://docs.github.com/en/actions
- Go Setup Action: https://github.com/actions/setup-go
- Docker Build Action: https://github.com/docker/build-push-action
