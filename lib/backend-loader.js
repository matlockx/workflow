/**
 * Backend Loader
 * 
 * Loads and initializes workflow backends based on configuration.
 * Provides a factory function to get the configured backend instance.
 * 
 * @module lib/backend-loader
 */

const fs = require('fs')
const path = require('path')

// ============================================
// BACKEND LOADER
// ============================================

/**
 * Load backend configuration from .agent/config.json.
 *
 * AIDEV-NOTE: We deliberately do NOT read from opencode.json because the
 * upstream OpenCode binary validates that file against a strict schema and
 * rejects unknown top-level keys (e.g. "workflow"). Keeping our config in
 * .agent/config.json avoids that conflict while staying in the same
 * directory that already holds all other workflow machinery.
 */
function loadBackendConfig() {
  const configPath = path.join(process.cwd(), '.agent', 'config.json')

  try {
    const configFile = fs.readFileSync(configPath, 'utf8')
    const config = JSON.parse(configFile)

    if (!config.backend) {
      throw new Error('No "backend" key found in .agent/config.json')
    }

    return config.backend
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('.agent/config.json not found. Run opencode-init first or ensure you are in the project root.')
    }
    throw error
  }
}

// AIDEV-NOTE: Commands rely on this loader as the single backend entry point.
// Keep backend discovery/config validation here so command markdown stays generic.
// Backend modules are resolved from .agent/backends/<type>/index.js inside the
// target project (not from the opencode source tree). This allows each initialized
// project to carry its own copy of the backend without requiring opencode on PATH.

/**
 * Parse a backend override from raw command arguments.
 *
 * Supports:
 * - --backend=mock
 * - --backend mock
 *
 * @param {string} rawArguments
 * @returns {{backendType: string|null, cleanedArguments: string}}
 */
function parseBackendOverride(rawArguments = '') {
  const tokens = String(rawArguments).trim().split(/\s+/).filter(Boolean)
  const cleaned = []
  let backendType = null

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]

    if (token.startsWith('--backend=')) {
      backendType = token.slice('--backend='.length) || null
      continue
    }

    if (token === '--backend') {
      const nextToken = tokens[index + 1]
      if (nextToken && !nextToken.startsWith('--')) {
        backendType = nextToken
        index += 1
        continue
      }

      throw new Error('Missing value for --backend override')
    }

    cleaned.push(token)
  }

  return {
    backendType,
    cleanedArguments: cleaned.join(' ')
  }
}

/**
 * Get backend instance based on configuration
 * 
 * @param {string} [overrideType] - Optional backend type override
 * @returns {Object} Backend instance implementing WorkflowBackend interface
 */
function getBackend(overrideType = null) {
  const backendConfig = loadBackendConfig()
  const backendType = overrideType || backendConfig.type
  
  if (!backendType) {
    throw new Error('Backend type not specified in .agent/config.json (backend.type)')
  }
  
  // Load backend module from .agent/backends/<type>/index.js in the target project
  let BackendClass
  try {
    const backendPath = path.join(process.cwd(), '.agent', 'backends', backendType, 'index.js')
    BackendClass = require(backendPath)
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error(`Backend not found: ${backendType}. Check .agent/backends/${backendType}/index.js exists.`)
    }
    throw error
  }
  
  // Initialize backend with config
  const config = backendConfig.config || {}
  
  try {
    return new BackendClass(config)
  } catch (error) {
    throw new Error(`Failed to initialize ${backendType} backend: ${error.message}`)
  }
}

/**
 * List available backends
 * 
 * @returns {string[]} Array of backend names
 */
function listBackends() {
  const backendsDir = path.join(process.cwd(), '.agent', 'backends')
  
  try {
    const entries = fs.readdirSync(backendsDir, { withFileTypes: true })
    
    return entries
      .filter(entry => entry.isDirectory())
      .filter(entry => {
        // Check if backend has index.js
        const indexPath = path.join(backendsDir, entry.name, 'index.js')
        return fs.existsSync(indexPath)
      })
      .map(entry => entry.name)
  } catch (error) {
    // AIDEV-NOTE: Log rather than silently swallow — a permissions error or corrupt
    // index.js should be visible, not produce a confusing empty backend list.
    console.warn('listBackends: error scanning backends directory:', error.message)
    return []
  }
}

/**
 * Validate backend configuration
 * 
 * @param {string} [backendType] - Optional backend type to validate
 * @returns {Object} Validation result {valid: boolean, errors: string[]}
 */
function validateBackendConfig(backendType = null) {
  const errors = []
  
  try {
    const backendConfig = loadBackendConfig()
    const type = backendType || backendConfig.type
    
    if (!type) {
      errors.push('Backend type not specified')
      return { valid: false, errors }
    }
    
    // Check if backend exists
    const backendPath = path.join(process.cwd(), '.agent', 'backends', type, 'index.js')
    if (!fs.existsSync(backendPath)) {
      errors.push(`Backend not found: ${type}`)
      return { valid: false, errors }
    }
    
    // Try to load and initialize
    try {
      const backend = getBackend(type)
      
      // AIDEV-NOTE: Spec-stage methods (createSpec, getSpec, approveSpec, rejectSpec)
      // were removed in ADR-001 (Tier 3 rebuild). The pipeline is now issue → tasks → implement.
      // createTasks(issueId) takes an issueId directly — no spec approval gate required.
      const requiredMethods = [
        'listIssues',
        'getIssue',
        'createIssue',
        'createTasks',
        'getTasks',
        'getTask',
        'updateTaskState',
        'getWorkStates',
        'getValidTransitions',
        'isValidTransition'
      ]
      
      for (const method of requiredMethods) {
        if (typeof backend[method] !== 'function') {
          errors.push(`Backend missing required method: ${method}`)
        }
      }
      
      if (errors.length > 0) {
        return { valid: false, errors }
      }
      
      return { valid: true, errors: [] }
    } catch (error) {
      errors.push(`Failed to initialize backend: ${error.message}`)
      return { valid: false, errors }
    }
  } catch (error) {
    errors.push(error.message)
    return { valid: false, errors }
  }
}

/**
 * Get backend info (type, config, available)
 * 
 * @returns {Object} Backend information
 */
function getBackendInfo() {
  try {
    const backendConfig = loadBackendConfig()
    const available = listBackends()
    
    return {
      configured: backendConfig.type,
      config: backendConfig.config || {},
      available: available,
      valid: validateBackendConfig().valid
    }
  } catch (error) {
    return {
      configured: null,
      config: {},
      available: listBackends(),
      valid: false,
      error: error.message
    }
  }
}

module.exports = {
  getBackend,
  listBackends,
  validateBackendConfig,
  getBackendInfo,
  loadBackendConfig,
  parseBackendOverride
}
