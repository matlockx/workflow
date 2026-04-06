---
name: golang
description: Go development essentials — proverbs, naming, error handling, concurrency, interfaces, testing, project structure, and coding standards. Based on Rob Pike's wisdom, Effective Go, and Google's Go Style Guide.
license: MIT
metadata:
  audience: ai-agents
  language: go
---

# Go Development Skill

Idiomatic Go based on authoritative sources from the language creators.

<!-- AIDEV-NOTE: Trimmed from v1 (~1456 LOC) to essentials (~500 LOC). Dropped
     release notes, obvious patterns, and examples that duplicate stdlib docs.
     Merged coding standards (KISS, DRY, YAGNI, early returns) into this file.
     For full Modern Go (1.22-1.26) features, consult go.dev/doc release notes. -->

## Sources

- [Go Proverbs](https://go-proverbs.github.io/) — Rob Pike's GopherFest 2015
- [Effective Go](https://go.dev/doc/effective_go) — Official idioms
- [Code Review Comments](https://go.dev/wiki/CodeReviewComments) — Review checklist
- [Google Go Style Guide](https://google.github.io/styleguide/go/) — Decisions + best practices

---

## Coding Principles

These apply universally but are especially important in Go.

- **Clear is better than clever.** Write for the next reader.
- **KISS.** Simplest solution that works. No premature optimization.
- **DRY.** Extract common logic, but a little copying is better than a little dependency.
- **YAGNI.** Don't build features before they're needed.
- **Early returns.** Keep the happy path at minimal indentation.
- **No magic numbers.** Name your constants.

```go
// GOOD: Early return, clear flow
func process(r io.Reader) error {
    data, err := io.ReadAll(r)
    if err != nil {
        return fmt.Errorf("reading input: %w", err)
    }

    result, err := transform(data)
    if err != nil {
        return fmt.Errorf("transforming: %w", err)
    }

    return save(result)
}

// BAD: Nested else chains
func process(r io.Reader) error {
    if data, err := io.ReadAll(r); err != nil {
        return err
    } else {
        if result, err := transform(data); err != nil {
            return err
        } else {
            return save(result)
        }
    }
}
```

---

## Go Proverbs (Selected)

### Concurrency

**"Don't communicate by sharing memory, share memory by communicating."**

Two valid approaches — choose based on your use case:
- **Mutex**: Simple state protection. Direct. Use for counters, caches, simple shared state.
- **Channels**: Coordination, pipelines, complex workflows. Use when goroutines need to signal each other.

**"Channels orchestrate; mutexes serialize."**

```go
// Channels orchestrate workflow
results := make(chan Result)
for _, url := range urls {
    go func(u string) {
        results <- fetch(u)
    }(url)
}

// Mutex serializes access
var mu sync.Mutex
mu.Lock()
cache[url] = result
mu.Unlock()
```

### Interfaces

**"The bigger the interface, the weaker the abstraction."**

Best interfaces have one method: `Reader`, `Writer`, `Stringer`, `Closer`.

```go
// GOOD: Compose small interfaces
type EntityReader interface {
    Read(ctx context.Context, id string) (Entity, error)
}
type EntityWriter interface {
    Write(ctx context.Context, e Entity) error
}
type EntityStore interface {
    EntityReader
    EntityWriter
}
```

**"interface{} says nothing."** Avoid `any` unless truly needed.

### Design

**"Make the zero value useful."**

```go
var buf bytes.Buffer // Ready to use
var mu sync.Mutex    // Ready to use

type Server struct {
    Addr    string        // "" means ":http"
    Handler http.Handler  // nil means DefaultServeMux
    Timeout time.Duration // 0 means no timeout
}
```

**"A little copying is better than a little dependency."** Don't import a package for one small function.

### Errors

**"Errors are values."** Program with them, don't just check them.

```go
// errWriter pattern (Rob Pike)
type errWriter struct {
    w   io.Writer
    err error
}

func (ew *errWriter) write(buf []byte) {
    if ew.err != nil { return }
    _, ew.err = ew.w.Write(buf)
}

ew := &errWriter{w: fd}
ew.write(p0)
ew.write(p1)
ew.write(p2)
if ew.err != nil {
    return ew.err
}
```

**"Don't panic."** Use errors for normal failure modes. Panic is for truly unrecoverable situations.

### Safety

- **"With the unsafe package there are no guarantees."** Avoid `unsafe`.
- **"Cgo is not Go."** Significant overhead and complexity.
- **"Gofmt's style is no one's favorite, yet gofmt is everyone's favorite."** Run `gofmt`. Always.
- **"Reflection is never clear."** Avoid `reflect` unless absolutely necessary.

---

## Naming Conventions

### Packages

- Short, concise, lowercase: `time`, `http`, `json`
- No underscores or mixedCaps: `strconv` not `str_conv`
- Avoid generic names: NO `util`, `common`, `misc`, `helper`, `base`
- Singular: `user` not `users`

### Avoid Stutter

```go
// BAD: user.UserService
package user
type UserService struct{}

// GOOD: user.Service
package user
type Service struct{}
func NewService() *Service {}
```

### Variables (Scope-Proportional)

| Scope | Style | Example |
|-------|-------|---------|
| Loop index | Single letter | `i`, `j`, `k` |
| Short function param | Short | `r`, `w`, `buf`, `ctx`, `err` |
| Struct field | Descriptive | `requestTimeout`, `maxConnections` |

### Receivers

Short (1-2 letters), consistent, not `this`/`self`:
```go
func (s *Server) Start() error {}
func (s *Server) Stop() error {}
```

### Initialisms

Keep consistently cased: `userID` not `userId`, `HTTPClient` not `HttpClient`, `APIResponse` not `ApiResponse`.

### Getters

No `Get` prefix: `Name()` not `GetName()`. Setters use `Set` prefix: `SetName()`.

### Interface Names

Single-method: method + `-er`: `Reader`, `Writer`, `Stringer`, `Closer`.

---

## Error Handling

### Always Handle Errors

```go
// BAD: Silent ignore
data, _ := json.Marshal(user)

// GOOD: Handle
data, err := json.Marshal(user)
if err != nil {
    return fmt.Errorf("marshaling user: %w", err)
}

// OK: Document why safe
n, _ := buf.Write(data) // bytes.Buffer.Write never returns error
```

### Error Strings

Lowercase, no punctuation, no "failed to" prefix:
```go
return fmt.Errorf("parsing config: %w", err)   // GOOD
return fmt.Errorf("Failed to parse config: %w", err) // BAD
```

### Wrapping with %w

Preserve the error chain for `errors.Is` / `errors.As`:
```go
if err != nil {
    return fmt.Errorf("querying user %s: %w", id, err)
}
```

### Sentinel Errors

For expected conditions:
```go
var (
    ErrNotFound     = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
)

if errors.Is(err, ErrNotFound) { /* handle */ }
```

### Custom Error Types

For errors with structured data:
```go
type ValidationError struct {
    Field   string
    Message string
}
func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation: %s: %s", e.Field, e.Message)
}

var valErr *ValidationError
if errors.As(err, &valErr) { /* use valErr.Field */ }
```

---

## Interface Design

### Accept Interfaces, Return Structs

```go
func Copy(dst io.Writer, src io.Reader) (int64, error) {} // GOOD
func NewServer(addr string) *Server {}                      // GOOD: concrete return
func NewServer(addr string) ServerInterface {}              // BAD: interface return
```

### Define Interfaces at Consumer

```go
// handler package (consumer) defines what it needs:
type UserGetter interface {
    GetUser(ctx context.Context, id string) (*User, error)
}

// user package (producer) just implements — no interface here:
func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {}
```

---

## Concurrency

### Context Propagation

Always pass `context.Context` as the first parameter. Never store it in structs.

```go
func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
    return s.repo.FindByID(ctx, id)
}
```

### Goroutine Lifetimes

Make goroutine lifetimes explicit. Avoid leaks.

```go
// errgroup for coordinated work
g, ctx := errgroup.WithContext(ctx)
for _, item := range items {
    g.Go(func() error {
        return process(ctx, item)
    })
}
return g.Wait()

// Context for cancellable workers
func worker(ctx context.Context, jobs <-chan Job) {
    for {
        select {
        case <-ctx.Done():
            return
        case job := <-jobs:
            process(job)
        }
    }
}
```

### Prefer Synchronous APIs

Let callers add concurrency:
```go
// GOOD: Synchronous, caller can wrap in goroutine
func Fetch(ctx context.Context, url string) ([]byte, error) { ... }

// BAD: Forces async on all callers
func Fetch(url string) <-chan Result { ... }
```

---

## Common Pitfalls

### Defer in Loops

Defers run on function exit, not loop iteration:
```go
// BAD: Files stay open
for _, path := range paths {
    f, _ := os.Open(path)
    defer f.Close() // Only runs when function exits!
}

// GOOD: Closure scopes the defer
for _, path := range paths {
    func() {
        f, _ := os.Open(path)
        defer f.Close()
        process(f)
    }()
}
```

### Goroutine Leaks

```go
// BAD: Blocks forever if no reader
ch := make(chan Result)
go func() { ch <- doFetch(url) }()

// GOOD: Buffered or context-cancellable
ch := make(chan Result, 1)
go func() { ch <- doFetch(url) }()
```

### Nil Slice vs Empty Slice

Prefer nil slices (work the same, encode to `null` in JSON):
```go
var items []string          // nil — use by default
items := []string{}         // empty — use when JSON [] required
```

### In-Band Errors

```go
// BAD: -1 signals error
func Lookup(key string) int { return -1 }

// GOOD: Explicit ok or error
func Lookup(key string) (int, bool) {}
func Lookup(key string) (int, error) {}
```

---

## Project Structure

```
myservice/
├── cmd/
│   └── server/
│       └── main.go           # Entry point (thin: just wire things)
├── internal/                  # Private packages
│   ├── handler/              # HTTP/gRPC handlers
│   ├── service/              # Business logic
│   ├── repository/           # Data access
│   └── model/                # Domain types
├── pkg/                       # Public packages (use sparingly)
├── api/                       # API definitions (proto, OpenAPI)
├── migrations/               # Database migrations
├── go.mod
└── go.sum                    # Commit this
```

---

## Quick Reference

```bash
gofmt -w .            # Format
goimports -w .        # Format + organize imports
go build ./...        # Build all
go test ./...         # Test all
go test -race ./...   # Test with race detector
go test -cover ./...  # Test with coverage
go vet ./...          # Static analysis
golangci-lint run     # Comprehensive lint
```

### Import Organization

```go
import (
    // Standard library
    "context"
    "fmt"
    "net/http"

    // Third-party
    "github.com/redis/go-redis/v9"
    "golang.org/x/sync/errgroup"

    // Internal
    "myproject/internal/user"
)
```

---

## AIDEV-NOTE: Go skill philosophy

This skill prioritizes Rob Pike's original wisdom and official Go sources. When in
doubt about Go style, consult: 1) Go Proverbs, 2) Effective Go, 3) Code Review
Comments, 4) Google Style Guide — in that order. The goal is idiomatic Go that
any Go programmer can read and maintain. For Modern Go features (1.22-1.26),
consult the official release notes at go.dev/doc.
