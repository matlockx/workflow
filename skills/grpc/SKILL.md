---
name: grpc
description: Reference for building gRPC services in Go - Protobuf definitions, code generation with buf, server/client implementation, and interceptors.
license: MIT
metadata:
  stack: backend
  languages: [go]
  protocols: [grpc, protobuf]
---

# gRPC Skill

Reference for building gRPC services with Protocol Buffers in Go.

## Installation

```bash
# Protocol Buffer compiler
brew install protobuf  # macOS
# or
apt install -y protobuf-compiler  # Linux

# Go plugins
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Buf (modern alternative to protoc)
brew install bufbuild/buf/buf  # macOS
# or
go install github.com/bufbuild/buf/cmd/buf@latest
```

---

## Project Structure

```
myapp/
├── api/
│   └── proto/
│       └── v1/
│           ├── user.proto
│           └── market.proto
├── buf.yaml
├── buf.gen.yaml
├── internal/
│   ├── server/
│   │   └── user_server.go
│   └── client/
│       └── user_client.go
└── pkg/
    └── gen/
        └── api/
            └── v1/
                ├── user.pb.go
                └── user_grpc.pb.go
```

---

## Proto Definition

### user.proto

```protobuf
syntax = "proto3";

package api.v1;

option go_package = "github.com/example/myapp/pkg/gen/api/v1;apiv1";

import "google/protobuf/timestamp.proto";

// User service
service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc UpdateUser(UpdateUserRequest) returns (UpdateUserResponse);
  rpc DeleteUser(DeleteUserRequest) returns (DeleteUserResponse);
  
  // Server streaming
  rpc WatchUsers(WatchUsersRequest) returns (stream User);
  
  // Client streaming
  rpc BatchCreateUsers(stream CreateUserRequest) returns (BatchCreateUsersResponse);
  
  // Bidirectional streaming
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}

// Messages
message User {
  string id = 1;
  string email = 2;
  string username = 3;
  UserRole role = 4;
  google.protobuf.Timestamp created_at = 5;
  google.protobuf.Timestamp updated_at = 6;
}

enum UserRole {
  USER_ROLE_UNSPECIFIED = 0;
  USER_ROLE_ADMIN = 1;
  USER_ROLE_USER = 2;
  USER_ROLE_GUEST = 3;
}

message GetUserRequest {
  string id = 1;
}

message GetUserResponse {
  User user = 1;
}

message CreateUserRequest {
  string email = 1;
  string username = 2;
  string password = 3;
}

message CreateUserResponse {
  User user = 1;
}

message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;
  string filter = 3;
}

message ListUsersResponse {
  repeated User users = 1;
  string next_page_token = 2;
  int32 total_count = 3;
}

message UpdateUserRequest {
  string id = 1;
  string email = 2;
  string username = 3;
}

message UpdateUserResponse {
  User user = 1;
}

message DeleteUserRequest {
  string id = 1;
}

message DeleteUserResponse {
  bool success = 1;
}

message WatchUsersRequest {
  string filter = 1;
}

message BatchCreateUsersResponse {
  repeated User users = 1;
  int32 success_count = 2;
  int32 failure_count = 3;
}

message ChatMessage {
  string user_id = 1;
  string message = 2;
  google.protobuf.Timestamp timestamp = 3;
}
```

---

## Code Generation with Buf

### buf.yaml

```yaml
version: v2
modules:
  - path: api
breaking:
  use:
    - FILE
lint:
  use:
    - STANDARD
```

### buf.gen.yaml

```yaml
version: v2
managed:
  enabled: true
  override:
    - file_option: go_package_prefix
      value: github.com/example/myapp/pkg/gen
plugins:
  - remote: buf.build/protocolbuffers/go
    out: pkg/gen
    opt:
      - paths=source_relative
  - remote: buf.build/grpc/go
    out: pkg/gen
    opt:
      - paths=source_relative
```

### Generate Code

```bash
# Using buf
buf generate

# Or using protoc directly
protoc --go_out=. --go_opt=paths=source_relative \
       --go-grpc_out=. --go-grpc_opt=paths=source_relative \
       api/proto/v1/*.proto
```

---

## Server Implementation

```go
package server

import (
    "context"
    "fmt"

    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"
    "google.golang.org/protobuf/types/known/timestamppb"

    apiv1 "github.com/example/myapp/pkg/gen/api/v1"
)

type UserServer struct {
    apiv1.UnimplementedUserServiceServer
    db *sql.DB
}

func NewUserServer(db *sql.DB) *UserServer {
    return &UserServer{db: db}
}

func (s *UserServer) GetUser(ctx context.Context, req *apiv1.GetUserRequest) (*apiv1.GetUserResponse, error) {
    if req.Id == "" {
        return nil, status.Error(codes.InvalidArgument, "id is required")
    }

    var user apiv1.User
    var createdAt, updatedAt time.Time

    err := s.db.QueryRowContext(ctx,
        "SELECT id, email, username, role, created_at, updated_at FROM users WHERE id = $1",
        req.Id,
    ).Scan(&user.Id, &user.Email, &user.Username, &user.Role, &createdAt, &updatedAt)

    if err == sql.ErrNoRows {
        return nil, status.Error(codes.NotFound, "user not found")
    }
    if err != nil {
        return nil, status.Error(codes.Internal, "database error")
    }

    user.CreatedAt = timestamppb.New(createdAt)
    user.UpdatedAt = timestamppb.New(updatedAt)

    return &apiv1.GetUserResponse{User: &user}, nil
}

func (s *UserServer) CreateUser(ctx context.Context, req *apiv1.CreateUserRequest) (*apiv1.CreateUserResponse, error) {
    // Validation
    if req.Email == "" {
        return nil, status.Error(codes.InvalidArgument, "email is required")
    }
    if req.Username == "" {
        return nil, status.Error(codes.InvalidArgument, "username is required")
    }

    // Hash password
    hashedPassword, err := hashPassword(req.Password)
    if err != nil {
        return nil, status.Error(codes.Internal, "failed to hash password")
    }

    // Insert user
    var user apiv1.User
    var createdAt, updatedAt time.Time

    err = s.db.QueryRowContext(ctx,
        "INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username, role, created_at, updated_at",
        req.Email, req.Username, hashedPassword,
    ).Scan(&user.Id, &user.Email, &user.Username, &user.Role, &createdAt, &updatedAt)

    if err != nil {
        return nil, status.Error(codes.Internal, "failed to create user")
    }

    user.CreatedAt = timestamppb.New(createdAt)
    user.UpdatedAt = timestamppb.New(updatedAt)

    return &apiv1.CreateUserResponse{User: &user}, nil
}

// Server streaming
func (s *UserServer) WatchUsers(req *apiv1.WatchUsersRequest, stream apiv1.UserService_WatchUsersServer) error {
    // Send updates as they occur
    for {
        select {
        case <-stream.Context().Done():
            return nil
        case user := <-s.userUpdatesChan:
            if err := stream.Send(user); err != nil {
                return err
            }
        }
    }
}
```

---

## Client Implementation

```go
package client

import (
    "context"
    "fmt"
    "time"

    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"

    apiv1 "github.com/example/myapp/pkg/gen/api/v1"
)

type UserClient struct {
    client apiv1.UserServiceClient
    conn   *grpc.ClientConn
}

func NewUserClient(addr string) (*UserClient, error) {
    conn, err := grpc.NewClient(addr,
        grpc.WithTransportCredentials(insecure.NewCredentials()),
    )
    if err != nil {
        return nil, fmt.Errorf("connect: %w", err)
    }

    return &UserClient{
        client: apiv1.NewUserServiceClient(conn),
        conn:   conn,
    }, nil
}

func (c *UserClient) Close() error {
    return c.conn.Close()
}

func (c *UserClient) GetUser(ctx context.Context, id string) (*apiv1.User, error) {
    resp, err := c.client.GetUser(ctx, &apiv1.GetUserRequest{
        Id: id,
    })
    if err != nil {
        return nil, err
    }
    return resp.User, nil
}

func (c *UserClient) CreateUser(ctx context.Context, email, username, password string) (*apiv1.User, error) {
    resp, err := c.client.CreateUser(ctx, &apiv1.CreateUserRequest{
        Email:    email,
        Username: username,
        Password: password,
    })
    if err != nil {
        return nil, err
    }
    return resp.User, nil
}

// Client streaming example
func (c *UserClient) BatchCreateUsers(ctx context.Context, users []*apiv1.CreateUserRequest) (*apiv1.BatchCreateUsersResponse, error) {
    stream, err := c.client.BatchCreateUsers(ctx)
    if err != nil {
        return nil, err
    }

    for _, user := range users {
        if err := stream.Send(user); err != nil {
            return nil, err
        }
    }

    return stream.CloseAndRecv()
}
```

---

## Server Setup

```go
package main

import (
    "log"
    "net"

    "google.golang.org/grpc"
    "google.golang.org/grpc/reflection"

    apiv1 "github.com/example/myapp/pkg/gen/api/v1"
    "github.com/example/myapp/internal/server"
)

func main() {
    lis, err := net.Listen("tcp", ":9090")
    if err != nil {
        log.Fatalf("failed to listen: %v", err)
    }

    // Create gRPC server
    s := grpc.NewServer(
        grpc.ChainUnaryInterceptor(
            loggingInterceptor,
            authInterceptor,
        ),
    )

    // Register services
    apiv1.RegisterUserServiceServer(s, server.NewUserServer(db))

    // Enable reflection (for grpcurl)
    reflection.Register(s)

    log.Printf("gRPC server listening on :9090")
    if err := s.Serve(lis); err != nil {
        log.Fatalf("failed to serve: %v", err)
    }
}
```

---

## Interceptors (Middleware)

### Logging Interceptor

```go
func loggingInterceptor(
    ctx context.Context,
    req interface{},
    info *grpc.UnaryServerInfo,
    handler grpc.UnaryHandler,
) (interface{}, error) {
    start := time.Now()

    resp, err := handler(ctx, req)

    duration := time.Since(start)
    log.Printf("method=%s duration=%v error=%v", info.FullMethod, duration, err)

    return resp, err
}
```

### Auth Interceptor

```go
func authInterceptor(
    ctx context.Context,
    req interface{},
    info *grpc.UnaryServerInfo,
    handler grpc.UnaryHandler,
) (interface{}, error) {
    // Skip auth for public methods
    if isPublicMethod(info.FullMethod) {
        return handler(ctx, req)
    }

    // Extract token from metadata
    md, ok := metadata.FromIncomingContext(ctx)
    if !ok {
        return nil, status.Error(codes.Unauthenticated, "missing metadata")
    }

    tokens := md.Get("authorization")
    if len(tokens) == 0 {
        return nil, status.Error(codes.Unauthenticated, "missing token")
    }

    // Verify token
    userID, err := verifyToken(tokens[0])
    if err != nil {
        return nil, status.Error(codes.Unauthenticated, "invalid token")
    }

    // Add user to context
    ctx = context.WithValue(ctx, "user_id", userID)

    return handler(ctx, req)
}
```

---

## Testing

```go
package server_test

import (
    "context"
    "testing"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"

    apiv1 "github.com/example/myapp/pkg/gen/api/v1"
)

func TestUserServer_GetUser(t *testing.T) {
    // Start test server
    lis, err := net.Listen("tcp", "localhost:0")
    require.NoError(t, err)

    s := grpc.NewServer()
    apiv1.RegisterUserServiceServer(s, server.NewUserServer(testDB))
    
    go s.Serve(lis)
    defer s.Stop()

    // Create client
    conn, err := grpc.NewClient(lis.Addr().String(),
        grpc.WithTransportCredentials(insecure.NewCredentials()),
    )
    require.NoError(t, err)
    defer conn.Close()

    client := apiv1.NewUserServiceClient(conn)

    // Test
    resp, err := client.GetUser(context.Background(), &apiv1.GetUserRequest{
        Id: "123",
    })

    assert.NoError(t, err)
    assert.NotNil(t, resp.User)
    assert.Equal(t, "123", resp.User.Id)
}
```

---

## Error Handling

```go
import (
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"
)

// Return structured errors
func (s *UserServer) GetUser(ctx context.Context, req *apiv1.GetUserRequest) (*apiv1.GetUserResponse, error) {
    if req.Id == "" {
        return nil, status.Error(codes.InvalidArgument, "id is required")
    }

    user, err := s.repo.GetUser(ctx, req.Id)
    if err == ErrNotFound {
        return nil, status.Error(codes.NotFound, "user not found")
    }
    if err != nil {
        return nil, status.Error(codes.Internal, "internal error")
    }

    return &apiv1.GetUserResponse{User: user}, nil
}

// Client error handling
resp, err := client.GetUser(ctx, &apiv1.GetUserRequest{Id: "123"})
if err != nil {
    st, ok := status.FromError(err)
    if ok {
        switch st.Code() {
        case codes.NotFound:
            // Handle not found
        case codes.InvalidArgument:
            // Handle validation error
        default:
            // Handle other errors
        }
    }
}
```

---

## Makefile Integration

```makefile
.PHONY: proto-gen
proto-gen:
	buf generate

.PHONY: proto-lint
proto-lint:
	buf lint

.PHONY: proto-breaking
proto-breaking:
	buf breaking --against '.git#branch=main'

.PHONY: grpc-serve
grpc-serve:
	go run cmd/server/main.go
```

---

## Best Practices

### 1. Use buf for Proto Management
- Linting and breaking change detection
- Simpler than protoc

### 2. Version Your APIs
```
api/proto/v1/user.proto
api/proto/v2/user.proto
```

### 3. Use Unimplemented Embed
```go
type UserServer struct {
    apiv1.UnimplementedUserServiceServer  // Forward compatibility
    db *sql.DB
}
```

### 4. Always Set Timeouts
```go
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()

resp, err := client.GetUser(ctx, req)
```

### 5. Use Interceptors for Cross-Cutting Concerns
- Logging
- Auth
- Metrics
- Tracing

---

## Common Pitfalls

### ❌ No timeout on client calls
- Can hang forever
- ALWAYS set timeouts

### ❌ Not handling context cancellation
- Wastes resources
- Check `ctx.Done()`

### ❌ Forgetting to close connections
- Resource leaks
- ALWAYS defer `conn.Close()`

### ❌ No error handling
- Silent failures
- ALWAYS check errors

### ❌ Using default gRPC port (50051)
- Conflicts
- Use custom port

---

## References

- gRPC Go: https://grpc.io/docs/languages/go/
- Protocol Buffers: https://protobuf.dev/
- Buf: https://buf.build/docs/
- grpcurl: https://github.com/fullstorydev/grpcurl
