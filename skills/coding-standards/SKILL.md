---
name: coding-standards
description: Universal coding standards, best practices, and patterns for Go, Rust, Swift, TypeScript, JavaScript, React, and Node.js development.
---

# Coding Standards & Best Practices

Universal coding standards applicable across all projects.

## Code Quality Principles

### 1. Readability First
- Code is read more than written
- Clear variable and function names
- Self-documenting code preferred over comments
- Consistent formatting

### 2. KISS (Keep It Simple, Stupid)
- Simplest solution that works
- Avoid over-engineering
- No premature optimization
- Easy to understand > clever code

### 3. DRY (Don't Repeat Yourself)
- Extract common logic into functions
- Create reusable components
- Share utilities across modules
- Avoid copy-paste programming

### 4. YAGNI (You Aren't Gonna Need It)
- Don't build features before they're needed
- Avoid speculative generality
- Add complexity only when required
- Start simple, refactor when needed

## TypeScript/JavaScript Standards

### Formatting

- Use Prettier with single quotes, trailing commas, and a print width of 100.
- Prefer running `yarn lint --fix` over manual formatting.

### Imports

- Use ES6 imports.
- For third-party libraries like lodash, import specific functions (e.g., `import { get } from 'lodash'`).

### General

- Follow existing patterns in the codebase.
- Do not introduce new libraries without discussion.

### Variable Naming

- Use `camelCase` for variables.
- Prefer descriptive names over abbreviations.

```typescript
// ✅ GOOD: Descriptive names
const marketSearchQuery = 'election'
const isUserAuthenticated = true
const totalRevenue = 1000

// ❌ BAD: Unclear names
const q = 'election'
const flag = true
const x = 1000
```

### Function Naming

- Use `camelCase` for functions.
- Prefer verb-noun naming (e.g., `fetchX`, `calculateY`, `isZ`).

```typescript
// ✅ GOOD: Verb-noun pattern
async function fetchMarketData(marketId: string) { }
function calculateSimilarity(a: number[], b: number[]) { }
function isValidEmail(email: string): boolean { }

// ❌ BAD: Unclear or noun-only
async function market(id: string) { }
function similarity(a, b) { }
function email(e) { }
```

### Immutability Pattern (CRITICAL)

```typescript
// ✅ ALWAYS use spread operator
const updatedUser = {
  ...user,
  name: 'New Name'
}

const updatedArray = [...items, newItem]

// ❌ NEVER mutate directly
user.name = 'New Name'  // BAD
items.push(newItem)     // BAD
```

### Error Handling

- Prefer a codebase-provided error helper when available (e.g., `utils/error.js` with `error.throwError()`).
- Include context and preserve the original error when rethrowing.

```typescript
// ✅ GOOD: Comprehensive error handling
async function fetchData(url: string) {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Fetch failed:', error)
    throw new Error('Failed to fetch data')
  }
}

// ❌ BAD: No error handling
async function fetchData(url) {
  const response = await fetch(url)
  return response.json()
}
```

### Async/Await Best Practices

```typescript
// ✅ GOOD: Parallel execution when possible
const [users, markets, stats] = await Promise.all([
  fetchUsers(),
  fetchMarkets(),
  fetchStats()
])

// ❌ BAD: Sequential when unnecessary
const users = await fetchUsers()
const markets = await fetchMarkets()
const stats = await fetchStats()
```

### Type Safety

- Prefer TypeScript for new modules; use JSDoc for type hints in `.js` files when needed.
- Use `PascalCase` for classes and enums.
- Use `snake_case` for database fields/columns.

```typescript
// ✅ GOOD: Proper types
interface Market {
  id: string
  name: string
  status: 'active' | 'resolved' | 'closed'
  created_at: Date
}

function getMarket(id: string): Promise<Market> {
  // Implementation
}

// ❌ BAD: Using 'any'
function getMarket(id: any): Promise<any> {
  // Implementation
}
```

### Reference Style Guides

- CommonJS: <https://google.github.io/styleguide/jsguide.html>
- TypeScript: <https://google.github.io/styleguide/tsguide.html>

## React Best Practices

### Component Structure

```typescript
// ✅ GOOD: Functional component with types
interface ButtonProps {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

export function Button({
  children,
  onClick,
  disabled = false,
  variant = 'primary'
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  )
}

// ❌ BAD: No types, unclear structure
export function Button(props) {
  return <button onClick={props.onClick}>{props.children}</button>
}
```

### Custom Hooks

```typescript
// ✅ GOOD: Reusable custom hook
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

// Usage
const debouncedQuery = useDebounce(searchQuery, 500)
```

### State Management

```typescript
// ✅ GOOD: Proper state updates
const [count, setCount] = useState(0)

// Functional update for state based on previous state
setCount(prev => prev + 1)

// ❌ BAD: Direct state reference
setCount(count + 1)  // Can be stale in async scenarios
```

### Conditional Rendering

```typescript
// ✅ GOOD: Clear conditional rendering
{isLoading && <Spinner />}
{error && <ErrorMessage error={error} />}
{data && <DataDisplay data={data} />}

// ❌ BAD: Ternary hell
{isLoading ? <Spinner /> : error ? <ErrorMessage error={error} /> : data ? <DataDisplay data={data} /> : null}
```

## API Design Standards

### REST API Conventions

```
GET    /api/markets              # List all markets
GET    /api/markets/:id          # Get specific market
POST   /api/markets              # Create new market
PUT    /api/markets/:id          # Update market (full)
PATCH  /api/markets/:id          # Update market (partial)
DELETE /api/markets/:id          # Delete market

# Query parameters for filtering
GET /api/markets?status=active&limit=10&offset=0
```

### Response Format

```typescript
// ✅ GOOD: Consistent response structure
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}

// Success response
return NextResponse.json({
  success: true,
  data: markets,
  meta: { total: 100, page: 1, limit: 10 }
})

// Error response
return NextResponse.json({
  success: false,
  error: 'Invalid request'
}, { status: 400 })
```

### Input Validation

```typescript
import { z } from 'zod'

// ✅ GOOD: Schema validation
const CreateMarketSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  endDate: z.string().datetime(),
  categories: z.array(z.string()).min(1)
})

export async function POST(request: Request) {
  const body = await request.json()

  try {
    const validated = CreateMarketSchema.parse(body)
    // Proceed with validated data
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 })
    }
  }
}
```

## File Organization

### Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── markets/           # Market pages
│   └── (auth)/           # Auth pages (route groups)
├── components/            # React components
│   ├── ui/               # Generic UI components
│   ├── forms/            # Form components
│   └── layouts/          # Layout components
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and configs
│   ├── api/             # API clients
│   ├── utils/           # Helper functions
│   └── constants/       # Constants
├── types/                # TypeScript types
└── styles/              # Global styles
```

### File Naming

```
components/Button.tsx          # PascalCase for components
hooks/useAuth.ts              # camelCase with 'use' prefix
lib/formatDate.ts             # camelCase for utilities
types/market.types.ts         # camelCase with .types suffix
```

## Comments & Documentation

### When to Comment

```typescript
// ✅ GOOD: Explain WHY, not WHAT
// Use exponential backoff to avoid overwhelming the API during outages
const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)

// Deliberately using mutation here for performance with large arrays
items.push(newItem)

// ❌ BAD: Stating the obvious
// Increment counter by 1
count++

// Set name to user's name
name = user.name
```

### JSDoc for Public APIs

```typescript
/**
 * Searches markets using semantic similarity.
 *
 * @param query - Natural language search query
 * @param limit - Maximum number of results (default: 10)
 * @returns Array of markets sorted by similarity score
 * @throws {Error} If OpenAI API fails or Redis unavailable
 *
 * @example
 * ```typescript
 * const results = await searchMarkets('election', 5)
 * console.log(results[0].name) // "Trump vs Biden"
 * ```
 */
export async function searchMarkets(
  query: string,
  limit: number = 10
): Promise<Market[]> {
  // Implementation
}
```

## Performance Best Practices

### Memoization

```typescript
import { useMemo, useCallback } from 'react'

// ✅ GOOD: Memoize expensive computations
const sortedMarkets = useMemo(() => {
  return markets.sort((a, b) => b.volume - a.volume)
}, [markets])

// ✅ GOOD: Memoize callbacks
const handleSearch = useCallback((query: string) => {
  setSearchQuery(query)
}, [])
```

### Lazy Loading

```typescript
import { lazy, Suspense } from 'react'

// ✅ GOOD: Lazy load heavy components
const HeavyChart = lazy(() => import('./HeavyChart'))

export function Dashboard() {
  return (
    <Suspense fallback={<Spinner />}>
      <HeavyChart />
    </Suspense>
  )
}
```

### Database Queries

```typescript
// ✅ GOOD: Select only needed columns
const { data } = await supabase
  .from('markets')
  .select('id, name, status')
  .limit(10)

// ❌ BAD: Select everything
const { data } = await supabase
  .from('markets')
  .select('*')
```

## Testing Standards

### Test Structure (AAA Pattern)

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

### Test Naming

```typescript
// ✅ GOOD: Descriptive test names
test('returns empty array when no markets match query', () => { })
test('throws error when OpenAI API key is missing', () => { })
test('falls back to substring search when Redis unavailable', () => { })

// ❌ BAD: Vague test names
test('works', () => { })
test('test search', () => { })
```

## Code Smell Detection

Watch for these anti-patterns:

### 1. Long Functions
```typescript
// ❌ BAD: Function > 50 lines
function processMarketData() {
  // 100 lines of code
}

// ✅ GOOD: Split into smaller functions
function processMarketData() {
  const validated = validateData()
  const transformed = transformData(validated)
  return saveData(transformed)
}
```

### 2. Deep Nesting
```typescript
// ❌ BAD: 5+ levels of nesting
if (user) {
  if (user.isAdmin) {
    if (market) {
      if (market.isActive) {
        if (hasPermission) {
          // Do something
        }
      }
    }
  }
}

// ✅ GOOD: Early returns
if (!user) return
if (!user.isAdmin) return
if (!market) return
if (!market.isActive) return
if (!hasPermission) return

// Do something
```

### 3. Magic Numbers
```typescript
// ❌ BAD: Unexplained numbers
if (retryCount > 3) { }
setTimeout(callback, 500)

// ✅ GOOD: Named constants
const MAX_RETRIES = 3
const DEBOUNCE_DELAY_MS = 500

if (retryCount > MAX_RETRIES) { }
setTimeout(callback, DEBOUNCE_DELAY_MS)
```

---

## Go Standards

For comprehensive Go development guidance, see the dedicated **`golang` skill** which covers:

- Go Proverbs from Rob Pike
- Naming conventions and interface design
- Error handling patterns (including the `errWriter` pattern)
- Concurrency best practices
- Testing patterns
- Common pitfalls

The `golang` skill is based on authoritative sources: [Go Proverbs](https://go-proverbs.github.io/), 
[Effective Go](https://go.dev/doc/effective_go), [Code Review Comments](https://go.dev/wiki/CodeReviewComments), 
and [Google's Go Style Guide](https://google.github.io/styleguide/go/).

---

## Rust Standards

### Formatting & Linting

```bash
# Always run before commit
cargo fmt
cargo clippy -- -D warnings
```

### Naming Conventions

```rust
// Types, traits, enums - UpperCamelCase
struct UserService {}
trait Repository {}
enum UserRole { Admin, User, Guest }

// Functions, methods, variables - snake_case
fn create_user(email: &str) -> Result<User, Error> {}
let user_id = "123";

// Constants and statics - SCREAMING_SNAKE_CASE
const MAX_RETRIES: u32 = 3;
static DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

// Modules and crates - snake_case
mod user_service;
mod database;
```

### Error Handling

```rust
// Use thiserror for library/service errors
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("user not found: {id}")]
    NotFound { id: String },

    #[error("validation failed: {field} - {message}")]
    Validation { field: String, message: String },

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("unexpected error: {0}")]
    Internal(#[from] anyhow::Error),
}

// Use anyhow for application/binary errors
use anyhow::{Context, Result};

fn load_config(path: &str) -> Result<Config> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read config from {path}"))?;

    let config: Config = toml::from_str(&content)
        .context("failed to parse config")?;

    Ok(config)
}

// ✅ GOOD: Propagate with ?
fn process(id: &str) -> Result<Output, ServiceError> {
    let user = repo.find(id)?;
    let result = transform(user)?;
    Ok(result)
}

// ❌ BAD: Panic in library code
fn process(id: &str) -> Output {
    let user = repo.find(id).unwrap();  // Don't panic in libs
    transform(user).unwrap()
}
```

### Ownership and Borrowing

```rust
// Prefer borrowing over cloning
fn process_user(user: &User) -> Summary {  // borrow
    // ...
}

// Clone only when needed
fn store_user(user: User) -> StoredUser {  // owned, stored elsewhere
    // ...
}

// Use Cow for conditionally owned data
use std::borrow::Cow;

fn normalize(s: &str) -> Cow<str> {
    if s.contains(' ') {
        Cow::Owned(s.replace(' ', "_"))
    } else {
        Cow::Borrowed(s)
    }
}

// ✅ GOOD: Return references when lifetime allows
fn first_user<'a>(users: &'a [User]) -> Option<&'a User> {
    users.first()
}

// ❌ BAD: Unnecessary clone
fn get_name(user: &User) -> String {
    user.name.clone()  // Only clone if you need owned value
}
```

### Async (Tokio)

```rust
use tokio::time::{timeout, Duration};

// ✅ GOOD: Async functions return futures
async fn fetch_user(id: &str) -> Result<User, ServiceError> {
    let user = db.find_user(id).await?;
    Ok(user)
}

// ✅ GOOD: Parallel with join!
async fn fetch_all(id: &str) -> Result<(User, Vec<Order>), ServiceError> {
    let (user, orders) = tokio::try_join!(
        fetch_user(id),
        fetch_orders(id),
    )?;
    Ok((user, orders))
}

// ✅ GOOD: Timeout handling
async fn fetch_with_timeout(id: &str) -> Result<User, ServiceError> {
    timeout(Duration::from_secs(5), fetch_user(id))
        .await
        .map_err(|_| ServiceError::Timeout)?
}

// ❌ BAD: Blocking inside async
async fn process() {
    std::thread::sleep(Duration::from_secs(1));  // Blocks runtime!
    // Use: tokio::time::sleep(Duration::from_secs(1)).await;
}
```

### Traits and Generics

```rust
// Define traits for dependency injection
#[async_trait::async_trait]
pub trait UserRepository: Send + Sync {
    async fn find(&self, id: &str) -> Result<User, ServiceError>;
    async fn create(&self, input: CreateUserInput) -> Result<User, ServiceError>;
    async fn delete(&self, id: &str) -> Result<(), ServiceError>;
}

// Generic service - depends on trait, not concrete type
pub struct UserService<R: UserRepository> {
    repo: R,
}

impl<R: UserRepository> UserService<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    pub async fn get_user(&self, id: &str) -> Result<User, ServiceError> {
        self.repo.find(id).await
    }
}

// Test with mock
#[cfg(test)]
mod tests {
    use super::*;
    use mockall::automock;

    #[automock]
    #[async_trait::async_trait]
    pub trait UserRepository: Send + Sync { /* ... */ }

    #[tokio::test]
    async fn test_get_user() {
        let mut mock = MockUserRepository::new();
        mock.expect_find()
            .returning(|_| Ok(User { id: "1".into(), ..Default::default() }));

        let service = UserService::new(mock);
        let result = service.get_user("1").await;
        assert!(result.is_ok());
    }
}
```

### Type Safety Patterns

```rust
// Use newtype pattern for semantic types
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UserId(String);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Email(String);

impl Email {
    pub fn new(s: impl Into<String>) -> Result<Self, ValidationError> {
        let email = s.into();
        if email.contains('@') {
            Ok(Self(email))
        } else {
            Err(ValidationError::InvalidEmail(email))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// ✅ GOOD: Compiler catches wrong type
fn send_email(to: Email, subject: &str) {}

// ❌ BAD: Easy to pass wrong string
fn send_email(to: &str, subject: &str) {}
```

### Common Pitfalls

```rust
// ❌ BAD: Holding mutex across await
async fn process(state: Arc<Mutex<State>>) {
    let _guard = state.lock().unwrap();
    some_async_fn().await;  // Lock held across await point!
}

// ✅ GOOD: Drop lock before await
async fn process(state: Arc<Mutex<State>>) {
    let data = {
        let guard = state.lock().unwrap();
        guard.clone()  // Copy data, drop guard
    };
    some_async_fn_with(data).await;
}

// ❌ BAD: Cloning Arc inside hot loop
for item in items {
    let state = state.clone();  // Expensive if tight loop
    tokio::spawn(async move { /* ... */ });
}

// ✅ GOOD: Clone once outside
let state = Arc::clone(&state);
for item in items {
    let state = Arc::clone(&state);
    tokio::spawn(async move { /* ... */ });
}

// ❌ BAD: Ignoring errors
let _ = some_important_operation();  // Silent failure

// ✅ GOOD: Handle or propagate
some_important_operation()?;  // Propagate
// or
if let Err(e) = some_important_operation() {
    tracing::error!("operation failed: {e}");
}
```

### Project Structure

```
myservice/
├── src/
│   ├── main.rs            # Binary entry point
│   ├── lib.rs             # Library root (public API)
│   ├── config.rs          # Configuration loading
│   ├── error.rs           # Error types
│   ├── domain/            # Domain models and logic
│   │   ├── mod.rs
│   │   └── user.rs
│   ├── repository/        # Data access
│   │   ├── mod.rs
│   │   └── postgres.rs
│   ├── service/           # Business logic
│   │   ├── mod.rs
│   │   └── user_service.rs
│   └── api/               # HTTP/gRPC handlers
│       ├── mod.rs
│       └── handlers.rs
├── tests/                 # Integration tests
│   └── user_test.rs
├── Cargo.toml
└── Cargo.lock
```

### Testing Patterns

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // Unit test
    #[test]
    fn test_email_validation() {
        assert!(Email::new("valid@example.com").is_ok());
        assert!(Email::new("invalid").is_err());
    }

    // Async test with tokio
    #[tokio::test]
    async fn test_create_user() {
        let service = setup_test_service().await;
        let result = service.create_user(CreateUserInput {
            email: "test@example.com".to_string(),
            username: "testuser".to_string(),
        }).await;

        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.email, "test@example.com");
    }

    // Table-driven tests
    #[test]
    fn test_password_strength() {
        let cases = vec![
            ("weak", false),
            ("StrongPass123!", true),
            ("short", false),
            ("NoSpecialChar123", false),
        ];

        for (password, expected) in cases {
            assert_eq!(
                is_strong_password(password),
                expected,
                "failed for password: {password}"
            );
        }
    }
}
```

---

## Swift Standards

For comprehensive Swift development guidance, see the dedicated **`swift` skill** which covers:

- API Design Guidelines and naming conventions
- Optionals and error handling (including typed throws in Swift 6)
- Swift 6 concurrency (actors, async/await, Sendable)
- SwiftUI best practices and state management
- Memory management and ARC
- Testing with Swift Testing framework

The `swift` skill is based on authoritative sources: [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/),
[The Swift Programming Language](https://docs.swift.org/swift-book/), [Swift Evolution](https://github.com/apple/swift-evolution),
and WWDC best practices.

---

**Remember**: Code quality is not negotiable. Clear, maintainable code enables rapid development and confident refactoring.
