/**
 * Intent Router for OpenCode Workflow
 *
 * Maps natural language input to workflow commands with confidence scoring.
 * Also provides smart skip suggestions based on change complexity.
 *
 * AIDEV-NOTE: This module enables the agent to auto-detect workflow intent
 * from free-form user input and guide them through the appropriate command
 * flow without requiring explicit /command invocations.
 */

'use strict'

// Intent patterns with associated commands and confidence weights
// AIDEV-NOTE: Patterns are ordered by specificity. More specific patterns should
// come first within each intent type. The first matching pattern wins.
// Research intent MUST come before feature to catch "research how to implement" first.
const INTENT_PATTERNS = [
  // Research intent - needs investigation before implementation
  // AIDEV-NOTE: Research intent triggers the research-agent for decision-grade
  // analysis before committing to a spec. Distinct from 'plan' which is about
  // roadmapping; 'research' is about verifying claims and exploring options.
  // Must come before feature intent to catch "research how to implement X" before
  // "implement X" matches feature. Uses 0.85 confidence to match feature's weight.
  {
    command: '/feature',
    type: 'research',
    patterns: [
      /^research\s+/i, // "research X" at start of sentence is clearly research intent
      /^investigate\s+/i,
      /^analyze\s+/i,
      /(?:research|investigate|analyze|evaluate)\s+(?:how|what|whether|if)/i,
      /(?:what\s+are\s+the\s+)?(?:options|choices|approaches|alternatives)\s+for/i,
      /(?:compare|evaluate|assess)\s+(?:different\s+)?[\w\s]+(?:options|approaches|solutions|databases?|frameworks?|libraries?)/i,
      /(?:should\s+we|what'?s\s+the\s+best\s+way)/i,
      /which\s+is\s+better/i,
      /(?:trade-?offs?|pros?\s+and\s+cons?|implications?)\s+of/i,
      /(?:is\s+it\s+)?(?:possible|feasible|viable)\s+to/i,
    ],
    baseConfidence: 0.85,
  },
  // Feature/create intent
  {
    command: '/feature',
    type: 'feature',
    patterns: [
      /(?:add|create|implement|build|develop|make)\s+(?:a\s+)?(?:new\s+)?(?:feature|functionality|capability|module)/i,
      /(?:i\s+want|we\s+need|let'?s)\s+(?:to\s+)?(?:add|create|build|implement)/i,
      /(?:new|add)\s+\w+\s+(?:feature|system|functionality)/i,
      // Broader patterns - match "add X", "create X", "implement X" without requiring "feature"
      /^(?:add|create|implement|build)\s+(?:a\s+)?(?:new\s+)?\w+/i,
      /(?:add|create|implement|build)\s+(?:a\s+|an\s+)?[\w\s]+(?:feature|login|auth|page|component|api|endpoint|button|form|modal)/i,
    ],
    baseConfidence: 0.85,
  },
  // Bug fix intent
  // AIDEV-NOTE: Fix patterns need to match both "fix the bug" (bug as direct object)
  // and "fix the login issue" (issue as part of a longer phrase)
  {
    command: '/feature',
    type: 'fix',
    patterns: [
      /(?:fix|resolve|debug|repair|patch)\s+(?:the\s+)?(?:bug|issue|error|problem|defect)/i,
      /(?:fix|resolve|debug|repair|patch)\s+(?:the\s+)?[\w\s]+(?:bug|issue|error|problem)/i,
      /(?:something\s+is\s+)?(?:broken|not\s+working|failing)/i,
      /(?:bug|error|issue)\s+(?:in|with|when)/i,
    ],
    baseConfidence: 0.85,
  },
  // Review/optimize intent
  {
    command: '/feature',
    type: 'review',
    patterns: [
      /(?:review|optimize|refactor|improve|clean\s*up|audit)\s+(?:the\s+)?(?:code|codebase)?/i,
      /(?:code\s+)?(?:review|optimization|refactoring|improvement)/i,
      /(?:make\s+(?:it|the\s+code)\s+)?(?:faster|better|cleaner|more\s+efficient)/i,
      /(?:performance|quality)\s+(?:review|audit|check)/i,
    ],
    baseConfidence: 0.80,
  },
  // Planning/discovery intent
  {
    command: '/plan',
    type: 'plan',
    patterns: [
      /(?:plan|brainstorm|explore|discover)/i,
      /(?:what\s+should\s+we|how\s+can\s+we|let'?s\s+figure\s+out)/i,
      /(?:roadmap|strategy|approach)\s+for/i,
    ],
    baseConfidence: 0.75,
  },
  // Quick task intent (no spec needed)
  {
    command: '/implement',
    type: 'quick',
    patterns: [
      /(?:just|quickly|simply)\s+(?:do|make|change|update|rename|fix)/i,
      /(?:small|minor|tiny|quick)\s+(?:change|fix|update|tweak)/i,
      /(?:rename|move|delete)\s+(?:the\s+)?(?:file|function|variable|class|method)/i,
      // Match "quick X" or "just X" broadly
      /^(?:just|quick(?:ly)?)\s+\w+/i,
    ],
    baseConfidence: 0.70,
  },
]

// Keywords that boost or reduce confidence
const CONFIDENCE_MODIFIERS = {
  boost: [
    { pattern: /urgent|asap|priority|critical/i, delta: 0.05 },
    { pattern: /please|need\s+to|have\s+to|must/i, delta: 0.03 },
  ],
  reduce: [
    { pattern: /maybe|perhaps|might|could/i, delta: -0.10 },
    { pattern: /not\s+sure|unsure|wonder/i, delta: -0.15 },
    { pattern: /\?$/i, delta: -0.05 }, // Questions reduce confidence
  ],
}

/**
 * Detects the likely workflow intent from natural language input.
 *
 * @param {string} userInput - Raw user input (may or may not start with /)
 * @returns {Object} Detection result with command, confidence, type, and reason
 *
 * @example
 * detectIntent("Add a login feature with OAuth")
 * // { command: '/feature', type: 'feature', confidence: 0.88, reason: '...' }
 */
function detectIntent(userInput) {
  if (!userInput || typeof userInput !== 'string') {
    return { command: null, confidence: 0, type: null, reason: 'Empty input' }
  }

  const input = userInput.trim()

  // If already a slash command, don't re-route
  if (input.startsWith('/')) {
    const cmd = input.split(/\s+/)[0]
    return {
      command: cmd,
      confidence: 1.0,
      type: 'explicit',
      reason: 'Explicit slash command',
    }
  }

  let bestMatch = null
  let bestScore = 0

  for (const intent of INTENT_PATTERNS) {
    for (const pattern of intent.patterns) {
      if (pattern.test(input)) {
        let score = intent.baseConfidence

        // Apply confidence modifiers
        for (const mod of CONFIDENCE_MODIFIERS.boost) {
          if (mod.pattern.test(input)) score += mod.delta
        }
        for (const mod of CONFIDENCE_MODIFIERS.reduce) {
          if (mod.pattern.test(input)) score += mod.delta
        }

        // Clamp to [0, 1]
        score = Math.max(0, Math.min(1, score))

        if (score > bestScore) {
          bestScore = score
          bestMatch = {
            command: intent.command,
            type: intent.type,
            confidence: score,
            matchedPattern: pattern.toString(),
          }
        }
      }
    }
  }

  if (bestMatch) {
    return {
      ...bestMatch,
      reason: `Matched ${bestMatch.type} pattern with ${Math.round(bestMatch.confidence * 100)}% confidence`,
    }
  }

  return {
    command: null,
    confidence: 0,
    type: null,
    reason: 'No workflow pattern detected',
  }
}

// Thresholds for skip suggestions (conservative)
const SKIP_THRESHOLDS = {
  'design-review': {
    maxLOC: 50,
    maxFiles: 2,
    reason: 'Small change, design review may be unnecessary',
  },
  'requirements-review': {
    maxLOC: 30,
    maxFiles: 1,
    reason: 'Trivial change, requirements are self-evident',
  },
  'spec': {
    maxLOC: 20,
    maxFiles: 1,
    reason: 'Very small change, spec may be overkill',
  },
}

/**
 * Suggests whether a workflow step should be skipped based on context.
 *
 * AIDEV-NOTE: This uses conservative thresholds as per user preference.
 * Only suggests skipping for very small changes (<50 LOC, 1-2 files).
 *
 * @param {string} step - The workflow step name (e.g., 'design-review')
 * @param {Object} context - Context about the current work
 * @param {number} context.estimatedLOC - Estimated lines of code to change
 * @param {number} context.fileCount - Number of files affected
 * @param {string} context.type - Type of work (feature, fix, review)
 * @returns {Object} Suggestion with suggest (bool), reason, and confidence
 */
function shouldSkipStep(step, context = {}) {
  const threshold = SKIP_THRESHOLDS[step]
  if (!threshold) {
    return { suggest: false, reason: 'No skip rules for this step' }
  }

  const { estimatedLOC = Infinity, fileCount = Infinity, type = 'feature' } = context

  // Quick tasks always suggest skipping heavy process
  if (type === 'quick' && (step === 'design-review' || step === 'spec')) {
    return {
      suggest: true,
      reason: 'Quick task - formal review likely unnecessary',
      confidence: 0.9,
    }
  }

  // Check against thresholds
  if (estimatedLOC <= threshold.maxLOC && fileCount <= threshold.maxFiles) {
    return {
      suggest: true,
      reason: `${threshold.reason} (~${estimatedLOC} LOC, ${fileCount} file${fileCount > 1 ? 's' : ''})`,
      confidence: 0.75,
    }
  }

  return { suggest: false, reason: 'Change is significant enough to warrant this step' }
}

module.exports = {
  detectIntent,
  shouldSkipStep,
  // Export for testing
  INTENT_PATTERNS,
  SKIP_THRESHOLDS,
}
