---
name: tdd
description: Go-focused test-driven development patterns — test-first workflow, table-driven tests, mocking with interfaces, coverage targets, and integration test conventions.
license: MIT
metadata:
  audience: ai-agents
  language: go
---

# TDD Skill

Test-driven development patterns for Go projects.

<!-- AIDEV-NOTE: This skill is Go-focused but the workflow (test first → implement
     → refactor) applies to any language. When adding support for another language,
     create a parallel tdd-<lang> skill or extend this one with a language section. -->

## Core Principle

**Write the test first. Watch it fail. Then implement.**

```
1. Write a failing test that defines the expected behavior
2. Run the test — confirm it fails for the right reason
3. Write the minimal code to make the test pass
4. Run the test — confirm it passes
5. Refactor while keeping tests green
6. Repeat
```

Never skip step 1. A test written after implementation is a verification, not a design tool.

## Test File Organization

Go tests live alongside the code they test:

```
internal/
  auth/
    handler.go          # Production code
    handler_test.go     # Unit tests
    handler_integration_test.go  # Integration tests (build tag)
```

- Unit test files: `*_test.go` (same package)
- Integration tests: `//go:build integration` tag at the top
- Test helpers: `testutil/` package or `_test.go` helpers in the same package

## Table-Driven Tests

The standard Go pattern for testing multiple cases:

```go
func TestValidateEmail(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        wantErr bool
    }{
        {name: "valid email", input: "user@example.com", wantErr: false},
        {name: "missing @", input: "userexample.com", wantErr: true},
        {name: "empty string", input: "", wantErr: true},
        {name: "double @", input: "user@@example.com", wantErr: true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := ValidateEmail(tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("ValidateEmail(%q) error = %v, wantErr %v",
                    tt.input, err, tt.wantErr)
            }
        })
    }
}
```

Always include:
- A descriptive `name` field for each case
- Edge cases: empty input, nil, zero values, boundary conditions
- Error cases: invalid input, missing required fields, overflow

## Mocking with Interfaces

Define interfaces for external dependencies. Use test doubles — no mocking frameworks required.

```go
// Production code defines the interface
type UserRepository interface {
    FindByID(ctx context.Context, id string) (*User, error)
    Create(ctx context.Context, u *User) error
}

// Production implementation
type PostgresUserRepo struct { db *sql.DB }

// Test double
type fakeUserRepo struct {
    users map[string]*User
    err   error
}

func (f *fakeUserRepo) FindByID(_ context.Context, id string) (*User, error) {
    if f.err != nil {
        return nil, f.err
    }
    u, ok := f.users[id]
    if !ok {
        return nil, ErrNotFound
    }
    return u, nil
}

func (f *fakeUserRepo) Create(_ context.Context, u *User) error {
    if f.err != nil {
        return f.err
    }
    f.users[u.ID] = u
    return nil
}
```

Inject the fake in tests:

```go
func TestGetUser(t *testing.T) {
    repo := &fakeUserRepo{
        users: map[string]*User{"1": {ID: "1", Name: "Alice"}},
    }
    svc := NewUserService(repo)

    user, err := svc.GetUser(context.Background(), "1")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if user.Name != "Alice" {
        t.Errorf("got name %q, want %q", user.Name, "Alice")
    }
}
```

## HTTP Handler Tests

Use `net/http/httptest` for testing HTTP handlers:

```go
func TestHealthHandler(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/health", nil)
    rec := httptest.NewRecorder()

    HealthHandler(rec, req)

    if rec.Code != http.StatusOK {
        t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
    }
}
```

## Coverage Target

- **Minimum 80%** line coverage for new code
- Measure: `go test -cover ./...`
- Detailed report: `go test -coverprofile=coverage.out ./... && go tool cover -html=coverage.out`

Coverage is a guide, not a goal. 80% of meaningful logic covered is better than
100% with trivial assertions.

## Integration Tests

Use build tags to separate integration tests that need external services:

```go
//go:build integration

package auth_test

func TestAuthAgainstRealDB(t *testing.T) {
    // Requires a running database
    db := setupTestDB(t)
    defer db.Close()
    // ...
}
```

Run separately: `go test -tags=integration ./...`

## Benchmarks

For performance-sensitive code:

```go
func BenchmarkHashPassword(b *testing.B) {
    for b.Loop() {
        HashPassword("test-password-123")
    }
}
```

Run: `go test -bench=. -benchmem ./...`

## Test Helpers

Use `t.Helper()` for shared test utilities:

```go
func assertEqual(t *testing.T, got, want interface{}) {
    t.Helper()
    if got != want {
        t.Errorf("got %v, want %v", got, want)
    }
}
```

Use `t.Cleanup()` for teardown:

```go
func setupTestServer(t *testing.T) *httptest.Server {
    srv := httptest.NewServer(handler)
    t.Cleanup(srv.Close)
    return srv
}
```
