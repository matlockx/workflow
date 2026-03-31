---
name: swift
description: Comprehensive Swift development skill based on Apple's official guidelines, Swift.org documentation, and modern Swift 6 best practices. Use this skill when writing Swift code, reviewing Swift PRs, or making architectural decisions in Swift/iOS/macOS projects.
---

# Swift Development Skill

Idiomatic Swift development based on authoritative sources from Apple and the Swift community.

> **Note**: Code examples assume Swift 6+ unless otherwise noted. Examples target iOS 17+, macOS 14+, or equivalent platform versions.

## Sources

This skill synthesizes wisdom from:

- [The Swift Programming Language](https://docs.swift.org/swift-book/) — Official language guide
- [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/) — Naming and API conventions
- [Swift Evolution](https://github.com/apple/swift-evolution) — Language proposals and rationale
- [WWDC Sessions](https://developer.apple.com/videos/) — Apple's best practices and new features
- [Swift Style Guide (Google)](https://google.github.io/swift/) — Comprehensive style decisions

**Recent Swift Versions**:
- [Swift 5.9](https://www.swift.org/blog/swift-5.9-released/) — Macros, parameter packs, `if`/`switch` expressions
- [Swift 5.10](https://www.swift.org/blog/swift-5.10-released/) — Complete strict concurrency checking
- [Swift 6.0](https://www.swift.org/blog/announcing-swift-6/) — Data-race safety by default, typed throws, 128-bit integers

---

## Core Principles

### Clarity at the Point of Use

The most important goal is **clarity at the call site**. Code is read far more than written.

```swift
// GOOD: Clear at call site
employees.remove(at: index)
words.insert("Hello", at: startIndex)
greeting.removeAll(keepingCapacity: true)

// BAD: Unclear what arguments mean
employees.remove(index)
words.insert("Hello", startIndex)
greeting.removeAll(true)  // What does true mean?
```

### Prefer Clarity Over Brevity

Don't sacrifice clarity to save keystrokes. Swift code should read like prose.

```swift
// GOOD: Clear intent
func maximumValue(in array: [Int]) -> Int? { ... }
let result = maximumValue(in: numbers)

// BAD: Overly terse
func max(_ a: [Int]) -> Int? { ... }
let result = max(numbers)  // Less discoverable
```

### Every Declaration Should Be Documented

Public APIs deserve documentation. Use Swift's documentation comments.

```swift
/// Returns the element at the specified position.
///
/// - Parameter index: The position of the element to access. `index`
///   must be a valid index of the collection that is not equal to the
///   `endIndex` property.
/// - Returns: The element at the specified index.
/// - Complexity: O(1)
func element(at index: Index) -> Element { ... }
```

---

## Naming Conventions

### General Rules

- **camelCase** for functions, methods, properties, variables
- **PascalCase** for types (structs, classes, enums, protocols, typealiases)
- **SCREAMING_SNAKE_CASE** is NOT used — Swift uses `camelCase` for constants too

```swift
// Types: PascalCase
struct UserProfile { }
class NetworkManager { }
enum PaymentStatus { }
protocol DataFetching { }

// Everything else: camelCase
let currentUser: UserProfile
var isLoading = false
func fetchUserData() { }
let maximumRetryCount = 3  // Not MAXIMUM_RETRY_COUNT
```

### Name According to Role, Not Type

Name variables and parameters based on their role, not their type.

```swift
// GOOD: Names describe role
var greeting: String
var bodyText: NSAttributedString
var userCount: Int

// BAD: Names just repeat type
var string: String
var attributedString: NSAttributedString
var int: Int
```

### Omit Needless Words

Omit words that merely repeat type information.

```swift
// GOOD
func remove(_ member: Element) -> Element?
func add(_ observer: NSObject, for keyPath: String)

// BAD: Redundant type information
func removeElement(_ member: Element) -> Element?
func addObserver(_ observer: NSObject, forKeyPath keyPath: String)
```

### Label All Arguments

Include all words needed to avoid ambiguity. First argument gets a label when it's not part of a grammatical phrase.

```swift
// GOOD: Clear argument roles
func move(from start: Index, to end: Index)
func remove(at index: Index)
func insert(_ element: Element, at index: Index)
func encode(to encoder: Encoder) throws

// Usage reads as prose
items.move(from: i, to: j)
items.remove(at: index)
items.insert(newItem, at: 0)
try item.encode(to: jsonEncoder)
```

### Compensate for Weak Type Information

When a parameter type is `Any`, `AnyObject`, or a fundamental type like `Int` or `String`, add clarity through argument labels.

```swift
// GOOD: Labels clarify meaning
func addConstraint(_ constraint: NSLayoutConstraint)  // Type is clear
func add(_ subview: UIView)                           // Type is clear
func dismiss(animated: Bool)                          // Bool needs label
func move(toX x: CGFloat, y: CGFloat)                // CGFloat needs label

// BAD: Unclear
func dismiss(_ animated: Bool)  // What's the Bool?
func move(_ x: CGFloat, _ y: CGFloat)  // Which is x, which is y?
```

### Fluent Usage

Methods and functions should read as grammatical English phrases.

```swift
// GOOD: Reads naturally
x.insert(y, at: z)          // "x, insert y at z"
x.subviews(havingTag: tag)  // "x's subviews having tag"
x.capitalizingFirstLetter() // "x, capitalizing first letter"

// BAD: Awkward grammar
x.insert(y, position: z)    // "x, insert y, position z"?
x.subviews(tag: tag)        // "x's subviews tag"?
x.capitalizeFirstLetter()   // "x, capitalize first letter" — mutating?
```

### Mutating vs Non-Mutating

Use verb/noun pairs to distinguish mutating from non-mutating methods.

```swift
// Mutating: verb form (imperative)
array.sort()
array.append(element)
array.reverse()

// Non-mutating: -ed or -ing suffix (noun/adjective)
let sorted = array.sorted()
let withElement = array.appending(element)
let reversed = array.reversed()

// When verb has direct object, use noun form for non-mutating
x.formUnion(y)     // Mutating
z = x.union(y)     // Non-mutating (returns new value)
```

### Boolean Properties

Boolean properties should read as assertions.

```swift
// GOOD: Reads as assertion
if line.isEmpty { }
if connection.isConnected { }
if document.hasUnsavedChanges { }
if user.canEditProfile { }

// BAD: Doesn't read as assertion
if line.empty { }
if connection.connected { }  // Ambiguous
if document.unsavedChanges { }  // Noun, not assertion
```

### Protocol Names

Protocols describe capabilities (-able, -ible, -ing) or what something is.

```swift
// Capability: -able, -ible, -ing suffix
protocol Equatable { }      // Can be equated
protocol Hashable { }       // Can be hashed
protocol Codable { }        // Can be coded
protocol Sendable { }       // Can be sent (concurrency)
protocol OptionSet { }      // Is an option set

// What something is (noun)
protocol Collection { }     // Is a collection
protocol Sequence { }       // Is a sequence
protocol View { }           // Is a view (SwiftUI)
```

---

## Code Organization

### File Structure

Organize Swift files consistently:

```swift
// 1. Import statements (alphabetized within groups)
import Foundation
import UIKit

import Alamofire
import SnapKit

// 2. Type declaration
final class UserProfileViewController: UIViewController {
    
    // MARK: - Types
    
    private enum Constants {
        static let padding: CGFloat = 16
        static let cornerRadius: CGFloat = 8
    }
    
    // MARK: - Properties
    
    private let viewModel: UserProfileViewModel
    private var cancellables = Set<AnyCancellable>()
    
    // Lazy properties
    private lazy var nameLabel: UILabel = {
        let label = UILabel()
        label.font = .preferredFont(forTextStyle: .headline)
        return label
    }()
    
    // MARK: - Initialization
    
    init(viewModel: UserProfileViewModel) {
        self.viewModel = viewModel
        super.init(nibName: nil, bundle: nil)
    }
    
    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Lifecycle
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        bindViewModel()
    }
    
    // MARK: - Private Methods
    
    private func setupUI() { ... }
    private func bindViewModel() { ... }
}

// 3. Extensions (in same file or separate files)
extension UserProfileViewController: UITableViewDelegate {
    // Protocol conformance
}
```

### Extensions

Use extensions to organize code by functionality:

```swift
// MARK: - Protocol Conformance
extension User: Codable {
    // Codable implementation
}

extension User: Equatable {
    static func == (lhs: User, rhs: User) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Computed Properties
extension User {
    var fullName: String {
        "\(firstName) \(lastName)"
    }
    
    var isAdult: Bool {
        age >= 18
    }
}

// MARK: - Helper Methods
private extension User {
    func validate() throws {
        guard !email.isEmpty else {
            throw ValidationError.emptyEmail
        }
    }
}
```

### Access Control

Default to the most restrictive access level, then expand as needed.

```swift
// GOOD: Explicit access control
public struct APIClient {
    public let baseURL: URL
    
    private let session: URLSession
    private let decoder: JSONDecoder
    
    public init(baseURL: URL) {
        self.baseURL = baseURL
        self.session = .shared
        self.decoder = JSONDecoder()
    }
    
    public func fetch<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        // ...
    }
    
    private func buildRequest(for endpoint: Endpoint) -> URLRequest {
        // ...
    }
}

// Access levels (most to least restrictive):
// private      — Same declaration only
// fileprivate  — Same file only
// internal     — Same module (default)
// package      — Same package (Swift 5.9+)
// public       — Any module, but can't subclass/override
// open         — Any module, can subclass/override
```

### MARK Comments

Use `MARK` to organize large files:

```swift
// MARK: - Section Title
// MARK: Section without line

// Common sections:
// MARK: - Types
// MARK: - Properties
// MARK: - Initialization
// MARK: - Lifecycle
// MARK: - Public Methods
// MARK: - Private Methods
// MARK: - Actions
// MARK: - Helpers
```

---

## Optionals

### Unwrapping

Prefer safe unwrapping over force unwrapping.

```swift
// GOOD: Optional binding
if let user = currentUser {
    print(user.name)
}

// GOOD: Guard for early exit
guard let user = currentUser else {
    return
}
print(user.name)

// GOOD: Optional chaining
let name = user?.profile?.displayName

// GOOD: Nil coalescing
let name = user?.name ?? "Anonymous"

// GOOD: Optional chaining with method call
let uppercasedName = user?.name.uppercased()

// AVOID: Force unwrapping
let name = user!.name  // Crashes if nil
```

### When Force Unwrapping Is Acceptable

Force unwrap only when failure indicates a programmer error:

```swift
// OK: Bundle resources that must exist
let url = Bundle.main.url(forResource: "Config", withExtension: "plist")!

// OK: Interface Builder outlets (use @IBOutlet weak var!)
@IBOutlet private var titleLabel: UILabel!

// OK: After explicit nil check
if user != nil {
    processUser(user!)  // But prefer if-let instead
}

// OK: Failable initializers for known-valid values
let url = URL(string: "https://example.com")!  // Known valid
```

### Implicitly Unwrapped Optionals

Use sparingly, only when:
1. Value will definitely be set before use (like `@IBOutlet`)
2. Value must be nil during init but always set after

```swift
// OK: Set during viewDidLoad, used throughout class
class ViewController: UIViewController {
    private var dataSource: UITableViewDataSource!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        dataSource = MyDataSource()
    }
}

// AVOID: When optional binding is cleaner
var name: String!  // Usually wrong — just use String?
```

---

## Error Handling

### Define Meaningful Errors

Use enums with associated values for rich error information:

```swift
enum NetworkError: Error {
    case invalidURL(String)
    case requestFailed(statusCode: Int, message: String)
    case decodingFailed(type: String, underlying: Error)
    case noConnection
    case timeout
}

// Extend for localized descriptions
extension NetworkError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .invalidURL(let url):
            return "Invalid URL: \(url)"
        case .requestFailed(let code, let message):
            return "Request failed (\(code)): \(message)"
        case .decodingFailed(let type, _):
            return "Failed to decode \(type)"
        case .noConnection:
            return "No network connection"
        case .timeout:
            return "Request timed out"
        }
    }
}
```

### Typed Throws (Swift 6)

Swift 6 introduces typed throws for precise error handling:

```swift
// Typed throws — caller knows exact error type
func loadUser(id: String) throws(NetworkError) -> User {
    guard let url = URL(string: "https://api.example.com/users/\(id)") else {
        throw .invalidURL("https://api.example.com/users/\(id)")
    }
    // ...
}

// Caller can switch exhaustively without catch-all
do {
    let user = try loadUser(id: "123")
} catch .invalidURL(let url) {
    print("Bad URL: \(url)")
} catch .requestFailed(let code, let message) {
    print("Failed with \(code): \(message)")
} catch .noConnection, .timeout {
    print("Network unavailable")
} catch .decodingFailed {
    print("Bad response format")
}
```

### Try Variants

Choose the appropriate `try` variant:

```swift
// try — Propagates error
func loadData() throws -> Data {
    return try Data(contentsOf: fileURL)
}

// try? — Converts to optional, discards error info
let data = try? Data(contentsOf: fileURL)

// try! — Force try (crashes on error) — avoid unless failure is programmer error
let data = try! JSONEncoder().encode(knownValidObject)
```

### Do-Catch Patterns

```swift
// Catch specific errors first
do {
    let user = try loadUser(id: id)
    updateUI(with: user)
} catch NetworkError.noConnection {
    showOfflineMessage()
} catch NetworkError.timeout {
    showRetryButton()
} catch let error as NetworkError {
    showError(error.localizedDescription)
} catch {
    // Catch-all for unexpected errors
    showGenericError()
}
```

### Result Type

Use `Result` when errors need to be stored or passed around:

```swift
// Store result of async operation
func fetchUser(completion: @escaping (Result<User, NetworkError>) -> Void) {
    // ...
    completion(.success(user))
    // or
    completion(.failure(.noConnection))
}

// Process result
fetchUser { result in
    switch result {
    case .success(let user):
        updateUI(with: user)
    case .failure(let error):
        showError(error)
    }
}

// Result methods
let name = result.map { $0.name }  // Result<String, NetworkError>
let user = try result.get()        // Throws on failure
```

---

## Concurrency (Swift 6)

Swift 6 enforces data-race safety at compile time. Embrace structured concurrency.

### Async/Await

The foundation of Swift concurrency:

```swift
// Async function
func fetchUser(id: String) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)
    return try JSONDecoder().decode(User.self, from: data)
}

// Calling async code
Task {
    do {
        let user = try await fetchUser(id: "123")
        // Update UI on main actor
        await MainActor.run {
            self.updateUI(with: user)
        }
    } catch {
        print("Failed: \(error)")
    }
}

// Async let for parallel execution
async let user = fetchUser(id: userId)
async let posts = fetchPosts(for: userId)
async let followers = fetchFollowers(for: userId)

let (u, p, f) = try await (user, posts, followers)  // Parallel fetch
```

### Actors

Actors protect mutable state from data races:

```swift
// Actor — all access is automatically serialized
actor ImageCache {
    private var cache: [URL: UIImage] = [:]
    
    func image(for url: URL) -> UIImage? {
        cache[url]
    }
    
    func store(_ image: UIImage, for url: URL) {
        cache[url] = image
    }
    
    func clear() {
        cache.removeAll()
    }
}

// Usage — await required for cross-actor access
let cache = ImageCache()
let image = await cache.image(for: url)
await cache.store(downloadedImage, for: url)

// nonisolated — no actor isolation needed
actor DataStore {
    let id: String  // Immutable, safe to access without await
    
    nonisolated var description: String {
        "DataStore(\(id))"  // Only accesses immutable state
    }
}
```

### MainActor

Update UI on the main thread:

```swift
// Entire class on main actor
@MainActor
final class ViewController: UIViewController {
    var label: UILabel!
    
    func updateLabel(_ text: String) {
        label.text = text  // Safe — always on main actor
    }
}

// Single method on main actor
func fetchAndDisplay() async {
    let data = try await fetchData()  // Background
    
    await MainActor.run {
        updateUI(with: data)  // Main thread
    }
}

// Or mark the update method
@MainActor
func updateUI(with data: Data) {
    // Guaranteed main thread
}
```

### Sendable

`Sendable` marks types safe to pass across actor boundaries:

```swift
// Value types are implicitly Sendable
struct User: Sendable {
    let id: String
    let name: String
}

// Classes must be final with immutable properties
final class Configuration: Sendable {
    let apiKey: String
    let environment: Environment
    
    init(apiKey: String, environment: Environment) {
        self.apiKey = apiKey
        self.environment = environment
    }
}

// Or use @unchecked when you manage synchronization manually
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Any] = [:]
    
    func get(_ key: String) -> Any? {
        lock.lock()
        defer { lock.unlock() }
        return storage[key]
    }
}

// Closures crossing actor boundaries must be @Sendable
func process(_ work: @Sendable () async -> Void) async {
    await work()
}
```

### Task Groups

Structured concurrency for dynamic parallelism:

```swift
func fetchAllUsers(ids: [String]) async throws -> [User] {
    try await withThrowingTaskGroup(of: User.self) { group in
        for id in ids {
            group.addTask {
                try await fetchUser(id: id)
            }
        }
        
        var users: [User] = []
        for try await user in group {
            users.append(user)
        }
        return users
    }
}

// With explicit error handling
func fetchAllUsersSafely(ids: [String]) async -> [Result<User, Error>] {
    await withTaskGroup(of: Result<User, Error>.self) { group in
        for id in ids {
            group.addTask {
                do {
                    let user = try await fetchUser(id: id)
                    return .success(user)
                } catch {
                    return .failure(error)
                }
            }
        }
        
        var results: [Result<User, Error>] = []
        for await result in group {
            results.append(result)
        }
        return results
    }
}
```

### AsyncSequence

For values produced over time:

```swift
// Consume async sequence
for await message in webSocket.messages {
    handleMessage(message)
}

// Create custom async sequence
struct Counter: AsyncSequence {
    typealias Element = Int
    let limit: Int
    
    struct AsyncIterator: AsyncIteratorProtocol {
        var current = 0
        let limit: Int
        
        mutating func next() async -> Int? {
            guard current < limit else { return nil }
            defer { current += 1 }
            try? await Task.sleep(for: .seconds(1))
            return current
        }
    }
    
    func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(limit: limit)
    }
}

// AsyncStream for bridging callback-based APIs
let notifications = AsyncStream<Notification> { continuation in
    let observer = NotificationCenter.default.addObserver(
        forName: .userDidLogin,
        object: nil,
        queue: nil
    ) { notification in
        continuation.yield(notification)
    }
    
    continuation.onTermination = { _ in
        NotificationCenter.default.removeObserver(observer)
    }
}
```

### Cancellation

Always check for and respect cancellation:

```swift
func processLargeDataset(_ data: [Item]) async throws -> [Result] {
    var results: [Result] = []
    
    for item in data {
        // Check cancellation
        try Task.checkCancellation()
        
        // Or handle gracefully
        if Task.isCancelled {
            return results  // Return partial results
        }
        
        let result = try await process(item)
        results.append(result)
    }
    
    return results
}

// Cancel tasks
let task = Task {
    try await longRunningOperation()
}

// Later...
task.cancel()
```

---

## Structs vs Classes

### Prefer Structs

Swift's value semantics provide safety and performance:

```swift
// GOOD: Struct for data
struct User {
    var id: String
    var name: String
    var email: String
}

// Value semantics: modifications don't affect other copies
var user1 = User(id: "1", name: "Alice", email: "alice@example.com")
var user2 = user1
user2.name = "Bob"  // user1.name is still "Alice"
```

### Use Classes When

1. **Identity matters**: Objects represent unique real-world entities
2. **Inheritance is needed**: Subclassing required
3. **Reference semantics required**: Shared mutable state is intentional
4. **Interoperating with Objective-C**: `NSObject` subclasses

```swift
// Class for shared state/identity
class NetworkSession {
    static let shared = NetworkSession()
    
    private var activeRequests: [UUID: URLSessionTask] = [:]
    
    func startRequest(_ request: URLRequest) -> UUID {
        // Shared state, identity matters
    }
}

// Class for inheritance hierarchy
class Animal {
    func speak() { }
}

class Dog: Animal {
    override func speak() {
        print("Woof!")
    }
}
```

### Final Classes

Mark classes `final` when subclassing isn't intended (enables optimizations):

```swift
final class APIClient {
    // Cannot be subclassed
    // Compiler can optimize method dispatch
}
```

---

## Generics

### Type Constraints

Use protocol constraints to require capabilities:

```swift
// Require Equatable
func contains<T: Equatable>(_ array: [T], element: T) -> Bool {
    array.contains(element)
}

// Multiple constraints
func process<T: Codable & Sendable>(_ value: T) async throws {
    // ...
}

// Where clause for complex constraints
func merge<C1: Collection, C2: Collection>(
    _ first: C1,
    _ second: C2
) -> [C1.Element] where C1.Element == C2.Element {
    Array(first) + Array(second)
}
```

### Associated Types

Define requirements for protocol adopters:

```swift
protocol Container {
    associatedtype Item
    
    var count: Int { get }
    mutating func append(_ item: Item)
    subscript(i: Int) -> Item { get }
}

// Conform with concrete type
struct IntStack: Container {
    typealias Item = Int  // Often inferred
    
    private var items: [Int] = []
    
    var count: Int { items.count }
    
    mutating func append(_ item: Int) {
        items.append(item)
    }
    
    subscript(i: Int) -> Int {
        items[i]
    }
}
```

### Opaque Types (`some`)

Hide concrete type while preserving type identity:

```swift
// Return type is hidden but consistent
func makeCollection() -> some Collection<Int> {
    [1, 2, 3]
}

// SwiftUI views
var body: some View {
    VStack {
        Text("Hello")
        Text("World")
    }
}

// Protocol as parameter type (Swift 5.7+)
func process(_ values: some Collection<Int>) {
    for value in values {
        print(value)
    }
}
```

### Existential Types (`any`)

When you need type erasure:

```swift
// Can hold any type conforming to protocol
var handlers: [any EventHandler] = []

handlers.append(ButtonHandler())
handlers.append(GestureHandler())

// Opening existentials for generic operations
func processAll(_ handlers: [any EventHandler], event: Event) {
    for handler in handlers {
        handler.handle(event)  // Dynamic dispatch
    }
}
```

### Primary Associated Types (Swift 5.7+)

Constrain associated types at use site:

```swift
// Define primary associated type
protocol Container<Element> {
    associatedtype Element
    // ...
}

// Use at constraint site
func processInts(_ container: some Container<Int>) {
    // ...
}

// Or with existentials
var containers: [any Container<String>] = []
```

---

## Property Wrappers

Encapsulate property access patterns:

```swift
// Define a property wrapper
@propertyWrapper
struct Clamped<Value: Comparable> {
    private var value: Value
    private let range: ClosedRange<Value>
    
    var wrappedValue: Value {
        get { value }
        set { value = min(max(newValue, range.lowerBound), range.upperBound) }
    }
    
    init(wrappedValue: Value, _ range: ClosedRange<Value>) {
        self.range = range
        self.value = min(max(wrappedValue, range.lowerBound), range.upperBound)
    }
}

// Usage
struct Player {
    @Clamped(0...100) var health: Int = 100
    @Clamped(0...1) var volume: Double = 0.5
}

var player = Player()
player.health = 150  // Clamped to 100
player.health = -10  // Clamped to 0
```

### Common Property Wrappers

```swift
// @State — SwiftUI local state
@State private var count = 0

// @Binding — Two-way connection to state
@Binding var isPresented: Bool

// @Published — Observable property (Combine)
@Published var username: String = ""

// @Environment — SwiftUI environment values
@Environment(\.colorScheme) var colorScheme

// @AppStorage — UserDefaults backed
@AppStorage("hasOnboarded") var hasOnboarded = false

// @SceneStorage — Scene-specific storage
@SceneStorage("selectedTab") var selectedTab = 0
```

---

## SwiftUI Best Practices

### View Structure

Keep views small and focused:

```swift
struct UserProfileView: View {
    let user: User
    
    var body: some View {
        VStack(spacing: 16) {
            avatarSection
            infoSection
            actionsSection
        }
        .padding()
    }
    
    // Extract subviews as computed properties
    private var avatarSection: some View {
        AsyncImage(url: user.avatarURL) { image in
            image.resizable()
        } placeholder: {
            ProgressView()
        }
        .frame(width: 100, height: 100)
        .clipShape(Circle())
    }
    
    private var infoSection: some View {
        VStack(alignment: .leading) {
            Text(user.name)
                .font(.headline)
            Text(user.email)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
    
    private var actionsSection: some View {
        Button("Edit Profile") {
            // action
        }
        .buttonStyle(.borderedProminent)
    }
}
```

### State Management

Choose the right state tool:

```swift
struct ContentView: View {
    // Local state — simple values
    @State private var count = 0
    
    // Reference to external observable
    @StateObject private var viewModel = ContentViewModel()
    
    // Passed-in observable (don't create, just observe)
    @ObservedObject var settings: Settings
    
    // Two-way binding from parent
    @Binding var selectedItem: Item?
    
    // Environment values
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    
    var body: some View {
        // ...
    }
}
```

### Observable (iOS 17+)

Modern observation with `@Observable` macro:

```swift
@Observable
final class UserStore {
    var users: [User] = []
    var isLoading = false
    var error: Error?
    
    func loadUsers() async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            users = try await api.fetchUsers()
        } catch {
            self.error = error
        }
    }
}

// Usage in SwiftUI
struct UsersView: View {
    var store: UserStore  // No wrapper needed!
    
    var body: some View {
        List(store.users) { user in
            Text(user.name)
        }
        .overlay {
            if store.isLoading {
                ProgressView()
            }
        }
    }
}
```

### View Modifiers

Create reusable view modifiers:

```swift
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(.background)
            .cornerRadius(12)
            .shadow(radius: 4)
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardStyle())
    }
}

// Usage
Text("Hello")
    .cardStyle()
```

---

## Macros (Swift 5.9+)

### Using Built-in Macros

```swift
// #Preview for SwiftUI previews
#Preview {
    ContentView()
}

#Preview("Dark Mode") {
    ContentView()
        .preferredColorScheme(.dark)
}

// @Observable for observation
@Observable
class Store {
    var count = 0
}

// #expect and #require for testing (Swift Testing)
@Test func testAddition() {
    #expect(2 + 2 == 4)
    let result = try #require(compute())  // Fails test if nil
}
```

### Expression Macros

```swift
// Stringify macro (hypothetical example)
let (result, code) = #stringify(2 + 2)
// result = 4, code = "2 + 2"

// URL macro with compile-time validation
let url = #URL("https://example.com")  // Validates at compile time
```

---

## Testing

### Swift Testing (iOS 18+)

Modern testing framework replacing XCTest:

```swift
import Testing

@Test func userCreation() {
    let user = User(name: "Alice")
    #expect(user.name == "Alice")
    #expect(user.isActive)
}

@Test("User validation rejects empty names")
func emptyNameValidation() throws {
    #expect(throws: ValidationError.emptyName) {
        try User(name: "")
    }
}

// Parameterized tests
@Test(arguments: ["alice@example.com", "bob@test.org"])
func validEmails(email: String) {
    #expect(Email(email).isValid)
}

// Test suites
@Suite struct UserTests {
    let sut: UserService
    
    init() {
        sut = UserService()
    }
    
    @Test func creation() { }
    @Test func deletion() { }
}
```

### XCTest (Traditional)

```swift
import XCTest

final class UserTests: XCTestCase {
    var sut: UserService!
    
    override func setUp() {
        super.setUp()
        sut = UserService()
    }
    
    override func tearDown() {
        sut = nil
        super.tearDown()
    }
    
    func testUserCreation() {
        let user = sut.createUser(name: "Alice")
        
        XCTAssertEqual(user.name, "Alice")
        XCTAssertTrue(user.isActive)
    }
    
    func testAsyncFetch() async throws {
        let user = try await sut.fetchUser(id: "123")
        
        XCTAssertEqual(user.id, "123")
    }
}
```

### Mocking with Protocols

```swift
protocol UserRepository {
    func fetch(id: String) async throws -> User
}

// Real implementation
struct APIUserRepository: UserRepository {
    func fetch(id: String) async throws -> User {
        // Network call
    }
}

// Mock for testing
final class MockUserRepository: UserRepository {
    var fetchResult: Result<User, Error>?
    var fetchCallCount = 0
    var fetchCalledWith: String?
    
    func fetch(id: String) async throws -> User {
        fetchCallCount += 1
        fetchCalledWith = id
        return try fetchResult!.get()
    }
}

// In tests
@Test func fetchUser() async throws {
    let mock = MockUserRepository()
    mock.fetchResult = .success(User(id: "123", name: "Alice"))
    
    let sut = UserService(repository: mock)
    let user = try await sut.getUser(id: "123")
    
    #expect(user.name == "Alice")
    #expect(mock.fetchCallCount == 1)
    #expect(mock.fetchCalledWith == "123")
}
```

---

## Performance

### Copy-on-Write

Swift collections use copy-on-write for efficiency:

```swift
// No copy until mutation
var array1 = [1, 2, 3]
var array2 = array1  // No copy — same buffer
array2.append(4)     // Now copies — array1 unaffected
```

### Lazy Sequences

Defer computation until needed:

```swift
// Eager: processes all elements immediately
let eager = numbers
    .map { $0 * 2 }
    .filter { $0 > 10 }
    .prefix(5)

// Lazy: only processes elements as consumed
let lazy = numbers.lazy
    .map { $0 * 2 }
    .filter { $0 > 10 }
    .prefix(5)

// Useful for large collections
let firstMatch = hugeArray.lazy
    .filter { isExpensiveCheck($0) }
    .first
```

### Value Type Performance

```swift
// Small structs: passed in registers, very efficient
struct Point {
    var x: Double
    var y: Double
}

// Large structs: consider reference semantics for mutations
struct LargeData {
    var buffer: [UInt8]  // Already reference type internally
}
```

### Avoid Premature Optimization

```swift
// Profile first with Instruments
// Common issues:
// - Excessive allocations (look for heap allocations in hot paths)
// - Main thread work (move to background)
// - Unnecessary copies (check for CoW triggers)
// - Retain cycles (use weak/unowned appropriately)
```

---

## Memory Management

### ARC (Automatic Reference Counting)

Swift manages memory automatically for reference types.

### Strong, Weak, Unowned

```swift
class Parent {
    var child: Child?
}

class Child {
    // Weak: may become nil, optional type
    weak var parent: Parent?
    
    // Unowned: assumed always valid, non-optional
    unowned let owner: Owner
}

// Use weak when reference might outlive the object
// Use unowned when you're certain reference won't outlive
```

### Capture Lists

Break retain cycles in closures:

```swift
class ViewController {
    var onComplete: (() -> Void)?
    
    func setupHandler() {
        // BAD: Strong capture creates cycle
        onComplete = {
            self.dismiss(animated: true)  // Retains self
        }
        
        // GOOD: Weak capture
        onComplete = { [weak self] in
            self?.dismiss(animated: true)
        }
        
        // GOOD: Unowned when self definitely exists
        onComplete = { [unowned self] in
            self.dismiss(animated: true)
        }
    }
}
```

### Common Retain Cycle Patterns

```swift
// Timer retain cycles
class ViewController {
    var timer: Timer?
    
    func startTimer() {
        // BAD: Timer retains target (self)
        timer = Timer.scheduledTimer(
            withTimeInterval: 1,
            repeats: true
        ) { _ in
            self.update()  // Cycle!
        }
        
        // GOOD: Weak capture
        timer = Timer.scheduledTimer(
            withTimeInterval: 1,
            repeats: true
        ) { [weak self] _ in
            self?.update()
        }
    }
    
    deinit {
        timer?.invalidate()
    }
}

// Notification observer cycles
class Observer {
    var token: NSObjectProtocol?
    
    init() {
        token = NotificationCenter.default.addObserver(
            forName: .someNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.handle(notification)
        }
    }
    
    deinit {
        if let token {
            NotificationCenter.default.removeObserver(token)
        }
    }
}
```

---

## Common Pitfalls

### Force Unwrapping

```swift
// BAD: Crashes on nil
let name = user!.name

// GOOD: Safe unwrapping
guard let name = user?.name else {
    return
}
```

### Retain Cycles

```swift
// BAD: Closure captures self strongly
fetchData { result in
    self.handleResult(result)  // Potential cycle
}

// GOOD: Weak capture
fetchData { [weak self] result in
    self?.handleResult(result)
}
```

### Blocking Main Thread

```swift
// BAD: Blocks UI
let data = try Data(contentsOf: largeFileURL)  // Synchronous I/O

// GOOD: Use async
Task {
    let data = try await loadData(from: largeFileURL)
    await MainActor.run {
        updateUI(with: data)
    }
}
```

### Forgetting @MainActor

```swift
// BAD: UI update from background
Task {
    let data = await fetchData()
    label.text = data.title  // Wrong thread!
}

// GOOD: Explicit main actor
Task {
    let data = await fetchData()
    await MainActor.run {
        label.text = data.title
    }
}
```

### Data Races (Pre-Swift 6)

```swift
// BAD: Shared mutable state
class Counter {
    var value = 0
    
    func increment() {
        value += 1  // Data race if called from multiple threads!
    }
}

// GOOD: Use actor
actor Counter {
    var value = 0
    
    func increment() {
        value += 1  // Safe — actor isolation
    }
}
```

### Optional Chaining Semantics

```swift
// Understand what optional chaining returns
let count = user?.posts?.count  // Optional<Int>, not Int

// Use nil coalescing for default
let count = user?.posts?.count ?? 0  // Int
```

---

## Quick Reference

### Formatting

```bash
# SwiftFormat (community standard)
swiftformat .

# SwiftLint for style enforcement
swiftlint
swiftlint --fix
```

### Commands

```bash
swift build              # Build package
swift test               # Run tests
swift run                # Run executable
swift package init       # Create new package
swift package update     # Update dependencies
```

### Import Organization

```swift
import Foundation           // Apple frameworks first (alphabetical)
import SwiftUI
import UIKit

import Alamofire            // Third-party (alphabetical)
import SnapKit

import MyFramework          // Internal modules (alphabetical)
```

---

## AIDEV-NOTE: Swift skill philosophy

This skill prioritizes Apple's official API Design Guidelines and Swift.org documentation.
When in doubt about Swift style, consult: 1) API Design Guidelines, 2) The Swift Programming
Language book, 3) Swift Evolution proposals, 4) WWDC sessions — in that order. The goal is
clear, expressive Swift that leverages the language's safety features and reads as natural prose.

Swift 6's data-race safety is not optional — embrace actors, Sendable, and structured
concurrency as the default approach to concurrent code.
