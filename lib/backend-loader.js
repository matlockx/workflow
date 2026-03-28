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
 * Load backend configuration from opencode.json
 */
function loadBackendConfig() {
  const configPath = path.join(process.cwd(), 'opencode.json')
  
  try {
    const configFile = fs.readFileSync(configPath, 'utf8')
    const config = JSON.parse(configFile)
    
    if (!config.workflow || !config.workflow.backend) {
      throw new Error('No workflow.backend configuration found in opencode.json')
    }
    
    return config.workflow.backend
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('opencode.json not found. Run this command from the repository root.')
    }
    throw error
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
    throw new Error('Backend type not specified in opencode.json (workflow.backend.type)')
  }
  
  // Load backend module
  let BackendClass
  try {
    const backendPath = path.join(process.cwd(), 'backends', backendType, 'index.js')
    BackendClass = require(backendPath)
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error(`Backend not found: ${backendType}. Check backends/${backendType}/index.js exists.`)
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
  const backendsDir = path.join(process.cwd(), 'backends')
  
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
    const backendPath = path.join(process.cwd(), 'backends', type, 'index.js')
    if (!fs.existsSync(backendPath)) {
      errors.push(`Backend not found: ${type}`)
      return { valid: false, errors }
    }
    
    // Try to load and initialize
    try {
      const backend = getBackend(type)
      
      // Validate backend implements required methods
      const requiredMethods = [
        'listIssues',
        'getIssue',
        'createIssue',
        'createSpec',
        'getSpec',
        'approveSpec',
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
  loadBackendConfig
}
