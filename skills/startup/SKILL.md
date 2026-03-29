---
name: startup
description: Use this skill for Go service bootstrapping with flachnetz/startup library. Covers options composition, auto-initialization, Postgres, Kafka, HTTP server, tracing, and environment patterns.
license: MIT
metadata:
  stack: backend
  languages: [go]
---

# Startup Library

Reference for building Go services with the `flachnetz/startup` library.

## Overview

The startup library provides a unified approach to service bootstrapping:
- **CLI flag parsing** with validation via struct tags
- **Auto-initialization** of components via `Initialize()` methods
- **Built-in metrics** for connection pools and HTTP
- **Admin panel** with health checks, pprof, and Prometheus
- **Graceful shutdown** handling

```bash
go get github.com/flachnetz/startup/v2
```

---

## Core Pattern: Options Composition

Embed `*Options` structs to compose your service configuration:

```go
package main

import (
    "github.com/flachnetz/startup/v2"
    "github.com/flachnetz/startup/v2/startup_base"
    "github.com/flachnetz/startup/v2/startup_http"
    "github.com/flachnetz/startup/v2/startup_postgres"
)

type Options struct {
    Base     startup_base.BaseOptions
    Postgres startup_postgres.PostgresOptions
    HTTP     startup_http.HTTPOptions
}

func main() {
    var opts Options

    // Parse CLI flags + auto-initialize all modules
    startup.MustParseCommandLine(&opts)

    // Modules are now ready to use
    db := opts.Postgres.Connection()
    defer db.Close()

    opts.HTTP.Serve(startup_http.Config{
        Name:    "my-service",
        Routing: setupRoutes,
    })
}
```

### How It Works

1. Each embedded struct defines CLI flags via struct tags
2. `MustParseCommandLine` parses flags and validates with `go-playground/validator`
3. For each struct with an `Initialize()` method, startup calls it automatically
4. Initialize methods can depend on previously initialized modules

### Generated CLI Flags

```bash
./my-service --help

# Base options
--verbose           Enable debug logging
--log-json          JSON log format
--environment       development|staging|production

# Postgres options
--postgres          Connection URL (default: postgres://postgres:postgres@localhost:5432)
--postgres-pool     Pool size (default: 8)
--postgres-lifetime Connection max lifetime (default: 10m)

# HTTP options
--http-address      Listen address (default: :3080)
--http-tls-cert     TLS certificate file
--http-tls-key      TLS private key file
```

---

## PostgresOptions

Provides PostgreSQL connections with pgx/sqlx and automatic pool metrics.

### Basic Usage

```go
type Options struct {
    Postgres startup_postgres.PostgresOptions
}

func main() {
    var opts Options
    startup.MustParseCommandLine(&opts)

    // Get *sqlx.DB with connection pool
    db := opts.Postgres.Connection()
    defer db.Close()

    // Use sqlx patterns
    var users []User
    err := db.Select(&users, "SELECT * FROM users WHERE active = $1", true)
}
```

### Connection Pool Settings

```bash
./service \
  --postgres="postgres://user:pass@host:5432/db?sslmode=require" \
  --postgres-pool=16 \
  --postgres-lifetime=15m
```

Pool metrics are automatically registered with `go-metrics`:
- `db.pool.idle` - idle connections
- `db.pool.inuse` - in-use connections
- `db.pool.open` - total open connections

### Query Logging

Enable query logging for debugging:

```bash
./service --enable-query-logging
```

### Migrations with sql-migrate

Use the `Initializer` pattern to run migrations on startup:

```go
type Options struct {
    Postgres startup_postgres.PostgresOptions
}

func main() {
    var opts Options

    // Set initializer before parsing
    opts.Postgres.Inputs.Initializer = startup_postgres.Migration(
        "schema_migrations",  // Migration table name
        "sql",                // Directory with .sql files
    )

    startup.MustParseCommandLine(&opts)

    db := opts.Postgres.Connection()
    // Migrations have already run
}
```

Or use `DefaultMigration` which searches for `sql/` directory:

```go
opts.Postgres.Inputs.Initializer = startup_postgres.DefaultMigration("schema_migrations")
```

Migration files use sql-migrate format:

```sql
-- +migrate Up
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +migrate Down
DROP TABLE users;
```

### Error Helpers

```go
import "github.com/flachnetz/startup/v2/startup_postgres"

_, err := db.Exec("INSERT INTO users (email) VALUES ($1)", email)
if startup_postgres.ErrIsUniqueViolation(err) {
    return errors.New("email already exists")
}
if startup_postgres.ErrIsForeignKeyViolation(err) {
    return errors.New("referenced record not found")
}
```

### Schema Creation

If your connection URL includes `search_path`, the schema is auto-created:

```bash
--postgres="postgres://user:pass@host:5432/db?search_path=myapp"
# Creates: CREATE SCHEMA IF NOT EXISTS myapp
```

---

## KafkaOptions

Provides Kafka consumer setup with confluent-kafka-go.

### Basic Consumer

```go
import (
    "github.com/confluentinc/confluent-kafka-go/v2/kafka"
    "github.com/flachnetz/startup/v2/startup_kafka"
)

type Options struct {
    Kafka startup_kafka.KafkaOptions
}

func main() {
    var opts Options
    startup.MustParseCommandLine(&opts)

    consumer := opts.Kafka.NewConsumer(kafka.ConfigMap{
        // Override defaults here
        "session.timeout.ms": 30000,
    })
    defer consumer.Close()

    consumer.Subscribe("my-topic", nil)

    for {
        msg, err := consumer.ReadMessage(-1)
        if err != nil {
            log.Printf("Consumer error: %v", err)
            continue
        }
        processMessage(msg)
        consumer.CommitMessage(msg)
    }
}
```

### CLI Flags

```bash
./service \
  --kafka-address=kafka1:9092 \
  --kafka-address=kafka2:9092 \
  --kafka-consumer-group=my-service \
  --kafka-offset-reset=smallest \
  --kafka-security-protocol=ssl
```

### Random Consumer Group

For testing or one-off consumers:

```bash
--kafka-consumer-group=RANDOM
# Generates: golang-<timestamp>
```

### Custom Properties

Pass rdkafka properties directly:

```bash
--kafka-property="session.timeout.ms=30000"
--kafka-property="max.poll.interval.ms=300000"
```

---

## HTTPOptions

Provides HTTP server with admin panel, Prometheus, and graceful shutdown.

### Basic Server

```go
import (
    "net/http"

    "github.com/flachnetz/startup/v2/startup_http"
    "github.com/julienschmidt/httprouter"
)

type Options struct {
    HTTP startup_http.HTTPOptions
}

func main() {
    var opts Options
    startup.MustParseCommandLine(&opts)

    opts.HTTP.Serve(startup_http.Config{
        Name: "my-service",
        Routing: func(router *httprouter.Router) http.Handler {
            router.GET("/api/users", listUsers)
            router.POST("/api/users", createUser)
            return router
        },
    })
}

func listUsers(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
    // Handler logic
}
```

### Built-in Admin Panel

The admin panel is automatically available at `/admin`:

| Endpoint | Description |
|----------|-------------|
| `/admin` | Admin dashboard |
| `/admin/ping` | Health check (no auth) |
| `/admin/metrics` | Prometheus metrics |
| `/admin/gc` | Trigger garbage collection |
| `/admin/pprof/*` | Go pprof endpoints |
| `/admin/heap` | Heap dump |
| `/admin/log/level` | GET/POST log level |

### Admin Authentication

```bash
./service \
  --http-admin-username=admin \
  --http-admin-password=secret

# Disable auth (development only)
./service --http-disable-admin-auth
```

### TLS Support

```bash
./service \
  --http-tls-cert=/path/to/cert.pem \
  --http-tls-key=/path/to/key.pem
```

### Access Logging

```bash
# Log to stdout (default)
./service

# Log to file
./service --http-access-log=/var/log/access.log

# Disable access log
./service --http-access-log=/dev/null

# Include admin routes in access log
./service --http-access-log-admin-route
```

### Custom Admin Handlers

```go
import "github.com/flachnetz/go-admin"

opts.HTTP.Serve(startup_http.Config{
    Name: "my-service",
    AdminHandlers: []admin.RouteConfig{
        admin.Describe("Custom status", admin.WithHandlerFunc(
            "", "status",
            func(w http.ResponseWriter, r *http.Request) {
                w.Write([]byte("OK"))
            },
        )),
    },
    Routing: setupRoutes,
})
```

### Graceful Shutdown

The server handles SIGINT and SIGTERM automatically:

1. Stop accepting new connections
2. Wait for in-flight requests to complete
3. Shutdown cleanly

Custom shutdown handler:

```go
opts.HTTP.Serve(startup_http.Config{
    RegisterSignalHandlerForServer: func(server *http.Server) <-chan struct{} {
        // Custom shutdown logic
        return myShutdownChannel
    },
})
```

---

## TracingOptions

Integrates Zipkin tracing via OpenTracing.

```go
import "github.com/flachnetz/startup/v2/startup_tracing"

type Options struct {
    Tracing startup_tracing.TracingOptions
}

func main() {
    var opts Options
    opts.Tracing.Inputs.ServiceName = "my-service"

    startup.MustParseCommandLine(&opts)
    // Global OpenTracing tracer is now configured
}
```

Enable tracing:

```bash
./service --zipkin=http://zipkin:9411/
```

---

## Environment Helpers

BaseOptions provides environment detection:

```go
import "github.com/flachnetz/startup/v2/startup_base"

func main() {
    // Set via --environment flag or STAGE env var
    if startup_base.IsDevelopment() {
        // Enable dev-only features
    }

    if startup_base.IsProduction() {
        // Production-specific config
    }

    env := startup_base.GetEnvironment()
    // Returns: "development", "staging", "production", etc.
}
```

Environment detection:
- `IsDevelopment()`: "development" or "dev"
- `IsTesting()`: "testing" or "test"
- `IsStaging()`: "staging" or "stage"
- `IsProduction()`: "production", "prod", or "live"

---

## Error Handling Patterns

### PanicOnError

Use during initialization - panics halt startup on failure:

```go
config, err := loadConfig()
startup_base.PanicOnError(err, "Failed to load config")
```

### FatalOnError

Use for fatal errors that should log and exit:

```go
db, err := connect()
startup_base.FatalOnError(err, "Database connection failed")
```

### Close Helper

Safely close resources with logging:

```go
defer startup_base.Close(db, "Close database connection")
```

---

## Complete Example: Service with Postgres + Kafka + HTTP

```go
package main

import (
    "context"
    "encoding/json"
    "net/http"

    "github.com/confluentinc/confluent-kafka-go/v2/kafka"
    "github.com/flachnetz/startup/v2"
    "github.com/flachnetz/startup/v2/startup_base"
    "github.com/flachnetz/startup/v2/startup_http"
    "github.com/flachnetz/startup/v2/startup_kafka"
    "github.com/flachnetz/startup/v2/startup_postgres"
    "github.com/jmoiron/sqlx"
    "github.com/julienschmidt/httprouter"
)

type Options struct {
    Base     startup_base.BaseOptions
    Postgres startup_postgres.PostgresOptions
    Kafka    startup_kafka.KafkaOptions
    HTTP     startup_http.HTTPOptions
}

var db *sqlx.DB

func main() {
    var opts Options

    // Configure migrations
    opts.Postgres.Inputs.Initializer = startup_postgres.DefaultMigration("schema_migrations")

    // Parse and initialize
    startup.MustParseCommandLine(&opts)

    // Store db for handlers
    db = opts.Postgres.Connection()
    defer db.Close()

    // Start Kafka consumer in background
    go runConsumer(opts.Kafka)

    // Start HTTP server (blocks)
    opts.HTTP.Serve(startup_http.Config{
        Name:    "my-service",
        Routing: setupRoutes,
    })
}

func setupRoutes(router *httprouter.Router) http.Handler {
    router.GET("/api/users", listUsers)
    router.GET("/api/users/:id", getUser)
    router.POST("/api/users", createUser)
    return router
}

func listUsers(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
    var users []User
    if err := db.Select(&users, "SELECT * FROM users ORDER BY created_at DESC"); err != nil {
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(users)
}

func getUser(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
    var user User
    if err := db.Get(&user, "SELECT * FROM users WHERE id = $1", ps.ByName("id")); err != nil {
        http.Error(w, "Not found", http.StatusNotFound)
        return
    }
    json.NewEncoder(w).Encode(user)
}

func createUser(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
    var input CreateUserInput
    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    var user User
    err := db.Get(&user,
        "INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *",
        input.Email, input.Name,
    )
    if startup_postgres.ErrIsUniqueViolation(err) {
        http.Error(w, "Email already exists", http.StatusConflict)
        return
    }
    if err != nil {
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(user)
}

func runConsumer(kafkaOpts startup_kafka.KafkaOptions) {
    consumer := kafkaOpts.NewConsumer(kafka.ConfigMap{})
    defer consumer.Close()

    consumer.Subscribe("user-events", nil)

    for {
        msg, err := consumer.ReadMessage(-1)
        if err != nil {
            continue
        }
        processEvent(msg)
        consumer.CommitMessage(msg)
    }
}

func processEvent(msg *kafka.Message) {
    // Process Kafka message
}

type User struct {
    ID        int64  `db:"id" json:"id"`
    Email     string `db:"email" json:"email"`
    Name      string `db:"name" json:"name"`
    CreatedAt string `db:"created_at" json:"created_at"`
}

type CreateUserInput struct {
    Email string `json:"email"`
    Name  string `json:"name"`
}
```

Run the service:

```bash
./my-service \
  --postgres="postgres://user:pass@localhost:5432/mydb" \
  --kafka-address=localhost:9092 \
  --kafka-consumer-group=my-service \
  --http-address=:8080 \
  --verbose
```

---

## Best Practices

### 1. Options Struct Organization

```go
type Options struct {
    // Base always first (logging, environment)
    Base startup_base.BaseOptions

    // Infrastructure in dependency order
    Postgres startup_postgres.PostgresOptions
    Kafka    startup_kafka.KafkaOptions

    // HTTP last (usually blocks in Serve)
    HTTP startup_http.HTTPOptions

    // App-specific options
    App AppOptions
}

type AppOptions struct {
    WorkerCount int `long:"workers" default:"4" description:"Number of workers"`
}
```

### 2. Initialization Order

Startup initializes fields in struct order. Ensure dependencies come first:

```go
type Options struct {
    Postgres startup_postgres.PostgresOptions  // Initialized first
    App      AppOptions                         // Can depend on Postgres
}

func (o *AppOptions) Initialize(pg *startup_postgres.PostgresOptions) {
    db := pg.Connection()
    // Use db in app initialization
}
```

### 3. Testing

Mock the database connection for tests:

```go
func TestHandler(t *testing.T) {
    // Use testcontainers or mock
    db, cleanup := setupTestDB(t)
    defer cleanup()

    // Inject into handler
    h := NewHandler(db)
    // Test h
}
```

---

## HTTP Framework Selection

**IMPORTANT: When building a new REST/HTTP service, always ask the user which HTTP framework they prefer before writing any routing code.**

The startup library's `HTTPOptions.Serve` uses `httprouter` internally for its routing callback, but the actual HTTP framework choice for the application layer is a separate decision. The Go HTTP ecosystem is mature and moving — the right choice depends on project needs.

### Present these options to the user

| Framework | Best for | Notes |
|-----------|----------|-------|
| `net/http` (stdlib) | Simple services, minimal deps | Go 1.22+ has pattern-based routing with `http.NewServeMux()`. No external dependency. |
| `github.com/go-chi/chi/v5` | REST APIs, middleware-heavy | Compatible with `net/http`, composable middleware, lightweight. Popular in production. |
| `github.com/julienschmidt/httprouter` | Performance-critical routing | What startup library uses internally. Fast radix-tree router. |
| `github.com/labstack/echo/v4` | Full-featured API framework | Built-in validation, binding, middleware. Heavier but productive. |
| `github.com/gin-gonic/gin` | Familiar to many teams | Large ecosystem, good docs. Uses httprouter under the hood. |

### Integration with startup library

Regardless of framework choice, the startup library's `HTTPOptions.Serve` expects a `Routing` callback that returns an `http.Handler`. All frameworks above implement `http.Handler`, so they all integrate cleanly:

```go
// With chi
opts.HTTP.Serve(startup_http.Config{
    Name: "my-service",
    Routing: func(router *httprouter.Router) http.Handler {
        r := chi.NewRouter()
        r.Use(middleware.Logger)
        r.Get("/api/users", listUsers)
        return r  // chi.Router implements http.Handler
    },
})

// With stdlib (Go 1.22+)
opts.HTTP.Serve(startup_http.Config{
    Name: "my-service",
    Routing: func(router *httprouter.Router) http.Handler {
        mux := http.NewServeMux()
        mux.HandleFunc("GET /api/users", listUsers)
        return mux
    },
})
```

Note: When using an alternative framework, the `*httprouter.Router` parameter from the callback is typically ignored — the startup library provides it, but you return your own handler.

### When the user has no preference

If the user doesn't have a preference, recommend `chi` for REST APIs (lightweight, stdlib-compatible, great middleware) or stdlib `net/http` for simple services with few routes.

---

## AIDEV-NOTE: startup library integration

This skill documents the flachnetz/startup library patterns as the preferred approach
for Go service bootstrapping. The library provides unified CLI parsing, auto-initialization,
and built-in observability. When helping with Go services, prefer these patterns over
manual setup with raw pgx/sqlx/kafka libraries.
