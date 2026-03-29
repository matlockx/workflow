---
name: kafka
description: Reference for Apache Kafka in Go - producers, consumers, consumer groups, error handling, and operational patterns for event-driven services.
license: MIT
metadata:
  stack: backend
  languages: [go]
---

# Kafka Skill

Reference for working with Apache Kafka in Go backend services.

> **Preferred Approach**: For production Go services, use the [startup](../startup/SKILL.md) library
> which provides `KafkaOptions` with CLI flag parsing and consumer setup.
> See [startup skill](../startup/SKILL.md) for patterns.

## Popular Go Libraries

### Confluent Kafka Go (librdkafka wrapper)
- **Package**: `github.com/confluentinc/confluent-kafka-go/kafka`
- **Pros**: High performance, feature-complete, battle-tested
- **Cons**: CGO dependency (requires librdkafka installed)

### Sarama (Pure Go)
- **Package**: `github.com/Shopify/sarama`
- **Pros**: Pure Go (no CGO), wide adoption
- **Cons**: Complex API, more manual configuration

### Kafka-go (segmentio)
- **Package**: `github.com/segmentio/kafka-go`
- **Pros**: Pure Go, simple API, good performance
- **Cons**: Less feature-complete than confluent-kafka-go

**Recommendation**: Use **confluent-kafka-go** for production services (performance + reliability), **kafka-go** for simpler use cases without CGO.

---

## Producer Patterns

### Basic Producer (confluent-kafka-go)

```go
import (
    "github.com/confluentinc/confluent-kafka-go/kafka"
)

type Producer struct {
    p *kafka.Producer
}

func NewProducer(brokers string) (*Producer, error) {
    p, err := kafka.NewProducer(&kafka.ConfigMap{
        "bootstrap.servers": brokers,
        "acks":              "all",           // Wait for all replicas
        "compression.type":  "snappy",        // Compress messages
        "linger.ms":         10,              // Batch messages up to 10ms
        "batch.size":        16384,           // 16KB batch size
        "max.in.flight.requests.per.connection": 5,
        "idempotence":       true,            // Exactly-once semantics
    })
    if err != nil {
        return nil, fmt.Errorf("create producer: %w", err)
    }

    return &Producer{p: p}, nil
}

func (p *Producer) Produce(ctx context.Context, topic string, key, value []byte) error {
    deliveryChan := make(chan kafka.Event, 1)
    defer close(deliveryChan)

    err := p.p.Produce(&kafka.Message{
        TopicPartition: kafka.TopicPartition{
            Topic:     &topic,
            Partition: kafka.PartitionAny,
        },
        Key:   key,
        Value: value,
    }, deliveryChan)
    if err != nil {
        return fmt.Errorf("produce message: %w", err)
    }

    // Wait for delivery report
    select {
    case <-ctx.Done():
        return ctx.Err()
    case e := <-deliveryChan:
        m := e.(*kafka.Message)
        if m.TopicPartition.Error != nil {
            return fmt.Errorf("delivery failed: %w", m.TopicPartition.Error)
        }
        return nil
    }
}

func (p *Producer) Close() {
    p.p.Flush(5000) // Wait up to 5s for pending messages
    p.p.Close()
}
```

### Async Producer (Fire-and-Forget with Background Error Handling)

```go
func (p *Producer) ProduceAsync(ctx context.Context, topic string, key, value []byte) error {
    return p.p.Produce(&kafka.Message{
        TopicPartition: kafka.TopicPartition{
            Topic:     &topic,
            Partition: kafka.PartitionAny,
        },
        Key:   key,
        Value: value,
    }, nil) // No delivery channel = async
}

// Run background goroutine to handle delivery reports
func (p *Producer) HandleEvents(ctx context.Context) {
    go func() {
        for {
            select {
            case <-ctx.Done():
                return
            case e := <-p.p.Events():
                switch ev := e.(type) {
                case *kafka.Message:
                    if ev.TopicPartition.Error != nil {
                        log.Printf("delivery failed: %v", ev.TopicPartition.Error)
                        // Handle error: retry, dead-letter queue, alert
                    }
                case kafka.Error:
                    log.Printf("kafka error: %v", ev)
                }
            }
        }
    }()
}
```

---

## Consumer Patterns

### Basic Consumer (Consumer Group)

```go
type Consumer struct {
    c *kafka.Consumer
}

func NewConsumer(brokers, groupID string, topics []string) (*Consumer, error) {
    c, err := kafka.NewConsumer(&kafka.ConfigMap{
        "bootstrap.servers":  brokers,
        "group.id":           groupID,
        "auto.offset.reset":  "earliest",     // Start from beginning if no offset
        "enable.auto.commit": false,          // Manual commit for control
        "session.timeout.ms": 6000,
        "max.poll.interval.ms": 300000,       // 5 minutes
    })
    if err != nil {
        return nil, fmt.Errorf("create consumer: %w", err)
    }

    if err := c.SubscribeTopics(topics, nil); err != nil {
        c.Close()
        return nil, fmt.Errorf("subscribe: %w", err)
    }

    return &Consumer{c: c}, nil
}

func (c *Consumer) Consume(ctx context.Context, handler func(*kafka.Message) error) error {
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
        }

        msg, err := c.c.ReadMessage(100 * time.Millisecond)
        if err != nil {
            if err.(kafka.Error).Code() == kafka.ErrTimedOut {
                continue
            }
            return fmt.Errorf("read message: %w", err)
        }

        // Process message
        if err := handler(msg); err != nil {
            log.Printf("handler error: %v", err)
            // Don't commit on error - message will be redelivered
            continue
        }

        // Commit offset after successful processing
        if _, err := c.c.CommitMessage(msg); err != nil {
            log.Printf("commit error: %v", err)
        }
    }
}

func (c *Consumer) Close() error {
    return c.c.Close()
}
```

### Batch Processing Consumer

```go
func (c *Consumer) ConsumeBatch(ctx context.Context, batchSize int, handler func([]*kafka.Message) error) error {
    batch := make([]*kafka.Message, 0, batchSize)
    ticker := time.NewTicker(5 * time.Second) // Flush every 5s even if batch incomplete
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            // Process remaining messages before shutdown
            if len(batch) > 0 {
                _ = handler(batch)
            }
            return ctx.Err()

        case <-ticker.C:
            if len(batch) > 0 {
                if err := handler(batch); err != nil {
                    log.Printf("batch handler error: %v", err)
                } else {
                    // Commit last message offset
                    c.c.CommitMessage(batch[len(batch)-1])
                }
                batch = batch[:0]
            }

        default:
            msg, err := c.c.ReadMessage(100 * time.Millisecond)
            if err != nil {
                if err.(kafka.Error).Code() == kafka.ErrTimedOut {
                    continue
                }
                return fmt.Errorf("read message: %w", err)
            }

            batch = append(batch, msg)

            if len(batch) >= batchSize {
                if err := handler(batch); err != nil {
                    log.Printf("batch handler error: %v", err)
                } else {
                    c.c.CommitMessage(batch[len(batch)-1])
                }
                batch = batch[:0]
            }
        }
    }
}
```

---

## Error Handling

### Retry with Exponential Backoff

```go
func (p *Producer) ProduceWithRetry(ctx context.Context, topic string, key, value []byte, maxRetries int) error {
    backoff := 100 * time.Millisecond

    for attempt := 0; attempt <= maxRetries; attempt++ {
        err := p.Produce(ctx, topic, key, value)
        if err == nil {
            return nil
        }

        // Check if error is retryable
        if kafkaErr, ok := err.(kafka.Error); ok {
            switch kafkaErr.Code() {
            case kafka.ErrLeaderNotAvailable,
                 kafka.ErrNotLeaderForPartition,
                 kafka.ErrRequestTimedOut,
                 kafka.ErrNetworkException:
                // Retryable errors - continue
            default:
                // Non-retryable error
                return err
            }
        }

        if attempt == maxRetries {
            return fmt.Errorf("max retries exceeded: %w", err)
        }

        // Exponential backoff
        select {
        case <-ctx.Done():
            return ctx.Err()
        case <-time.After(backoff):
            backoff *= 2
            if backoff > 5*time.Second {
                backoff = 5 * time.Second
            }
        }
    }

    return nil
}
```

### Dead Letter Queue Pattern

```go
type ProducerWithDLQ struct {
    producer *Producer
    dlqTopic string
}

func (p *ProducerWithDLQ) ProduceOrDLQ(ctx context.Context, topic string, key, value []byte) error {
    err := p.producer.ProduceWithRetry(ctx, topic, key, value, 3)
    if err != nil {
        log.Printf("sending to DLQ: %v", err)
        
        // Add error metadata
        dlqValue := map[string]interface{}{
            "original_topic": topic,
            "error":          err.Error(),
            "timestamp":      time.Now().Unix(),
            "payload":        value,
        }
        dlqBytes, _ := json.Marshal(dlqValue)

        // Send to DLQ (don't retry DLQ failures)
        return p.producer.Produce(ctx, p.dlqTopic, key, dlqBytes)
    }
    return nil
}
```

---

## Message Serialization

### JSON Messages

```go
type Event struct {
    ID        string    `json:"id"`
    Type      string    `json:"type"`
    Timestamp time.Time `json:"timestamp"`
    Data      json.RawMessage `json:"data"`
}

func (p *Producer) ProduceEvent(ctx context.Context, topic string, event *Event) error {
    value, err := json.Marshal(event)
    if err != nil {
        return fmt.Errorf("marshal event: %w", err)
    }

    key := []byte(event.ID)
    return p.Produce(ctx, topic, key, value)
}
```

### Protobuf Messages

```go
import "google.golang.org/protobuf/proto"

func (p *Producer) ProduceProto(ctx context.Context, topic string, key string, msg proto.Message) error {
    value, err := proto.Marshal(msg)
    if err != nil {
        return fmt.Errorf("marshal proto: %w", err)
    }

    return p.Produce(ctx, topic, []byte(key), value)
}

func DecodeProto(msg *kafka.Message, out proto.Message) error {
    return proto.Unmarshal(msg.Value, out)
}
```

---

## Testing

### Mock Producer for Tests

```go
type MockProducer struct {
    messages []ProducedMessage
    mu       sync.Mutex
}

type ProducedMessage struct {
    Topic string
    Key   []byte
    Value []byte
}

func (m *MockProducer) Produce(ctx context.Context, topic string, key, value []byte) error {
    m.mu.Lock()
    defer m.mu.Unlock()

    m.messages = append(m.messages, ProducedMessage{
        Topic: topic,
        Key:   key,
        Value: value,
    })
    return nil
}

func (m *MockProducer) GetMessages() []ProducedMessage {
    m.mu.Lock()
    defer m.mu.Unlock()
    return append([]ProducedMessage{}, m.messages...)
}

// Usage in tests
func TestEventPublisher(t *testing.T) {
    mock := &MockProducer{}
    publisher := NewEventPublisher(mock)

    err := publisher.PublishUserCreated(ctx, userID)
    assert.NoError(t, err)

    messages := mock.GetMessages()
    assert.Len(t, messages, 1)
    assert.Equal(t, "user.created", messages[0].Topic)
}
```

---

## Operational Best Practices

### Graceful Shutdown

```go
func main() {
    producer, _ := NewProducer("localhost:9092")
    consumer, _ := NewConsumer("localhost:9092", "my-group", []string{"events"})

    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // Handle signals
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

    go func() {
        <-sigChan
        log.Println("shutting down...")
        cancel()
    }()

    // Start consumer
    go func() {
        if err := consumer.Consume(ctx, handleMessage); err != nil {
            log.Printf("consumer error: %v", err)
        }
    }()

    <-ctx.Done()

    // Cleanup
    producer.Close()
    consumer.Close()
    log.Println("shutdown complete")
}
```

### Monitoring Metrics

```go
import "github.com/prometheus/client_golang/prometheus"

var (
    messagesProduced = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "kafka_messages_produced_total",
            Help: "Total number of messages produced",
        },
        []string{"topic", "status"},
    )

    messagesConsumed = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "kafka_messages_consumed_total",
            Help: "Total number of messages consumed",
        },
        []string{"topic", "status"},
    )

    consumerLag = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "kafka_consumer_lag",
            Help: "Consumer lag by topic and partition",
        },
        []string{"topic", "partition"},
    )
)

func init() {
    prometheus.MustRegister(messagesProduced, messagesConsumed, consumerLag)
}

func (p *Producer) ProduceWithMetrics(ctx context.Context, topic string, key, value []byte) error {
    err := p.Produce(ctx, topic, key, value)
    
    status := "success"
    if err != nil {
        status = "error"
    }
    messagesProduced.WithLabelValues(topic, status).Inc()
    
    return err
}
```

---

## Common Pitfalls

### ❌ Not handling rebalances properly
```go
// Consumer may lose messages if not committed before rebalance
// ALWAYS use manual commit and handle RebalanceCallback
```

### ❌ Blocking consumer for too long
```go
// max.poll.interval.ms = 5 minutes default
// If handler takes >5min, consumer is kicked from group
// Solution: Process async or increase timeout
```

### ❌ Not setting idempotence
```go
// Without idempotence, duplicate messages possible
// ALWAYS set "idempotence": true for producers
```

### ❌ Auto-committing offsets
```go
// enable.auto.commit = true is dangerous
// Message may be committed before processing succeeds
// ALWAYS use manual commit: enable.auto.commit = false
```

### ❌ Ignoring partition key
```go
// Without key, messages distributed randomly across partitions
// Related events may be out-of-order
// ALWAYS use meaningful keys for ordering guarantees
```

---

## References

- Confluent Kafka Go: https://github.com/confluentinc/confluent-kafka-go
- Sarama: https://github.com/Shopify/sarama
- Kafka-go: https://github.com/segmentio/kafka-go
- Kafka Documentation: https://kafka.apache.org/documentation/
