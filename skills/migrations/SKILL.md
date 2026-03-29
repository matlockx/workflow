---
name: migrations
description: Reference for database schema migrations with golang-migrate - creating, applying, and managing database schema changes safely.
license: MIT
metadata:
  stack: backend
  languages: [go]
  database: [postgres, mysql]
---

# Migrations Skill

Reference for managing database schema migrations with golang-migrate.

> **Preferred Approach**: For production Go services using [startup](../startup/SKILL.md),
> use `startup_postgres.Migration()` or `DefaultMigration()` with sql-migrate format.
> Migrations run automatically on service startup. See [startup skill](../startup/SKILL.md).

## Installation

```bash
# macOS
brew install golang-migrate

# Linux
curl -L https://github.com/golang-migrate/migrate/releases/latest/download/migrate.linux-amd64.tar.gz | tar xvz
sudo mv migrate /usr/local/bin/

# Go install
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```

---

## Project Structure

```
myapp/
├── migrations/
│   ├── 000001_create_users_table.up.sql
│   ├── 000001_create_users_table.down.sql
│   ├── 000002_add_email_index.up.sql
│   ├── 000002_add_email_index.down.sql
│   └── ...
└── cmd/
    └── migrate/
        └── main.go
```

---

## Creating Migrations

### CLI

```bash
# Create new migration
migrate create -ext sql -dir migrations -seq create_users_table

# With timestamp
migrate create -ext sql -dir migrations create_users_table

# Creates:
# migrations/000001_create_users_table.up.sql
# migrations/000001_create_users_table.down.sql
```

### Up Migration (000001_create_users_table.up.sql)

```sql
-- Create users table
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index on email
CREATE INDEX idx_users_email ON users(email);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE
    ON users FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### Down Migration (000001_create_users_table.down.sql)

```sql
-- Drop trigger
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop index
DROP INDEX IF EXISTS idx_users_email;

-- Drop table
DROP TABLE IF EXISTS users;
```

---

## Running Migrations

### CLI Commands

```bash
# Set database URL
export DATABASE_URL="postgres://user:pass@localhost:5432/mydb?sslmode=disable"

# Run all pending migrations
migrate -database ${DATABASE_URL} -path migrations up

# Run specific number of migrations
migrate -database ${DATABASE_URL} -path migrations up 2

# Rollback last migration
migrate -database ${DATABASE_URL} -path migrations down 1

# Rollback all migrations
migrate -database ${DATABASE_URL} -path migrations down -all

# Force version (if stuck)
migrate -database ${DATABASE_URL} -path migrations force 1

# Check version
migrate -database ${DATABASE_URL} -path migrations version

# Drop everything (DANGEROUS!)
migrate -database ${DATABASE_URL} -path migrations drop
```

---

## Programmatic Usage (Go)

### Migration Runner

```go
package main

import (
    "database/sql"
    "embed"
    "fmt"
    "log"

    "github.com/golang-migrate/migrate/v4"
    "github.com/golang-migrate/migrate/v4/database/postgres"
    "github.com/golang-migrate/migrate/v4/source/iofs"
    _ "github.com/lib/pq"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func RunMigrations(databaseURL string) error {
    // Open database connection
    db, err := sql.Open("postgres", databaseURL)
    if err != nil {
        return fmt.Errorf("open db: %w", err)
    }
    defer db.Close()

    // Create driver
    driver, err := postgres.WithInstance(db, &postgres.Config{})
    if err != nil {
        return fmt.Errorf("create driver: %w", err)
    }

    // Create source from embedded FS
    source, err := iofs.New(migrationsFS, "migrations")
    if err != nil {
        return fmt.Errorf("create source: %w", err)
    }

    // Create migrate instance
    m, err := migrate.NewWithInstance("iofs", source, "postgres", driver)
    if err != nil {
        return fmt.Errorf("create migrate: %w", err)
    }

    // Run migrations
    if err := m.Up(); err != nil && err != migrate.ErrNoChange {
        return fmt.Errorf("run migrations: %w", err)
    }

    log.Println("migrations completed successfully")
    return nil
}

func main() {
    databaseURL := "postgres://user:pass@localhost:5432/mydb?sslmode=disable"
    if err := RunMigrations(databaseURL); err != nil {
        log.Fatal(err)
    }
}
```

### With CLI Flags

```go
package main

import (
    "flag"
    "log"
    "os"

    "github.com/golang-migrate/migrate/v4"
    _ "github.com/golang-migrate/migrate/v4/database/postgres"
    _ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
    var (
        dbURL      = flag.String("db", os.Getenv("DATABASE_URL"), "database URL")
        migrations = flag.String("migrations", "migrations", "migrations directory")
        command    = flag.String("command", "up", "migration command: up, down, version")
        steps      = flag.Int("steps", 0, "number of migrations to apply")
    )
    flag.Parse()

    m, err := migrate.New("file://"+*migrations, *dbURL)
    if err != nil {
        log.Fatal(err)
    }
    defer m.Close()

    switch *command {
    case "up":
        if *steps > 0 {
            err = m.Steps(*steps)
        } else {
            err = m.Up()
        }
    case "down":
        if *steps > 0 {
            err = m.Steps(-*steps)
        } else {
            err = m.Down()
        }
    case "version":
        version, dirty, err := m.Version()
        if err != nil {
            log.Fatal(err)
        }
        log.Printf("version: %d, dirty: %v", version, dirty)
        return
    default:
        log.Fatalf("unknown command: %s", *command)
    }

    if err != nil && err != migrate.ErrNoChange {
        log.Fatal(err)
    }

    log.Println("migration completed")
}
```

Usage:
```bash
go run cmd/migrate/main.go -command=up
go run cmd/migrate/main.go -command=down -steps=1
go run cmd/migrate/main.go -command=version
```

---

## Migration Patterns

### Adding Column

```sql
-- Up
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- Down
ALTER TABLE users DROP COLUMN phone;
```

### Adding Column with Default (Safe for Large Tables)

```sql
-- Up
ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE NOT NULL;

-- Down
ALTER TABLE users DROP COLUMN is_active;
```

### Renaming Column

```sql
-- Up
ALTER TABLE users RENAME COLUMN username TO user_name;

-- Down
ALTER TABLE users RENAME COLUMN user_name TO username;
```

### Adding Index

```sql
-- Up
CREATE INDEX CONCURRENTLY idx_users_created_at ON users(created_at);

-- Down
DROP INDEX CONCURRENTLY IF EXISTS idx_users_created_at;
```

### Adding Foreign Key

```sql
-- Up
ALTER TABLE posts
    ADD COLUMN user_id BIGINT NOT NULL,
    ADD CONSTRAINT fk_posts_user_id
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;

-- Down
ALTER TABLE posts
    DROP CONSTRAINT fk_posts_user_id,
    DROP COLUMN user_id;
```

### Creating Enum

```sql
-- Up
CREATE TYPE user_role AS ENUM ('admin', 'user', 'guest');
ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'user';

-- Down
ALTER TABLE users DROP COLUMN role;
DROP TYPE user_role;
```

### Data Migration

```sql
-- Up
UPDATE users SET status = 'active' WHERE status IS NULL;

-- Down (if reversible)
UPDATE users SET status = NULL WHERE status = 'active';
```

---

## Makefile Integration

```makefile
DATABASE_URL := postgres://user:pass@localhost:5432/mydb?sslmode=disable
MIGRATIONS_DIR := migrations

.PHONY: migrate-create
migrate-create:
	@read -p "Enter migration name: " name; \
	migrate create -ext sql -dir $(MIGRATIONS_DIR) -seq $$name

.PHONY: migrate-up
migrate-up:
	migrate -database $(DATABASE_URL) -path $(MIGRATIONS_DIR) up

.PHONY: migrate-down
migrate-down:
	migrate -database $(DATABASE_URL) -path $(MIGRATIONS_DIR) down 1

.PHONY: migrate-version
migrate-version:
	migrate -database $(DATABASE_URL) -path $(MIGRATIONS_DIR) version

.PHONY: migrate-force
migrate-force:
	@read -p "Enter version to force: " version; \
	migrate -database $(DATABASE_URL) -path $(MIGRATIONS_DIR) force $$version
```

---

## Docker Integration

### Dockerfile

```dockerfile
FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git
RUN go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

FROM alpine:3.23

RUN apk add --no-cache ca-certificates
COPY --from=builder /go/bin/migrate /usr/local/bin/migrate
COPY migrations /migrations

ENTRYPOINT ["migrate"]
CMD ["-path", "/migrations", "-database", "$DATABASE_URL", "up"]
```

### docker-compose.yml

```yaml
version: '3.9'

services:
  migrate:
    build: .
    environment:
      - DATABASE_URL=postgres://user:pass@postgres:5432/mydb?sslmode=disable
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:18-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=mydb
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 5s
      timeout: 3s
      retries: 5
```

Run:
```bash
docker compose up migrate
```

---

## Kubernetes Job

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
        image: registry.example.com/myapp-migrate:v1.0.0
        command:
        - migrate
        - -path
        - /migrations
        - -database
        - $(DATABASE_URL)
        - up
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: myapp-secrets
              key: database-url
```

---

## Best Practices

### 1. Always Write Down Migrations
- Every up migration MUST have a corresponding down
- Test down migrations

### 2. One Change Per Migration
- Easier to rollback
- Clear migration history

### 3. Use Transactions (Postgres)
```sql
BEGIN;

-- Your migration here

COMMIT;
```

### 4. Use CONCURRENTLY for Indexes
```sql
CREATE INDEX CONCURRENTLY idx_name ON table(column);
-- No table lock, safe for production
```

### 5. Avoid Breaking Changes
- Add columns as nullable first, then add NOT NULL in separate migration
- Rename in multiple steps (add new, copy data, drop old)

### 6. Test Migrations Locally First
```bash
# Test up
make migrate-up

# Test down
make migrate-down

# Test idempotency
make migrate-up
```

---

## Common Pitfalls

### ❌ No down migration
- Can't rollback if needed
- ALWAYS write down migrations

### ❌ Data loss in down migration
- Down should be reversible when possible
- Document if data loss expected

### ❌ Long-running migrations in production
- Block deployments
- Consider online schema changes

### ❌ Forgetting to commit migration files
- Migrations exist locally but not in Git
- ALWAYS commit .up.sql and .down.sql together

### ❌ Forcing version without fixing
- Leaves database in inconsistent state
- Only force after manual fix

---

## References

- golang-migrate: https://github.com/golang-migrate/migrate
- PostgreSQL Concurrent Indexes: https://www.postgresql.org/docs/current/sql-createindex.html
- Safe Migrations: https://www.braintreepayments.com/blog/safe-operations-for-high-volume-postgresql/
