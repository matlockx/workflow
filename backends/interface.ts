/**
 * OpenCode Workflow Backend Interface
 * 
 * This file defines the interface that all workflow backends must implement.
 * Backends provide a unified API for managing issues, specs, tasks, and state.
 * 
 * @module backends/interface
 */

// ============================================
// CORE DATA TYPES
// ============================================

/**
 * Work state enum - all backends must support these core states
 */
export type WorkState =
  | 'new'         // Initial state
  | 'draft'       // Work in progress
  | 'todo'        // Ready to start
  | 'inprogress'  // Being worked on
  | 'review'      // Awaiting review
  | 'approved'    // Accepted
  | 'rejected'    // Needs rework
  | 'done'        // Completed
  | string        // Backends can add custom states

/**
 * Spec-specific state
 */
export type SpecState = 'draft' | 'approved' | 'rejected'

/**
 * Error codes for backend errors
 */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'INVALID_TRANSITION'
  | 'BACKEND_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'VALIDATION_FAILED'

/**
 * Backend error with structured error information
 */
export interface BackendError extends Error {
  code: ErrorCode
  recovery?: string        // Suggested recovery action
  originalError?: Error    // Wrapped error
}

// ============================================
// ISSUE TYPES
// ============================================

/**
 * Issue represents a high-level work item (user story, bug, epic)
 */
export interface Issue {
  id: string                       // Unique identifier (e.g., "JIRA-123")
  summary: string                  // Short title
  description: string              // Full description/requirements
  status: string                   // Current status (backend-specific)
  assignee?: string                // Assigned user
  labels: string[]                 // Tags/labels
  priority?: string                // Priority level
  url?: string                     // Link to issue in backend
  metadata: Record<string, any>    // Backend-specific metadata
}

/**
 * Filter criteria for listing issues
 */
export interface IssueFilter {
  assignee?: string        // Filter by assignee
  status?: string          // Filter by status
  labels?: string[]        // Filter by labels (AND logic)
  search?: string          // Text search in summary/description
  limit?: number           // Max results
  offset?: number          // Pagination offset
}

/**
 * Data for creating a new issue
 */
export interface IssueCreateData {
  summary: string                  // Required: Short title
  description: string              // Required: Full description
  issueType?: string               // Story, Bug, Task, etc. (backend-specific)
  project?: string                 // Project/board identifier
  assignee?: string                // Assign to user
  labels?: string[]                // Tags/labels
  priority?: string                // Priority level
  metadata?: Record<string, any>   // Backend-specific fields
}

// ============================================
// SPEC TYPES
// ============================================

/**
 * Spec represents a technical specification derived from an issue
 */
export interface Spec {
  id: string                       // Unique identifier (often same as issue ID)
  issueId: string                  // Parent issue ID
  filePath: string                 // Path to spec markdown file
  state: SpecState                 // draft, approved, rejected
  createdAt: Date                  // When spec was created
  approvedAt?: Date                // When spec was approved
  metadata: Record<string, any>    // Backend-specific metadata
}

// ============================================
// TASK TYPES
// ============================================

/**
 * Task represents a granular implementation work item
 */
export interface Task {
  id: string                       // Unique identifier
  description: string              // Task title/description
  specId: string                   // Parent spec ID
  issueId: string                  // Root issue ID
  state: WorkState                 // Current state
  tags: string[]                   // Tags (e.g., +impl, +phase, +test)
  isPhase: boolean                 // True if this is a phase container
  depends: string[]                // Task dependencies (IDs)
  createdAt: Date                  // When task was created
  modifiedAt: Date                 // Last modified timestamp
  metadata: Record<string, any>    // Backend-specific metadata
}

/**
 * Filter criteria for listing tasks
 */
export interface TaskFilter {
  issueId?: string                 // Filter by parent issue
  specId?: string                  // Filter by parent spec
  state?: WorkState                // Filter by state
  tags?: string[]                  // Filter by tags (AND logic)
  isPhase?: boolean                // Filter phases vs tasks
  status?: 'pending' | 'completed' // Coarse status filter
  limit?: number                   // Max results
  offset?: number                  // Pagination offset
}

// ============================================
// WORKFLOW BACKEND INTERFACE
// ============================================

/**
 * WorkflowBackend interface - all backends must implement this
 */
export interface WorkflowBackend {
  
  // ============================================
  // ISSUE MANAGEMENT
  // ============================================
  
  /**
   * List issues from the backend.
   * 
   * @param filter Optional filter criteria
   * @returns Array of issues
   */
  listIssues(filter?: IssueFilter): Promise<Issue[]>
  
  /**
   * Get a single issue by ID.
   * 
   * @param id Issue identifier (e.g., "JIRA-123", "beads:456")
   * @returns Issue object
   * @throws BackendError with code NOT_FOUND if issue not found
   */
  getIssue(id: string): Promise<Issue>
  
  /**
   * Create a new issue.
   * 
   * @param data Issue creation data
   * @returns Created issue with assigned ID
   * @throws BackendError with code VALIDATION_FAILED if data invalid
   */
  createIssue(data: IssueCreateData): Promise<Issue>
  
  /**
   * Update an existing issue.
   * 
   * @param id Issue identifier
   * @param updates Partial issue data to update
   * @returns Updated issue
   * @throws BackendError with code NOT_FOUND if issue not found
   */
  updateIssue(id: string, updates: Partial<IssueCreateData>): Promise<Issue>

  /**
   * Link an issue to an Epic.
   *
   * For the file backend this sets `metadata.epicId` on the child issue.
   * For the jira-taskwarrior backend this sets `customfield_10014` (Epic Link)
   * on the Jira issue via ACLI.
   *
   * @param issueId  The child issue to link
   * @param epicId   The Epic's issue ID
   * @returns Updated child issue
   * @throws BackendError with code NOT_FOUND if either issue is not found
   */
  linkIssueToEpic(issueId: string, epicId: string): Promise<Issue>
  
  // ============================================
  // SPEC MANAGEMENT
  // ============================================
  
  /**
   * Create a spec from an issue.
   * 
   * This method:
   * - Reads issue context from backend
   * - Creates spec markdown file in specsDir (default: ./specs)
   * - Creates spec task/entry in backend
   * - Links spec to issue
   * 
   * @param issueId Parent issue identifier
   * @returns Created spec with metadata
   * @throws BackendError with code NOT_FOUND if issue not found
   */
  createSpec(issueId: string): Promise<Spec>
  
  /**
   * Get an existing spec.
   * 
   * @param issueId Issue identifier to find spec for
   * @returns Spec object with file path and metadata
   * @throws BackendError with code NOT_FOUND if spec not found
   */
  getSpec(issueId: string): Promise<Spec>
  
  /**
   * Approve a spec (transition from draft to approved).
   * 
   * @param specId Spec identifier
   * @returns Updated spec
   * @throws BackendError with code INVALID_TRANSITION if transition invalid
   */
  approveSpec(specId: string): Promise<Spec>
  
  /**
   * Reject a spec (needs rework).
   * 
   * @param specId Spec identifier
   * @param reason Optional reason for rejection
   * @returns Updated spec
   * @throws BackendError with code INVALID_TRANSITION if transition invalid
   */
  rejectSpec(specId: string, reason?: string): Promise<Spec>
  
  // ============================================
  // TASK MANAGEMENT
  // ============================================
  
  /**
   * Create implementation tasks from an approved spec.
   * 
   * This method:
   * - Reads and analyzes the spec file
   * - Breaks work into phases and tasks
   * - Creates tasks in backend
   * - Sets up dependencies
   * 
   * @param specId Spec identifier
   * @returns Array of created tasks (including phases)
   * @throws BackendError with code INVALID_STATE if spec not approved
   */
  createTasks(specId: string): Promise<Task[]>
  
  /**
   * Get tasks with optional filtering.
   * 
   * @param filter Optional filter criteria
   * @returns Array of tasks
   */
  getTasks(filter?: TaskFilter): Promise<Task[]>
  
  /**
   * Get a single task by ID.
   * 
   * @param taskId Task identifier
   * @returns Task object
   * @throws BackendError with code NOT_FOUND if task not found
   */
  getTask(taskId: string): Promise<Task>
  
  /**
   * Update task state.
   * 
   * @param taskId Task identifier
   * @param state New state
   * @returns Updated task
   * @throws BackendError with code INVALID_TRANSITION if transition invalid
   */
  updateTaskState(taskId: string, state: WorkState): Promise<Task>
  
  /**
   * Update task properties.
   * 
   * @param taskId Task identifier
   * @param updates Partial task data to update
   * @returns Updated task
   * @throws BackendError with code NOT_FOUND if task not found
   */
  updateTask(taskId: string, updates: Partial<Task>): Promise<Task>
  
  // ============================================
  // STATE MACHINE
  // ============================================
  
  /**
   * Get all valid work states for this backend.
   * 
   * @returns Array of state names (must include core states)
   */
  getWorkStates(): WorkState[]
  
  /**
   * Get valid state transitions from a given state.
   * 
   * @param from Current state
   * @returns Array of valid next states
   */
  getValidTransitions(from: WorkState): WorkState[]
  
  /**
   * Validate if a state transition is allowed.
   * 
   * @param from Current state
   * @param to Desired state
   * @returns True if transition is valid
   */
  isValidTransition(from: WorkState, to: WorkState): boolean
}

// ============================================
// BACKEND CONFIGURATION
// ============================================

/**
 * Backend configuration from opencode.json
 */
export interface BackendConfig {
  type: string                     // Backend type (e.g., "jira-taskwarrior", "beads")
  config: Record<string, any>      // Backend-specific configuration
}

/**
 * Workflow configuration section in opencode.json
 */
export interface WorkflowConfig {
  backend: BackendConfig
}

// ============================================
// HELPER UTILITIES
// ============================================

/**
 * Create a BackendError
 * 
 * @param code Error code
 * @param message Error message
 * @param recovery Optional recovery suggestion
 * @param originalError Optional wrapped error
 * @returns BackendError
 */
export function createBackendError(
  code: ErrorCode,
  message: string,
  recovery?: string,
  originalError?: Error
): BackendError {
  const error = new Error(message) as BackendError
  error.code = code
  error.recovery = recovery
  error.originalError = originalError
  return error
}

/**
 * Check if an error is a BackendError
 * 
 * @param error Error to check
 * @returns True if error is a BackendError
 */
export function isBackendError(error: any): error is BackendError {
  return error && typeof error.code === 'string' && error.code in ['NOT_FOUND', 'INVALID_STATE', 'INVALID_TRANSITION', 'BACKEND_UNAVAILABLE', 'PERMISSION_DENIED', 'VALIDATION_FAILED']
}

// ============================================
// EXPORTS
// ============================================

export default WorkflowBackend
