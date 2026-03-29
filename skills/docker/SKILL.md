---
name: docker
description: Reference for containerizing Go/Rust backend services - multi-stage builds, optimization, security, and best practices.
license: MIT
metadata:
  stack: backend
  languages: [go, rust]
---

# Docker Skill

Reference for containerizing backend services with Docker.

## Multi-Stage Build Pattern (Go)

### Production-Ready Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# Build stage
FROM golang:1.26-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build with optimizations
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -o /app/server \
    ./cmd/server

# Final stage
FROM scratch

# Copy CA certs for HTTPS
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy timezone data (if needed)
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copy binary
COPY --from=builder /app/server /server

# Non-root user
USER 65534:65534

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/server", "healthcheck"]

ENTRYPOINT ["/server"]
```

### With CGO Dependencies (librdkafka, etc.)

```dockerfile
FROM golang:1.26-alpine AS builder

# Install build deps including CGO libs
RUN apk add --no-cache git ca-certificates tzdata gcc musl-dev \
    librdkafka-dev pkgconf

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build with CGO enabled
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s' \
    -o /app/server \
    ./cmd/server

# Runtime stage with necessary libraries
FROM alpine:3.23

RUN apk add --no-cache ca-certificates tzdata librdkafka

COPY --from=builder /app/server /server

USER 65534:65534
EXPOSE 8080

ENTRYPOINT ["/server"]
```

---

## Docker Compose (Local Development)

### Example compose.yml

```yaml
version: '3.9'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://user:pass@postgres:5432/mydb
      - KAFKA_BROKERS=kafka:9092
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
      redis:
        condition: service_healthy
    volumes:
      - .:/app
    restart: unless-stopped

  postgres:
    image: postgres:18-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=mydb
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:8-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  kafka:
    image: confluentinc/cp-kafka:8.2.0
    ports:
      - "9092:9092"
    environment:
      - KAFKA_BROKER_ID=1
      - KAFKA_ZOOKEEPER_CONNECT=zookeeper:2181
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092
      - KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1
    depends_on:
      - zookeeper

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      - ZOOKEEPER_CLIENT_PORT=2181
      - ZOOKEEPER_TICK_TIME=2000

volumes:
  postgres_data:
  redis_data:
```

---

## Development Dockerfile

### Hot Reload with Air

```dockerfile
# Dockerfile.dev
FROM golang:1.26-alpine

RUN apk add --no-cache git

# Install air for hot reload
RUN go install github.com/cosmtrek/air@latest

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

CMD ["air", "-c", ".air.toml"]
```

### .air.toml Configuration

```toml
root = "."
tmp_dir = "tmp"

[build]
  bin = "./tmp/main"
  cmd = "go build -o ./tmp/main ./cmd/server"
  delay = 1000
  exclude_dir = ["tmp", "vendor", "testdata"]
  exclude_file = []
  exclude_regex = ["_test.go"]
  exclude_unchanged = false
  follow_symlink = false
  full_bin = ""
  include_dir = []
  include_ext = ["go", "tpl", "tmpl", "html"]
  kill_delay = "0s"
  log = "build-errors.log"
  send_interrupt = false
  stop_on_error = true

[color]
  app = ""
  build = "yellow"
  main = "magenta"
  runner = "green"
  watcher = "cyan"

[log]
  time = false

[misc]
  clean_on_exit = false
```

---

## Optimization Techniques

### Layer Caching

```dockerfile
# ✅ GOOD: Copy dependency files first (cached unless changed)
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o server ./cmd/server

# ❌ BAD: Copy everything first (cache busted on any file change)
COPY . .
RUN go mod download
RUN go build -o server ./cmd/server
```

### Build Arguments

```dockerfile
ARG GO_VERSION=1.22
FROM golang:${GO_VERSION}-alpine AS builder

ARG VERSION=dev
ARG BUILD_TIME

RUN go build \
    -ldflags="-X main.Version=${VERSION} -X main.BuildTime=${BUILD_TIME}" \
    -o /app/server \
    ./cmd/server
```

Build with:
```bash
docker build \
  --build-arg VERSION=$(git describe --tags) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t myapp:latest .
```

### Image Size Reduction

```dockerfile
# Use alpine for smaller base
FROM golang:1.26-alpine  # ~300MB

# Or distroless for production
FROM gcr.io/distroless/static-debian12  # ~2MB

# Or scratch for smallest size
FROM scratch  # ~0MB (just your binary)
```

---

## Security Best Practices

### Non-Root User

```dockerfile
# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

# Change ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Or use numeric UID (works with scratch)
USER 65534:65534
```

### Secrets Management

```dockerfile
# ❌ BAD: Secrets in ENV
ENV DATABASE_PASSWORD=supersecret

# ✅ GOOD: Use Docker secrets or runtime env
# Pass at runtime:
docker run -e DATABASE_PASSWORD=$DB_PASS myapp

# Or use secrets (Swarm/K8s):
docker secret create db_password ./password.txt
```

### Vulnerability Scanning

```bash
# Scan image for vulnerabilities
docker scout cve myapp:latest

# Or use Trivy
trivy image myapp:latest
```

---

## .dockerignore

```
# Git
.git
.gitignore

# CI/CD
.github
.gitlab-ci.yml

# Documentation
*.md
docs/

# Development
tmp/
.air.toml
Dockerfile.dev
docker-compose.yml

# Dependencies
vendor/

# Build artifacts
*.exe
*.dll
*.so
*.dylib

# Test files
*_test.go
testdata/

# IDE
.vscode/
.idea/
*.swp
*.swo

# Environment
.env
.env.*
!.env.example
```

---

## Makefile Integration

```makefile
IMAGE_NAME := myapp
VERSION := $(shell git describe --tags --always --dirty)

.PHONY: docker-build
docker-build:
	docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg BUILD_TIME=$(shell date -u +%Y-%m-%dT%H:%M:%SZ) \
		-t $(IMAGE_NAME):$(VERSION) \
		-t $(IMAGE_NAME):latest \
		.

.PHONY: docker-run
docker-run:
	docker run --rm -it \
		-p 8080:8080 \
		-e DATABASE_URL=$(DATABASE_URL) \
		$(IMAGE_NAME):latest

.PHONY: docker-push
docker-push:
	docker push $(IMAGE_NAME):$(VERSION)
	docker push $(IMAGE_NAME):latest

.PHONY: docker-compose-up
docker-compose-up:
	docker compose up -d

.PHONY: docker-compose-down
docker-compose-down:
	docker compose down -v

.PHONY: docker-compose-logs
docker-compose-logs:
	docker compose logs -f
```

---

## Common Pitfalls

### ❌ Running as root
```dockerfile
# Security risk - always use non-root user
USER root  # BAD
```

### ❌ Large image sizes
```dockerfile
# Including unnecessary files
COPY . .  # Copies everything including .git, node_modules, etc.
# Solution: Use .dockerignore
```

### ❌ Secrets in layers
```dockerfile
# Secrets remain in image layers even if deleted later
RUN echo "secret" > /tmp/secret && \
    use_secret && \
    rm /tmp/secret  # Still in layer history!
# Solution: Use multi-stage builds or runtime secrets
```

### ❌ No health checks
```dockerfile
# Container may be "running" but not healthy
# ALWAYS add HEALTHCHECK instruction
```

### ❌ Hardcoded values
```dockerfile
ENV DATABASE_URL=postgres://localhost:5432  # BAD
# Solution: Pass via docker run -e or compose environment
```

---

## Testing Containers

### Test Script

```bash
#!/bin/bash
set -e

# Build image
docker build -t myapp:test .

# Run container
CONTAINER_ID=$(docker run -d -p 8080:8080 myapp:test)

# Wait for health check
echo "Waiting for container to be healthy..."
for i in {1..30}; do
  if docker inspect --format='{{.State.Health.Status}}' $CONTAINER_ID | grep -q healthy; then
    echo "Container is healthy"
    break
  fi
  sleep 1
done

# Test endpoint
curl -f http://localhost:8080/health || exit 1

# Cleanup
docker stop $CONTAINER_ID
docker rm $CONTAINER_ID

echo "Tests passed!"
```

---

## References

- Docker Best Practices: https://docs.docker.com/develop/dev-best-practices/
- Multi-stage builds: https://docs.docker.com/build/building/multi-stage/
- Docker Compose: https://docs.docker.com/compose/
- Distroless Images: https://github.com/GoogleContainerTools/distroless
