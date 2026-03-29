# {{.ServiceName}}

A Go service built with [flachnetz/startup](https://github.com/flachnetz/startup).

## Quick Start

### With Docker Compose

```bash
# Start postgres + service
make docker-up

# View logs
make docker-logs

# Stop
make docker-down
```

### Local Development

```bash
# Start postgres
docker compose up -d postgres

# Run service
make run
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/admin` | GET | Admin panel |
| `/admin/ping` | GET | Simple health check |
| `/admin/metrics` | GET | Prometheus metrics |
| `/api/v1/items` | GET | List all items |
| `/api/v1/items/:id` | GET | Get item by ID |
| `/api/v1/items` | POST | Create item |
| `/api/v1/items/:id` | PUT | Update item |
| `/api/v1/items/:id` | DELETE | Delete item |

## Configuration

All configuration is via CLI flags:

```bash
./server --help

# Common flags:
--postgres          PostgreSQL connection URL
--postgres-pool     Connection pool size (default: 8)
--http-address      Listen address (default: :3080)
--verbose           Enable debug logging
--environment       development|staging|production
```

## Project Structure

```
.
├── cmd/server/         # Application entrypoint
│   └── main.go
├── internal/
│   ├── handler/        # HTTP handlers
│   ├── repository/     # Database access
│   └── service/        # Business logic
├── sql/                # Database migrations
├── Dockerfile
├── docker-compose.yml
└── Makefile
```

## Database Migrations

Migrations are in `sql/` directory and run automatically on startup.

Format: `NNN_description.sql`

```sql
-- +migrate Up
CREATE TABLE ...

-- +migrate Down
DROP TABLE ...
```

## Testing

```bash
make test
make test-coverage
```

## Building

```bash
# Local build
make build

# Docker build
make docker-build
```
