---
name: golang
description: Comprehensive Go development skill based on Rob Pike's wisdom, Go Proverbs, Effective Go, and Google's Go Style Guide. Use this skill when writing Go code, reviewing Go PRs, or making architectural decisions in Go projects.
---

# Go Development Skill

Idiomatic Go development based on authoritative sources from the language creators.

> **Note**: Code examples assume standard imports (`context`, `errors`, `fmt`, `io`, `net/http`, `sync`, `time`, etc.) unless otherwise shown.

## Sources

This skill synthesizes wisdom from:

- [Go Proverbs](https://go-proverbs.github.io/) — Rob Pike's GopherFest 2015 talk
- [Effective Go](https://go.dev/doc/effective_go) — Official idioms guide
- [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments) — Review checklist
- [Google Go Style Guide](https://google.github.io/styleguide/go/) — Comprehensive decisions
- [Errors are values](https://go.dev/blog/errors-are-values) — Rob Pike on error handling
- [Package names](https://go.dev/blog/package-names) — Naming philosophy

**Release Notes** (for Modern Go section):
- [Go 1.22](https://go.dev/doc/go1.22) — Loop var fix, range over int, enhanced routing
- [Go 1.23](https://go.dev/doc/go1.23) — Range over functions, iter package
- [Go 1.24](https://go.dev/doc/go1.24) — Generic type aliases, B.Loop, AddCleanup
- [Go 1.25](https://go.dev/doc/go1.25) — Container GOMAXPROCS, WaitGroup.Go, synctest
- [Go 1.26](https://go.dev/doc/go1.26) — new(expr), errors.AsType

---

## Go Proverbs

*"Simple, Poetic, Pithy"* — Rob Pike

These proverbs capture the essence of Go philosophy. Internalize them.

### Concurrency

#### "Don't communicate by sharing memory, share memory by communicating."

Two valid approaches — choose based on your use case:

```go
// APPROACH A: Mutex — simple, direct, appropriate for basic state protection
type Counter struct {
    mu    sync.Mutex
    value int
}

func (c *Counter) Inc() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.value++
}

func (c *Counter) Value() int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.value
}

// APPROACH B: Channels — for coordination, pipelines, or complex workflows
type Counter struct {
    inc  chan struct{}
    get  chan int
    done chan struct{}
}

func NewCounter() *Counter {
    c := &Counter{
        inc:  make(chan struct{}),
        get:  make(chan int),
        done: make(chan struct{}),
    }
    go c.run()
    return c
}

func (c *Counter) run() {
    var value int
    for {
        select {
        case <-c.inc:
            value++
        case c.get <- value:
        case <-c.done:
            return // Clean shutdown
        }
    }
}

func (c *Counter) Close() {
    close(c.done)
}
```

#### "Concurrency is not parallelism."

Concurrency is about *structure*; parallelism is about *execution*. Design for concurrency (composition of independently executing processes), and parallelism may follow naturally.

#### "Channels orchestrate; mutexes serialize."

Use channels to coordinate goroutines. Use mutexes only to protect shared state when channels don't fit.

```go
// Channels orchestrate workflow
results := make(chan Result)
for _, url := range urls {
    go func(u string) {
        results <- fetch(u)
    }(url)
}

// Mutex serializes access to shared state
var mu sync.Mutex
var cache map[string]Result

mu.Lock()
cache[url] = result
mu.Unlock()
```

### Interfaces

#### "The bigger the interface, the weaker the abstraction."

Small interfaces are powerful. The best interfaces have one method.

```go
// GOOD: Small, powerful interfaces from stdlib
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

type Stringer interface {
    String() string
}

// BAD: Kitchen-sink interface
type Repository interface {
    Create(ctx context.Context, e Entity) error
    Read(ctx context.Context, id string) (Entity, error)
    Update(ctx context.Context, e Entity) error
    Delete(ctx context.Context, id string) error
    List(ctx context.Context, opts ListOptions) ([]Entity, error)
    Count(ctx context.Context) (int, error)
    Search(ctx context.Context, query string) ([]Entity, error)
    // ... and 20 more methods
}

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

#### "interface{} says nothing."

Avoid `interface{}` (or `any`). It provides no compile-time guarantees and forces runtime type assertions.

```go
// BAD: Accepts anything, says nothing
func Process(data interface{}) error {
    // Must type-assert, may panic
    s := data.(string)
    return process(s)
}

// GOOD: Explicit types
func Process(data string) error {
    return process(data)
}

// GOOD: If polymorphism needed, use a meaningful interface
type Processor interface {
    Process() error
}
```

### Design

#### "Make the zero value useful."

Design types so their zero value is immediately usable without initialization.

```go
// GOOD: Zero value is useful
var buf bytes.Buffer // Ready to use, no initialization needed
buf.WriteString("hello")

var mu sync.Mutex // Ready to use
mu.Lock()

// GOOD: Struct with useful zero values
type Server struct {
    Addr    string        // "" means ":http"
    Handler http.Handler  // nil means http.DefaultServeMux
    Timeout time.Duration // 0 means no timeout
}

// BAD: Requires initialization
type BadServer struct {
    handlers map[string]Handler // nil map panics on write
}
```

#### "A little copying is better than a little dependency."

Don't import a package for one small function. Copy it instead.

```go
// BAD: Importing a package for one function
import "github.com/somelib/utils"

func process(s string) string {
    return utils.TrimAndLower(s) // Just strings.ToLower(strings.TrimSpace(s))
}

// GOOD: Copy the trivial logic
func process(s string) string {
    return strings.ToLower(strings.TrimSpace(s))
}
```

#### "Clear is better than clever."

Readability trumps cleverness. Write code for the next person to read it.

```go
// BAD: Clever one-liner
func abs(n int) int { return (n ^ (n >> 31)) - (n >> 31) }

// GOOD: Clear and obvious
func abs(n int) int {
    if n < 0 {
        return -n
    }
    return n
}
```

#### "Reflection is never clear."

Avoid the `reflect` package unless absolutely necessary (serialization, ORM, etc.). It's slow and obscures intent.

```go
// BAD: Using reflection when types are known
func setField(obj interface{}, name string, value interface{}) {
    reflect.ValueOf(obj).Elem().FieldByName(name).Set(reflect.ValueOf(value))
}

// GOOD: Direct field access
func (u *User) SetName(name string) {
    u.Name = name
}
```

### Errors

#### "Errors are values."

Errors are not exceptions. They are values you can program with.

```go
// BAD: Repetitive error checking
_, err = fd.Write(p0)
if err != nil {
    return err
}
_, err = fd.Write(p1)
if err != nil {
    return err
}
_, err = fd.Write(p2)
if err != nil {
    return err
}

// GOOD: Program with error values (errWriter pattern from Rob Pike)
type errWriter struct {
    w   io.Writer
    err error
}

func (ew *errWriter) write(buf []byte) {
    if ew.err != nil {
        return // Skip if already errored
    }
    _, ew.err = ew.w.Write(buf)
}

// Usage: clean, linear flow
ew := &errWriter{w: fd}
ew.write(p0)
ew.write(p1)
ew.write(p2)
if ew.err != nil {
    return ew.err
}
```

#### "Don't just check errors, handle them gracefully."

Add context when propagating errors. Make errors actionable.

```go
// BAD: No context
if err != nil {
    return err
}

// GOOD: Add context
if err != nil {
    return fmt.Errorf("failed to load user %s: %w", userID, err)
}
```

#### "Don't panic."

Panic is for truly unrecoverable situations. Use errors for normal failure modes.

```go
// BAD: Panicking on recoverable error
func MustLoadConfig(path string) Config {
    cfg, err := LoadConfig(path)
    if err != nil {
        panic(err) // Don't do this
    }
    return cfg
}

// GOOD: Return error, let caller decide
func LoadConfig(path string) (Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return Config{}, fmt.Errorf("reading config: %w", err)
    }
    // ...
}
```

### Code Style

#### "Gofmt's style is no one's favorite, yet gofmt is everyone's favorite."

Don't argue about formatting. Run `gofmt`. Always.

```bash
# Always run before commit
gofmt -w .
goimports -w .  # Also organizes imports
```

### Safety

#### "With the unsafe package there are no guarantees."

Avoid `unsafe`. If you must use it, isolate it completely and document extensively.

#### "Cgo is not Go."

Cgo has significant overhead and complexity. Avoid it when possible.

#### "Syscall must always be guarded with build tags."
#### "Cgo must always be guarded with build tags."

Platform-specific code must be properly constrained.

```go
//go:build linux

package mypackage

import "syscall"
```

### Documentation

#### "Design the architecture, name the components, document the details."

Good names reduce the need for comments. Document the non-obvious.

#### "Documentation is for users."

Write doc comments for the *users* of your code, not for yourself.

```go
// Package user provides user management functionality.
package user

// User represents a registered user in the system.
// The zero value is not usable; create users with New.
type User struct {
    ID        string
    Email     string
    CreatedAt time.Time
}

// New creates a new User with the given email.
// It returns an error if the email is invalid.
func New(email string) (*User, error) {
    // ...
}
```

---

## Naming Conventions

### Package Names

- **Short, concise, lowercase**: `time`, `http`, `json`
- **No underscores or mixedCaps**: `strconv` not `str_conv` or `strConv`
- **Avoid generic names**: NO `util`, `common`, `misc`, `helper`, `base`
- **Singular, not plural**: `user` not `users`

```go
// GOOD package names
package user      // not users
package http      // not httputil
package stringset // not string_set

// BAD package names
package utils     // What utilities?
package common    // Common to what?
package base      // Base of what?
```

### Avoid Stutter

Since clients use the package name as prefix, don't repeat it:

```go
// BAD: Stutters
package user
type UserService struct{}    // user.UserService
func NewUserService() {}     // user.NewUserService

// GOOD: Clean
package user
type Service struct{}        // user.Service
func NewService() {}         // user.NewService

// Constructor for single exported type: just New
package ring
func New() *Ring {}          // ring.New() returns *ring.Ring
```

### Variable Names

**Scope-proportional naming**: The smaller the scope, the shorter the name.

```go
// Small scope: single letters are fine
for i := 0; i < len(items); i++ { }
for _, v := range values { }

// Medium scope: short but descriptive
func process(r io.Reader) error {
    buf := make([]byte, 1024)
    // ...
}

// Large scope: descriptive names
type Server struct {
    requestTimeout  time.Duration
    maxConnections  int
    shutdownHandler func()
}
```

**Common conventions**:

| Context | Convention |
|---------|------------|
| Loop index | `i`, `j`, `k` |
| Reader/Writer | `r`, `w` |
| HTTP request/response | `r`, `w` or `req`, `resp` |
| Context | `ctx` |
| Error | `err` |
| Mutex | `mu` |
| WaitGroup | `wg` |

### Receiver Names

- **Short**: One or two letters
- **Consistent**: Same name across all methods
- **Not generic**: NOT `this`, `self`, `me`

```go
// GOOD
func (s *Server) Start() error { }
func (s *Server) Stop() error { }
func (s *Server) Handler() http.Handler { }

// GOOD: Two letters for longer type names
func (ci *ClientInfo) Validate() error { }

// BAD: Generic names
func (this *Server) Start() error { }
func (self *Server) Stop() error { }
```

### Initialisms

Keep initialisms consistently cased:

```go
// GOOD
var userID string    // not usedId
var httpClient *http.Client  // not HttpClient
type APIResponse struct{}    // not ApiResponse
func ServeHTTP() {}          // not ServeHttp

// When unexported
var xmlParser *Parser        // not XMLParser (lowercase entire initialism)
```

### Getters and Setters

Don't use `Get` prefix for getters:

```go
// GOOD
func (u *User) Name() string { return u.name }
func (u *User) SetName(name string) { u.name = name }

// BAD
func (u *User) GetName() string { return u.name }
```

### Interface Names

Single-method interfaces use method name + `-er`:

```go
type Reader interface { Read(p []byte) (n int, err error) }
type Writer interface { Write(p []byte) (n int, err error) }
type Stringer interface { String() string }
type Closer interface { Close() error }
```

---

## Error Handling

### Always Handle Errors

Never ignore errors with `_`:

```go
// BAD: Silently ignoring error
data, _ := json.Marshal(user)

// GOOD: Handle or explicitly document why it's safe
data, err := json.Marshal(user)
if err != nil {
    return fmt.Errorf("marshaling user: %w", err)
}

// GOOD: When truly safe, document it
n, _ := buf.Write(data) // bytes.Buffer.Write never returns error
```

### Error Strings

- Lowercase (no capitalization)
- No punctuation at end
- No `failed to` prefix (redundant when wrapped)

```go
// GOOD
return errors.New("connection refused")
return fmt.Errorf("parsing config: %w", err)

// BAD
return errors.New("Connection refused.")
return fmt.Errorf("Failed to parse config: %w", err)
```

### Wrapping Errors

Use `%w` to wrap errors, preserving the chain:

```go
func LoadUser(id string) (*User, error) {
    data, err := db.Query(id)
    if err != nil {
        return nil, fmt.Errorf("querying user %s: %w", id, err)
    }
    
    var user User
    if err := json.Unmarshal(data, &user); err != nil {
        return nil, fmt.Errorf("unmarshaling user %s: %w", id, err)
    }
    
    return &user, nil
}

// Caller can check underlying error
if errors.Is(err, sql.ErrNoRows) {
    return nil, ErrUserNotFound
}
```

### Sentinel Errors

Define package-level errors for expected conditions:

```go
var (
    ErrNotFound     = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
    ErrInvalidInput = errors.New("invalid input")
)

// Check with errors.Is
if errors.Is(err, ErrNotFound) {
    return nil, status.NotFound("user not found")
}
```

### Custom Error Types

For errors that carry structured data:

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation error on %s: %s", e.Field, e.Message)
}

// Check with errors.As
var valErr *ValidationError
if errors.As(err, &valErr) {
    log.Printf("validation failed on field: %s", valErr.Field)
}
```

### Indent Error Flow

Keep the happy path at minimal indentation:

```go
// GOOD: Happy path is clear
func process(r io.Reader) error {
    data, err := io.ReadAll(r)
    if err != nil {
        return err
    }
    
    result, err := transform(data)
    if err != nil {
        return err
    }
    
    return save(result)
}

// BAD: Happy path buried in else
func process(r io.Reader) error {
    data, err := io.ReadAll(r)
    if err != nil {
        return err
    } else {
        result, err := transform(data)
        if err != nil {
            return err
        } else {
            return save(result)
        }
    }
}
```

---

## Interface Design

### Accept Interfaces, Return Structs

Functions should accept interfaces (flexibility) and return concrete types (clarity):

```go
// GOOD: Accept interface
func Copy(dst io.Writer, src io.Reader) (int64, error) {
    // Works with any Reader/Writer
}

// GOOD: Return concrete type
func NewServer(addr string) *Server {
    return &Server{addr: addr}
}

// BAD: Return interface (hides implementation details)
func NewServer(addr string) ServerInterface {
    return &Server{addr: addr}
}
```

### Define Interfaces at Consumer

Define interfaces where they are *used*, not where they are *implemented*:

```go
// In the handler package (consumer):
package handler

type UserGetter interface {
    GetUser(ctx context.Context, id string) (*User, error)
}

func NewHandler(users UserGetter) *Handler {
    return &Handler{users: users}
}

// In the user package (producer):
package user

// No interface defined here - just the concrete type
type Service struct { /* ... */ }

func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
    // Implementation
}
```

This allows:
- Different consumers to define different interfaces
- Easy testing (mock only what you need)
- No import cycles

---

## Concurrency

### Context Propagation

Always pass context as the first parameter:

```go
func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
    // Check for cancellation in long operations
    select {
    case <-ctx.Done():
        return nil, ctx.Err()
    default:
    }
    
    // Pass context to downstream calls
    return s.repo.FindByID(ctx, id)
}
```

Don't store context in structs:

```go
// BAD
type Service struct {
    ctx context.Context
}

// GOOD
func (s *Service) DoWork(ctx context.Context) error {
    // Use ctx parameter
}
```

### Goroutine Lifetimes

Make goroutine lifetimes explicit. Avoid leaks.

```go
// GOOD: Clear lifecycle with done channel
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

// GOOD: WaitGroup for coordinated shutdown
func processAll(ctx context.Context, items []Item) error {
    g, ctx := errgroup.WithContext(ctx)
    
    for _, item := range items {
        item := item // Capture loop variable
        g.Go(func() error {
            return process(ctx, item)
        })
    }
    
    return g.Wait()
}
```

### Prefer Synchronous APIs

Return results directly when possible. Let callers add concurrency if needed.

```go
// GOOD: Synchronous - caller can add concurrency
func Fetch(ctx context.Context, url string) ([]byte, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
    if err != nil {
        return nil, err
    }
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    return io.ReadAll(resp.Body)
}

// Caller adds concurrency as needed
go func() {
    data, err := Fetch(ctx, url)
    results <- result{data, err}
}()

// BAD: Forces async on all callers
func Fetch(url string) <-chan Result {
    ch := make(chan Result)
    go func() {
        // ...
        ch <- Result{data, err}
    }()
    return ch
}
```

> **Warning**: Avoid `http.Get()` in production — it has no timeout and can hang indefinitely. Always use `http.Client` with timeout or `http.NewRequestWithContext`.

---

## Testing

### Table-Driven Tests

The standard Go pattern for comprehensive testing:

```go
func TestParse(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    int
        wantErr bool
    }{
        {"valid positive", "42", 42, false},
        {"valid negative", "-7", -7, false},
        {"valid zero", "0", 0, false},
        {"invalid empty", "", 0, true},
        {"invalid text", "abc", 0, true},
        {"overflow", "999999999999999999999", 0, true},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel() // Run subtests in parallel
            got, err := Parse(tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("Parse(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
                return
            }
            if got != tt.want {
                t.Errorf("Parse(%q) = %v, want %v", tt.input, got, tt.want)
            }
        })
    }
}
```

> **Note**: With Go 1.22+, loop variable capture is fixed, so `t.Parallel()` just works. In Go 1.21 and earlier, you'd need `tt := tt` before the `t.Run` call.

### Useful Test Failures

Test failures should tell you *exactly* what went wrong:

```go
// GOOD: Informative failure
if got != tt.want {
    t.Errorf("Lookup(%q) = %q, want %q", tt.key, got, tt.want)
}

// BAD: Useless failure
if got != tt.want {
    t.Error("test failed")
}
```

### Test Examples

Use `Example` functions for documentation:

```go
func ExampleReverse() {
    fmt.Println(Reverse("hello"))
    // Output: olleh
}

func ExampleUser_FullName() {
    u := User{First: "John", Last: "Doe"}
    fmt.Println(u.FullName())
    // Output: John Doe
}
```

---

## Project Structure

Standard layout for Go services:

```
myservice/
├── cmd/
│   └── server/
│       └── main.go           # Entry point
├── internal/                  # Private packages
│   ├── handler/              # HTTP/gRPC handlers
│   ├── service/              # Business logic
│   ├── repository/           # Data access
│   └── model/                # Domain types
├── pkg/                       # Public packages (importable by others)
│   └── client/               # SDK for consumers
├── api/                       # API definitions (proto, OpenAPI)
├── migrations/               # Database migrations
├── Makefile
├── Dockerfile
├── go.mod
└── go.sum                    # Commit this — ensures reproducible builds
```

Key principles:
- `cmd/` — main packages only, minimal code
- `internal/` — private, cannot be imported by other modules
- `pkg/` — public, importable by other modules (use sparingly)
- Keep `main.go` thin — just wire things together

---

## Common Pitfalls

### Defer in Loops

Defers don't run until the function returns:

```go
// BAD: Files stay open until function returns
for _, path := range paths {
    f, err := os.Open(path)
    if err != nil {
        return err
    }
    defer f.Close() // Only runs when function exits!
    process(f)
}

// GOOD: Use closure to scope defer
for _, path := range paths {
    if err := func() error {
        f, err := os.Open(path)
        if err != nil {
            return err
        }
        defer f.Close()
        return process(f)
    }(); err != nil {
        return err
    }
}

// GOOD: Or explicit close
for _, path := range paths {
    f, err := os.Open(path)
    if err != nil {
        return err
    }
    err = process(f)
    f.Close()
    if err != nil {
        return err
    }
}
```

### Goroutine Leaks

Always ensure goroutines can exit:

```go
// BAD: Goroutine leaks if no one reads ch
func fetch(url string) <-chan Result {
    ch := make(chan Result)
    go func() {
        ch <- doFetch(url) // Blocks forever if ch not read
    }()
    return ch
}

// GOOD: Use buffered channel
func fetch(url string) <-chan Result {
    ch := make(chan Result, 1)
    go func() {
        ch <- doFetch(url)
    }()
    return ch
}

// GOOD: Accept context for cancellation
func fetch(ctx context.Context, url string) <-chan Result {
    ch := make(chan Result, 1)
    go func() {
        select {
        case ch <- doFetch(url):
        case <-ctx.Done():
        }
    }()
    return ch
}
```

### Loop Variable Capture

> **Go 1.22+**: This pitfall is fixed by default. Each loop iteration now creates a new variable. The workarounds below are only needed for Go 1.21 and earlier.

```go
// PRE-GO-1.22 BUG: All goroutines see same value of item
for _, item := range items {
    go func() {
        process(item) // Captures variable, not value!
    }()
}

// WORKAROUND 1: Pass as parameter (works in all Go versions)
for _, item := range items {
    go func(it Item) {
        process(it)
    }(item)
}

// WORKAROUND 2: Shadow the variable (works in all Go versions)
for _, item := range items {
    item := item // Shadow
    go func() {
        process(item)
    }()
}

// GO 1.22+: Just works — no workaround needed
for _, item := range items {
    go func() {
        process(item) // Safe: item is per-iteration
    }()
}
```

### Nil Slice vs Empty Slice

Prefer nil slices; they work the same but encode to `null` in JSON:

```go
// GOOD: nil slice (recommended default)
var items []string
fmt.Println(len(items)) // 0
fmt.Println(items == nil) // true
json.Marshal(items) // null

// ALTERNATIVE: empty slice — use when JSON [] is required
items := []string{}
fmt.Println(len(items)) // 0
fmt.Println(items == nil) // false
json.Marshal(items) // []

// Same as above, explicit capacity
items := make([]string, 0)
```

### In-Band Errors

Don't use special values to signal errors:

```go
// BAD: -1 is in-band error
func Lookup(key string) int {
    if v, ok := cache[key]; ok {
        return v
    }
    return -1 // What if -1 is valid?
}

// GOOD: Return explicit ok bool
func Lookup(key string) (int, bool) {
    v, ok := cache[key]
    return v, ok
}

// GOOD: Return error
func Lookup(key string) (int, error) {
    v, ok := cache[key]
    if !ok {
        return 0, ErrNotFound
    }
    return v, nil
}
```

---

## Modern Go (1.22+)

This section covers significant language and library changes from Go 1.22 through Go 1.26. Use these features in new code; they represent the modern Go idiom.

### Loop Variable Semantics (Go 1.22)

The infamous loop variable capture bug is fixed. Each iteration creates a fresh variable:

```go
// GO 1.22+: Just works
for _, item := range items {
    go func() {
        process(item) // Safe — item is per-iteration
    }()
}
```

### Range Over Integers (Go 1.22)

Range directly over integers without creating slices:

```go
// GO 1.22+
for i := range 10 {
    fmt.Println(i) // 0, 1, 2, ..., 9
}

// Equivalent to:
for i := 0; i < 10; i++ {
    fmt.Println(i)
}
```

### Range Over Functions (Go 1.23)

Functions can be ranged over, enabling custom iterators:

```go
// Iterator function signature
type Seq[V any] func(yield func(V) bool)
type Seq2[K, V any] func(yield func(K, V) bool)

// Example: iterate over map values in sorted key order
func Sorted[K cmp.Ordered, V any](m map[K]V) iter.Seq2[K, V] {
    return func(yield func(K, V) bool) {
        keys := slices.Sorted(maps.Keys(m))
        for _, k := range keys {
            if !yield(k, m[k]) {
                return
            }
        }
    }
}

// Usage
for k, v := range Sorted(myMap) {
    fmt.Println(k, v)
}
```

Standard library iterators in `slices`, `maps`, and new `iter` package:

```go
import (
    "iter"
    "maps"
    "slices"
)

// Pull-based iteration (convert push iterator to pull)
next, stop := iter.Pull(slices.Values(items))
defer stop()
for {
    v, ok := next()
    if !ok {
        break
    }
    process(v)
}
```

### Generic Type Aliases (Go 1.24)

Type aliases can now be parameterized:

```go
// GO 1.24+
type Set[T comparable] = map[T]struct{}

// Usage
var s Set[string]
s = make(Set[string])
s["hello"] = struct{}{}
```

### Enhanced HTTP Routing (Go 1.22)

`net/http.ServeMux` now supports method matching and path wildcards:

```go
mux := http.NewServeMux()

// Method matching
mux.HandleFunc("GET /users", listUsers)
mux.HandleFunc("POST /users", createUser)

// Path wildcards (capture segments)
mux.HandleFunc("GET /users/{id}", getUser)
mux.HandleFunc("DELETE /users/{id}", deleteUser)

// Wildcard suffix (match remainder)
mux.HandleFunc("GET /files/{path...}", serveFile)

// Access captured values
func getUser(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    // ...
}
```

### Improved Benchmarking (Go 1.24)

Use `b.Loop()` instead of manual `b.N` loops:

```go
// GO 1.24+: Preferred
func BenchmarkProcess(b *testing.B) {
    for b.Loop() {
        process()
    }
}

// Pre-1.24: Manual b.N loop
func BenchmarkProcess(b *testing.B) {
    for i := 0; i < b.N; i++ {
        process()
    }
}
```

Benefits: cleaner code, automatic warmup handling, prevents compiler optimizations from eliminating the benchmark.

### Cleanup Functions (Go 1.24)

`runtime.AddCleanup` replaces `runtime.SetFinalizer` with better semantics:

```go
import "runtime"

type Resource struct {
    handle uintptr
}

func NewResource() *Resource {
    r := &Resource{handle: allocateHandle()}
    runtime.AddCleanup(r, func(handle uintptr) {
        releaseHandle(handle)
    }, r.handle)
    return r
}
```

Key differences from `SetFinalizer`:
- Cleanup receives a copy of the value, not a pointer (prevents resurrection)
- Multiple cleanups can be attached to one object
- Interior pointers keep the object alive

### WaitGroup.Go (Go 1.25)

Simplified goroutine launching with automatic Add/Done:

```go
// GO 1.25+
var wg sync.WaitGroup
for _, item := range items {
    wg.Go(func() {
        process(item)
    })
}
wg.Wait()

// Pre-1.25: Manual Add/Done
var wg sync.WaitGroup
for _, item := range items {
    wg.Add(1)
    go func() {
        defer wg.Done()
        process(item)
    }()
}
wg.Wait()
```

### Generic Error Extraction (Go 1.26)

`errors.AsType[T]` provides type-safe error extraction:

```go
// GO 1.26+
if pathErr, ok := errors.AsType[*fs.PathError](err); ok {
    fmt.Println("path:", pathErr.Path)
}

// Pre-1.26
var pathErr *fs.PathError
if errors.As(err, &pathErr) {
    fmt.Println("path:", pathErr.Path)
}
```

### New Expression (Go 1.26)

`new` can take an expression for the initial value:

```go
// GO 1.26+
p := new(MyStruct{Field: "value"})

// Equivalent to:
p := &MyStruct{Field: "value"}

// Useful for non-addressable expressions
p := new(getValue()) // getValue() returns a value, not addressable
```

### Container-Aware GOMAXPROCS (Go 1.25)

Go automatically respects cgroup CPU limits on Linux:

```bash
# Container with 2 CPU limit
docker run --cpus=2 myapp
# GOMAXPROCS automatically set to 2 (not host CPU count)
```

No code changes needed — just upgrade to Go 1.25+.

### Concurrent Testing (Go 1.25)

`testing/synctest` package for testing concurrent code:

```go
import "testing/synctest"

func TestConcurrent(t *testing.T) {
    synctest.Run(func() {
        // Fake time and goroutine control
        ch := make(chan int)
        go func() {
            time.Sleep(time.Hour) // Doesn't actually wait
            ch <- 42
        }()
        
        synctest.Wait() // Wait for all goroutines to block
        // Now we know the goroutine is waiting on time.Sleep
    })
}
```

### math/rand/v2 (Go 1.22)

Improved random number generation:

```go
import "math/rand/v2"

// Better naming: IntN instead of Intn
n := rand.IntN(100)      // [0, 100)
n32 := rand.Int32N(100)  // int32 result
n64 := rand.Int64N(100)  // int64 result

// New ChaCha8 and PCG generators
rng := rand.NewChaCha8([32]byte{/* seed */})
rng := rand.NewPCG(seed1, seed2)
```

---

## Quick Reference

### Formatting

```bash
gofmt -w .        # Format all files
goimports -w .    # Format + organize imports
```

### Commands

```bash
go build ./...    # Build all packages
go test ./...     # Test all packages
go test -race ./... # Test with race detector
go vet ./...      # Static analysis
golangci-lint run # Comprehensive linting
```

### Import Organization

```go
import (
    // Standard library (alphabetical)
    "context"
    "fmt"
    "net/http"
    
    // Third-party (alphabetical)
    "github.com/redis/go-redis/v9"
    "golang.org/x/sync/errgroup"
    
    // Internal (alphabetical)
    "myproject/internal/user"
)
```

---

## AIDEV-NOTE: Go skill philosophy

This skill prioritizes Rob Pike's original wisdom and official Go sources. When in
doubt about Go style, consult: 1) Go Proverbs, 2) Effective Go, 3) Code Review
Comments, 4) Google Style Guide — in that order. The goal is idiomatic Go that
any Go programmer can read and maintain.
