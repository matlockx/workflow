---
name: postgres
description: PostgreSQL best practices for Go services, covering schema design, migrations, connection pooling, query patterns, and optimization. Use when working with PostgreSQL databases.
---

# PostgreSQL Best Practices

Reference card for PostgreSQL development in Go services.

> **Preferred Approach**: For production Go services, use the [startup](../startup/SKILL.md) library
> which provides `PostgresOptions` with automatic connection pooling, metrics, and migrations.
> See [startup skill](../startup/SKILL.md) for patterns.

## When to Activate

- Designing database schemas
- Writing migrations
- Implementing data access layer
- Optimizing slow queries
- Debugging connection pool issues
- Setting up new database connections

## Connection Libraries

### pgx (Recommended for Performance)

```go
import (
    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
)

// Connection pool (recommended)
pool, err := pgxpool.New(ctx, "postgres://user:pass@localhost:5432/dbname")
if err != nil {
    return fmt.Errorf("failed to create pool: %w", err)
}
defer pool.Close()

// Query
var name string
err = pool.QueryRow(ctx, "SELECT name FROM users WHERE id = $1", userID).Scan(&name)

// Exec
_, err = pool.Exec(ctx, "UPDATE users SET name = $1 WHERE id = $2", name, id)
```

### sqlx (Familiar sql.DB Extension)

```go
import "github.com/jmoiron/sqlx"

db, err := sqlx.Connect("postgres", "postgres://user:pass@localhost:5432/dbname")
if err != nil {
    return err
}
defer db.Close()

// Struct scanning
type User struct {
    ID   int    `db:"id"`
    Name string `db:"name"`
}

var users []User
err = db.Select(&users, "SELECT id, name FROM users WHERE active = $1", true)
```

## Connection Pool Configuration

```go
// pgxpool config
config, err := pgxpool.ParseConfig("postgres://user:pass@localhost:5432/dbname")
config.MaxConns = 25                          // Max connections
config.MinConns = 5                           // Keep-alive connections
config.MaxConnLifetime = time.Hour            // Recycle after 1h
config.MaxConnIdleTime = 30 * time.Minute     // Close idle after 30m
config.HealthCheckPeriod = time.Minute        // Health check interval

pool, err := pgxpool.NewWithConfig(ctx, config)
```

**Rules of thumb:**
- MaxConns = (CPU cores * 2) + effective_spindle_count
- For cloud DBs: Start with 10-25, monitor and adjust
- MinConns = 20-30% of MaxConns

## Schema Design Best Practices

### Naming Conventions

```sql
-- Tables: plural, snake_case
CREATE TABLE users (...);
CREATE TABLE order_items (...);

-- Columns: snake_case
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email_address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes: <table>_<columns>_idx
CREATE INDEX users_email_address_idx ON users(email_address);

-- Foreign keys: fk_<from_table>_<to_table>
ALTER TABLE orders ADD CONSTRAINT fk_orders_users
    FOREIGN KEY (user_id) REFERENCES users(id);
```

### Primary Keys

```sql
-- BIGSERIAL (auto-increment, 8-byte)
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    ...
);

-- UUID (distributed systems, no central sequence)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ...
);

-- When to use UUID:
-- ✅ Multi-region writes
-- ✅ Need to generate IDs client-side
-- ✅ Want to hide growth rate
-- ❌ Small tables (BIGSERIAL faster)
-- ❌ High write volume (UUIDs are random, no locality)
```

### Indexes

```sql
-- B-tree (default, most queries)
CREATE INDEX users_email_idx ON users(email);

-- Partial index (subset of rows)
CREATE INDEX active_users_email_idx ON users(email)
    WHERE deleted_at IS NULL;

-- Composite index (order matters!)
CREATE INDEX orders_user_created_idx ON orders(user_id, created_at DESC);
-- Good: WHERE user_id = ? ORDER BY created_at DESC
-- Bad:  WHERE created_at > ? (doesn't use index)

-- GIN index (JSONB, arrays, full-text)
CREATE INDEX users_metadata_idx ON users USING GIN(metadata);

-- GiST index (geometric, full-text)
CREATE INDEX locations_point_idx ON locations USING GIST(point);
```

### Constraints

```sql
-- NOT NULL (always prefer over NULL when possible)
CREATE TABLE users (
    email TEXT NOT NULL,
    phone TEXT  -- NULL allowed
);

-- UNIQUE
CREATE TABLE users (
    email TEXT NOT NULL UNIQUE
);

-- CHECK constraints
CREATE TABLE products (
    price DECIMAL(10,2) CHECK (price >= 0),
    status TEXT CHECK (status IN ('draft', 'published', 'archived'))
);

-- Foreign keys with actions
ALTER TABLE orders ADD CONSTRAINT fk_orders_users
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE;  -- Options: CASCADE, SET NULL, RESTRICT
```

### Timestamps

```sql
-- Always use TIMESTAMPTZ (timestamp with timezone)
CREATE TABLE events (
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## Migrations

### golang-migrate

```bash
# Install
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Create migration
migrate create -ext sql -dir migrations -seq create_users_table

# Results in:
# migrations/000001_create_users_table.up.sql
# migrations/000001_create_users_table.down.sql

# Run migrations
migrate -path migrations -database "postgres://user:pass@localhost:5432/dbname?sslmode=disable" up

# Rollback
migrate -path migrations -database "..." down 1
```

### Migration File Pattern

```sql
-- 000001_create_users_table.up.sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX users_email_idx ON users(email);

-- 000001_create_users_table.down.sql
DROP TABLE IF EXISTS users;
```

### Migration Best Practices

```sql
-- ✅ GOOD: Idempotent, safe
CREATE TABLE IF NOT EXISTS users (...);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- ❌ BAD: Will fail if run twice
CREATE TABLE users (...);
CREATE INDEX users_email_idx ON users(email);

-- ✅ GOOD: Add column with default (fast, no table rewrite)
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- ❌ BAD: Adding NOT NULL without default requires backfill
ALTER TABLE users ADD COLUMN status TEXT NOT NULL;  -- FAILS if rows exist

-- ✅ GOOD: Safe column removal (3-step process)
-- Step 1: Stop using column in code, deploy
-- Step 2: Drop column
ALTER TABLE users DROP COLUMN old_field;

-- ✅ GOOD: Rename with backwards compat
-- Step 1: Add new column, copy data
ALTER TABLE users ADD COLUMN email_address TEXT;
UPDATE users SET email_address = email;
-- Step 2: Update code to use email_address
-- Step 3: Drop old column
ALTER TABLE users DROP COLUMN email;
```

## Query Patterns

### Parameterized Queries (Prevent SQL Injection)

```go
// ✅ ALWAYS: Use placeholders
_, err := pool.Exec(ctx,
    "INSERT INTO users (name, email) VALUES ($1, $2)",
    name, email)

// ❌ NEVER: Concatenate strings
query := fmt.Sprintf("INSERT INTO users (name) VALUES ('%s')", name)  // INJECTION!
```

### Transactions

```go
// pgx transaction
tx, err := pool.Begin(ctx)
if err != nil {
    return err
}
defer tx.Rollback(ctx)  // Rollback if not committed

_, err = tx.Exec(ctx, "UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, fromID)
if err != nil {
    return err
}

_, err = tx.Exec(ctx, "UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, toID)
if err != nil {
    return err
}

return tx.Commit(ctx)
```

### Batch Inserts

```go
// pgx batch
batch := &pgx.Batch{}
for _, user := range users {
    batch.Queue("INSERT INTO users (name, email) VALUES ($1, $2)", user.Name, user.Email)
}

br := pool.SendBatch(ctx, batch)
defer br.Close()

for range users {
    _, err := br.Exec()
    if err != nil {
        return err
    }
}
```

### Efficient Pagination

```go
// ✅ GOOD: Keyset pagination (cursor-based)
rows, err := pool.Query(ctx,
    "SELECT id, name FROM users WHERE id > $1 ORDER BY id LIMIT $2",
    lastID, pageSize)

// ❌ BAD: OFFSET pagination (slow for large offsets)
rows, err := pool.Query(ctx,
    "SELECT id, name FROM users ORDER BY id LIMIT $1 OFFSET $2",
    pageSize, page*pageSize)
```

### JSONB Queries

```go
// Store JSONB
_, err := pool.Exec(ctx,
    "INSERT INTO users (id, metadata) VALUES ($1, $2)",
    id, map[string]interface{}{"plan": "premium"})

// Query JSONB field
var plan string
err = pool.QueryRow(ctx,
    "SELECT metadata->>'plan' FROM users WHERE id = $1",
    id).Scan(&plan)

// Query with JSONB condition
rows, err := pool.Query(ctx,
    "SELECT id FROM users WHERE metadata->>'plan' = $1",
    "premium")
```

## Performance Optimization

### EXPLAIN ANALYZE

```sql
-- Show query plan with actual execution stats
EXPLAIN ANALYZE
SELECT u.name, o.total
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE u.active = true;

-- Look for:
-- - Seq Scan (bad for large tables, add index)
-- - Index Scan (good)
-- - High execution time
-- - High row counts
```

### Common Query Issues

```sql
-- ❌ N+1 Query Problem
for _, order := range orders {
    // Queries DB for each order's user
    user := getUser(order.UserID)  // BAD
}

-- ✅ Join or batch load
SELECT o.*, u.name
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.status = 'active';
```

### Missing Index Symptoms

```sql
-- Find missing indexes (run after load testing)
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND n_distinct > 100
ORDER BY abs(correlation) ASC;

-- Find slow queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

## Common Pitfalls

### 1. Not Using Connection Pooling

```go
// ❌ BAD: New connection per request
db, _ := pgx.Connect(ctx, connString)
defer db.Close(ctx)

// ✅ GOOD: Reuse pool
pool, _ := pgxpool.New(ctx, connString)  // Create once at startup
defer pool.Close()
```

### 2. Not Handling NULL

```go
// Use sql.Null* types or pointers
type User struct {
    Name  string
    Phone *string  // NULL becomes nil
}

var phone sql.NullString
err = row.Scan(&name, &phone)
if phone.Valid {
    fmt.Println(phone.String)
}
```

### 3. Forgetting Context Timeouts

```go
// ✅ Always pass context with timeout
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

rows, err := pool.Query(ctx, "SELECT ...")
```

### 4. Not Closing Rows

```go
rows, err := pool.Query(ctx, "SELECT ...")
if err != nil {
    return err
}
defer rows.Close()  // MUST close to return connection to pool

for rows.Next() {
    // ...
}
```

## Health Checks

```go
func (db *DB) HealthCheck(ctx context.Context) error {
    ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
    defer cancel()

    return db.pool.Ping(ctx)
}
```

## Reference

- [pgx Documentation](https://pkg.go.dev/github.com/jackc/pgx/v5)
- [PostgreSQL Best Practices](https://wiki.postgresql.org/wiki/Don%27t_Do_This)
- [Use The Index, Luke](https://use-the-index-luke.com/) - SQL indexing guide
