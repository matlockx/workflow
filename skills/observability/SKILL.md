---
name: observability
description: Reference for instrumenting Go services with OpenTelemetry, Prometheus metrics, and structured logging for comprehensive observability.
license: MIT
metadata:
  stack: backend
  languages: [go]
  monitoring: [opentelemetry, prometheus, grafana]
---

# Observability Skill

Reference for instrumenting backend services with traces, metrics, and logs.

## Three Pillars

1. **Traces**: Request flow across services (OpenTelemetry)
2. **Metrics**: Aggregated measurements (Prometheus)
3. **Logs**: Discrete events (structured logging)

---

## OpenTelemetry (Traces + Metrics)

### Installation

```bash
go get go.opentelemetry.io/otel
go get go.opentelemetry.io/otel/sdk
go get go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp
go get go.opentelemetry.io/otel/exporters/prometheus
go get go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp
```

### Initialization

```go
package telemetry

import (
    "context"
    "fmt"
    "time"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
)

func InitTracing(ctx context.Context, serviceName, otlpEndpoint string) (*sdktrace.TracerProvider, error) {
    // Create OTLP exporter
    exporter, err := otlptracehttp.New(ctx,
        otlptracehttp.WithEndpoint(otlpEndpoint),
        otlptracehttp.WithInsecure(), // Use WithTLSCredentials() in prod
    )
    if err != nil {
        return nil, fmt.Errorf("create exporter: %w", err)
    }

    // Create resource
    res, err := resource.New(ctx,
        resource.WithAttributes(
            semconv.ServiceName(serviceName),
            semconv.ServiceVersion("1.0.0"),
            attribute.String("environment", "production"),
        ),
    )
    if err != nil {
        return nil, fmt.Errorf("create resource: %w", err)
    }

    // Create tracer provider
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(res),
        sdktrace.WithSampler(sdktrace.AlwaysSample()), // Use ParentBased in prod
    )

    // Set global tracer provider
    otel.SetTracerProvider(tp)

    // Set global propagator (for distributed tracing)
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},
        propagation.Baggage{},
    ))

    return tp, nil
}
```

### HTTP Server Instrumentation

```go
package main

import (
    "net/http"

    "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

func main() {
    // Wrap handler with OTEL middleware
    handler := http.HandlerFunc(handleRequest)
    wrappedHandler := otelhttp.NewHandler(handler, "http.server")

    http.ListenAndServe(":8080", wrappedHandler)
}

func handleRequest(w http.ResponseWriter, r *http.Request) {
    // Span is automatically created by middleware
    // Access it via context
    ctx := r.Context()

    // Do work...
    processRequest(ctx)

    w.WriteHeader(http.StatusOK)
}
```

### HTTP Client Instrumentation

```go
import (
    "net/http"

    "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

func makeRequest(ctx context.Context, url string) error {
    client := &http.Client{
        Transport: otelhttp.NewTransport(http.DefaultTransport),
    }

    req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    return nil
}
```

### Custom Spans

```go
import (
    "context"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/codes"
)

var tracer = otel.Tracer("myapp")

func processRequest(ctx context.Context) error {
    ctx, span := tracer.Start(ctx, "processRequest")
    defer span.End()

    // Add attributes
    span.SetAttributes(
        attribute.String("user.id", "123"),
        attribute.Int("batch.size", 100),
    )

    // Call sub-function (will create child span)
    if err := fetchData(ctx); err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return err
    }

    // Add event
    span.AddEvent("data processed", attribute.Int("records", 100))

    span.SetStatus(codes.Ok, "success")
    return nil
}

func fetchData(ctx context.Context) error {
    ctx, span := tracer.Start(ctx, "fetchData")
    defer span.End()

    // Database query or external API call
    // ...

    return nil
}
```

### Database Instrumentation (pgx)

```go
import (
    "github.com/jackc/pgx/v5"
    "go.opentelemetry.io/contrib/instrumentation/github.com/jackc/pgx/v5/otelpgx"
)

func connectDB(databaseURL string) (*pgx.Conn, error) {
    config, err := pgx.ParseConfig(databaseURL)
    if err != nil {
        return nil, err
    }

    // Add OTEL tracer
    config.Tracer = otelpgx.NewTracer()

    return pgx.ConnectConfig(context.Background(), config)
}
```

---

## Prometheus Metrics

### Installation

```bash
go get github.com/prometheus/client_golang/prometheus
go get github.com/prometheus/client_golang/prometheus/promhttp
```

### Defining Metrics

```go
package metrics

import (
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promauto"
)

var (
    // Counter: Monotonically increasing value
    httpRequestsTotal = promauto.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests",
        },
        []string{"method", "path", "status"},
    )

    // Gauge: Value that can go up or down
    activeConnections = promauto.NewGauge(
        prometheus.GaugeOpts{
            Name: "active_connections",
            Help: "Number of active connections",
        },
    )

    // Histogram: Distribution of values (latency, size)
    httpDuration = promauto.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP request latency in seconds",
            Buckets: prometheus.DefBuckets, // [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
        },
        []string{"method", "path"},
    )

    // Summary: Similar to histogram, with quantiles
    responseSize = promauto.NewSummaryVec(
        prometheus.SummaryOpts{
            Name:       "http_response_size_bytes",
            Help:       "HTTP response size in bytes",
            Objectives: map[float64]float64{0.5: 0.05, 0.9: 0.01, 0.99: 0.001},
        },
        []string{"method", "path"},
    )
)

// Increment counter
func RecordRequest(method, path string, status int) {
    httpRequestsTotal.WithLabelValues(method, path, fmt.Sprint(status)).Inc()
}

// Set gauge
func SetActiveConnections(count int) {
    activeConnections.Set(float64(count))
}

// Observe value
func RecordDuration(method, path string, duration time.Duration) {
    httpDuration.WithLabelValues(method, path).Observe(duration.Seconds())
}
```

### HTTP Middleware

```go
func MetricsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()

        // Wrap response writer to capture status code
        recorder := &responseRecorder{ResponseWriter: w, statusCode: http.StatusOK}

        next.ServeHTTP(recorder, r)

        duration := time.Since(start)

        // Record metrics
        httpRequestsTotal.WithLabelValues(
            r.Method,
            r.URL.Path,
            fmt.Sprint(recorder.statusCode),
        ).Inc()

        httpDuration.WithLabelValues(
            r.Method,
            r.URL.Path,
        ).Observe(duration.Seconds())
    })
}

type responseRecorder struct {
    http.ResponseWriter
    statusCode int
}

func (r *responseRecorder) WriteHeader(statusCode int) {
    r.statusCode = statusCode
    r.ResponseWriter.WriteHeader(statusCode)
}
```

### Expose Metrics Endpoint

```go
import (
    "net/http"

    "github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
    // Metrics endpoint
    http.Handle("/metrics", promhttp.Handler())

    // Application endpoints
    http.Handle("/api/", MetricsMiddleware(apiHandler))

    http.ListenAndServe(":8080", nil)
}
```

---

## Structured Logging

### Using slog (Go 1.21+)

```go
import (
    "log/slog"
    "os"
)

func initLogger() *slog.Logger {
    // JSON handler for production
    handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelInfo,
        AddSource: true, // Include file:line
    })

    return slog.New(handler)
}

func main() {
    logger := initLogger()

    logger.Info("server starting",
        slog.String("addr", ":8080"),
        slog.Int("port", 8080),
    )

    // With context
    ctx := context.Background()
    logger.InfoContext(ctx, "processing request",
        slog.String("user_id", "123"),
        slog.Duration("duration", 150*time.Millisecond),
    )

    // Error logging
    err := processRequest()
    if err != nil {
        logger.Error("request failed",
            slog.String("error", err.Error()),
            slog.String("user_id", "123"),
        )
    }

    // Grouped attributes
    logger.Info("user action",
        slog.Group("user",
            slog.String("id", "123"),
            slog.String("email", "user@example.com"),
        ),
        slog.Group("action",
            slog.String("type", "login"),
            slog.Time("timestamp", time.Now()),
        ),
    )
}
```

### Correlation with Traces

```go
import (
    "log/slog"

    "go.opentelemetry.io/otel/trace"
)

func logWithTrace(ctx context.Context, logger *slog.Logger, msg string, attrs ...slog.Attr) {
    span := trace.SpanFromContext(ctx)
    if span.SpanContext().IsValid() {
        attrs = append(attrs,
            slog.String("trace_id", span.SpanContext().TraceID().String()),
            slog.String("span_id", span.SpanContext().SpanID().String()),
        )
    }

    logger.LogAttrs(ctx, slog.LevelInfo, msg, attrs...)
}

// Usage
logWithTrace(ctx, logger, "processing payment",
    slog.String("user_id", "123"),
    slog.Float64("amount", 99.99),
)
```

---

## Health Checks

```go
type HealthChecker struct {
    db    *sql.DB
    redis *redis.Client
}

func (h *HealthChecker) LivenessHandler(w http.ResponseWriter, r *http.Request) {
    // Basic check: is the service running?
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))
}

func (h *HealthChecker) ReadinessHandler(w http.ResponseWriter, r *http.Request) {
    // Check dependencies
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    checks := []struct {
        name  string
        check func(context.Context) error
    }{
        {"database", h.checkDB},
        {"redis", h.checkRedis},
    }

    results := make(map[string]string)
    healthy := true

    for _, c := range checks {
        if err := c.check(ctx); err != nil {
            results[c.name] = fmt.Sprintf("unhealthy: %v", err)
            healthy = false
        } else {
            results[c.name] = "healthy"
        }
    }

    w.Header().Set("Content-Type", "application/json")
    if healthy {
        w.WriteHeader(http.StatusOK)
    } else {
        w.WriteHeader(http.StatusServiceUnavailable)
    }

    json.NewEncoder(w).Encode(map[string]interface{}{
        "status": results,
    })
}

func (h *HealthChecker) checkDB(ctx context.Context) error {
    return h.db.PingContext(ctx)
}

func (h *HealthChecker) checkRedis(ctx context.Context) error {
    return h.redis.Ping(ctx).Err()
}
```

---

## Grafana Dashboard (PromQL Examples)

### Request Rate
```promql
rate(http_requests_total[5m])
```

### Error Rate
```promql
rate(http_requests_total{status=~"5.."}[5m])
```

### Latency (p50, p95, p99)
```promql
histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

### RED Metrics (Rate, Errors, Duration)
```promql
# Rate
sum(rate(http_requests_total[5m])) by (method, path)

# Errors
sum(rate(http_requests_total{status=~"5.."}[5m])) by (method, path)

# Duration
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

---

## Best Practices

### 1. Use Semantic Conventions
```go
// Follow OpenTelemetry semantic conventions
span.SetAttributes(
    semconv.HTTPMethod("GET"),
    semconv.HTTPStatusCode(200),
    semconv.HTTPTarget("/api/users"),
)
```

### 2. Meaningful Metric Names
```go
// ✅ GOOD
http_requests_total
http_request_duration_seconds
database_queries_total

// ❌ BAD
requests
duration
queries
```

### 3. Cardinality Control
```go
// ❌ BAD: Unbounded labels (user ID, trace ID, etc.)
httpRequestsTotal.WithLabelValues(userID, traceID).Inc()

// ✅ GOOD: Limited cardinality (method, path, status)
httpRequestsTotal.WithLabelValues(method, path, status).Inc()
```

### 4. Context Propagation
```go
// ALWAYS pass context through call chain
func processRequest(ctx context.Context) error {
    ctx, span := tracer.Start(ctx, "processRequest")
    defer span.End()

    return fetchData(ctx) // Pass context!
}
```

### 5. Structured Logging
```go
// ✅ GOOD: Structured
logger.Info("user login", slog.String("user_id", userID))

// ❌ BAD: Unstructured
logger.Info(fmt.Sprintf("user %s logged in", userID))
```

---

## Common Pitfalls

### ❌ Not closing spans
```go
ctx, span := tracer.Start(ctx, "operation")
defer span.End() // ALWAYS defer
```

### ❌ High cardinality metrics
- User IDs, trace IDs, etc. as labels
- Causes memory issues in Prometheus

### ❌ Blocking exporters
- Use batching exporters
- Set timeouts

### ❌ No sampling in production
- Trace every request = expensive
- Use ParentBased sampler

### ❌ Logging sensitive data
- Never log passwords, tokens, PII
- Redact in logs

---

## References

- OpenTelemetry Go: https://opentelemetry.io/docs/instrumentation/go/
- Prometheus: https://prometheus.io/docs/
- Grafana: https://grafana.com/docs/
- Go slog: https://pkg.go.dev/log/slog
