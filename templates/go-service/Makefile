.PHONY: build run test clean docker-build docker-up docker-down

# Variables
BINARY_NAME=server
MODULE={{.Module}}

# Build
build:
	go build -o bin/$(BINARY_NAME) ./cmd/server

# Run locally
run: build
	./bin/$(BINARY_NAME) \
		--postgres="postgres://postgres:postgres@localhost:5432/{{.ServiceName}}?sslmode=disable" \
		--http-address=:3080 \
		--verbose

# Run tests
test:
	go test -v -race ./...

# Run tests with coverage
test-coverage:
	go test -v -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

# Clean build artifacts
clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

# Docker
docker-build:
	docker build -t {{.ServiceName}}:latest .

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f service

# Development
dev: docker-up
	@echo "Service running at http://localhost:3080"
	@echo "Admin panel at http://localhost:3080/admin"

# Lint
lint:
	golangci-lint run ./...

# Format
fmt:
	go fmt ./...
	goimports -w .

# Dependencies
deps:
	go mod download
	go mod tidy

# Generate (if needed)
generate:
	go generate ./...
