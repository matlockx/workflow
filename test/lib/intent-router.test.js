/**
 * Tests for Intent Router
 *
 * @module test/lib/intent-router.test
 */

const {
  detectIntent,
  shouldSkipStep,
  INTENT_PATTERNS,
  SKIP_THRESHOLDS,
} = require('../../lib/intent-router.js')

describe('detectIntent', () => {
  describe('feature intent', () => {
    const featureInputs = [
      'Add a login feature with OAuth',
      'add login',
      'Add login',
      'create a dark mode toggle',
      'implement user authentication',
      'build a new dashboard',
      'I want to add a search feature',
      'We need to create a notification system',
      "Let's implement caching",
    ]

    test.each(featureInputs)('detects feature intent from "%s"', (input) => {
      const result = detectIntent(input)
      expect(result.type).toBe('feature')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
      expect(result.command).toBe('/feature')
    })
  })

  describe('fix intent', () => {
    const fixInputs = [
      'Fix the bug where users cannot reset passwords',
      'fix the login issue',
      'resolve the authentication bug',
      'debug the payment error',
      'repair the broken form validation',
    ]

    test.each(fixInputs)('detects fix intent from "%s"', (input) => {
      const result = detectIntent(input)
      expect(result.type).toBe('fix')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
      expect(result.command).toBe('/feature')
    })
  })

  describe('review intent', () => {
    const reviewInputs = [
      'Review and optimize the codebase',
      'optimize the database queries',
      'refactor the authentication module',
      'improve the API performance',
      'clean up the legacy code',
      'Make the app better',
      'make it faster',
    ]

    test.each(reviewInputs)('detects review intent from "%s"', (input) => {
      const result = detectIntent(input)
      expect(result.type).toBe('review')
      expect(result.confidence).toBeGreaterThanOrEqual(0.75)
      expect(result.command).toBe('/feature')
    })
  })

  describe('plan intent', () => {
    const planInputs = [
      "Let's plan the Q3 roadmap",
      'plan the new architecture',
      'brainstorm ideas for the redesign',
      // Note: 'explore options' now matches research intent (more specific)
    ]

    test.each(planInputs)('detects plan intent from "%s"', (input) => {
      const result = detectIntent(input)
      expect(result.type).toBe('plan')
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
      expect(result.command).toBe('/plan')
    })
  })

  describe('research intent', () => {
    const researchInputs = [
      'research how to implement OAuth',
      'research the best approach',
      'investigate whether we should use Redis',
      'what are the options for caching',
      'compare different database options',
      'evaluate the trade-offs of microservices',
      'should we use GraphQL or REST',
      'which is better: Postgres or MySQL',
      "what's the best way to handle authentication",
      'is it possible to run this without Docker',
      'pros and cons of serverless',
      'explore options for the migration',
    ]

    test.each(researchInputs)('detects research intent from "%s"', (input) => {
      const result = detectIntent(input)
      expect(result.type).toBe('research')
      expect(result.confidence).toBeGreaterThanOrEqual(0.75)
      expect(result.command).toBe('/feature')
    })
  })

  describe('quick intent', () => {
    const quickInputs = [
      'Just rename the function to getUserById',
      'quickly fix the typo',
      'simply update the constant',
      'small change to the config',
      'rename the variable',
    ]

    test.each(quickInputs)('detects quick intent from "%s"', (input) => {
      const result = detectIntent(input)
      expect(result.type).toBe('quick')
      expect(result.confidence).toBeGreaterThanOrEqual(0.65)
      expect(result.command).toBe('/implement')
    })
  })

  describe('explicit commands', () => {
    test('returns explicit type for slash commands', () => {
      const result = detectIntent('/feature PROJ-123')
      expect(result.type).toBe('explicit')
      expect(result.confidence).toBe(1.0)
      expect(result.command).toBe('/feature')
    })

    test('handles various slash commands', () => {
      expect(detectIntent('/feature ISSUE-1').command).toBe('/feature')
      expect(detectIntent('/implement').command).toBe('/implement')
      expect(detectIntent('/plan').command).toBe('/plan')
    })
  })

  describe('edge cases', () => {
    test('returns null for empty input', () => {
      const result = detectIntent('')
      expect(result.command).toBeNull()
      expect(result.confidence).toBe(0)
    })

    test('returns null for undefined input', () => {
      const result = detectIntent(undefined)
      expect(result.command).toBeNull()
      expect(result.confidence).toBe(0)
    })

    test('returns low confidence for ambiguous input', () => {
      const result = detectIntent('hello world')
      expect(result.confidence).toBeLessThan(0.5)
    })

    test('reduces confidence for questions', () => {
      const statement = detectIntent('add a feature')
      const question = detectIntent('should I add a feature?')
      expect(question.confidence).toBeLessThan(statement.confidence)
    })

    test('reduces confidence for uncertain language', () => {
      const certain = detectIntent('add a login feature')
      const uncertain = detectIntent('maybe add a login feature')
      expect(uncertain.confidence).toBeLessThan(certain.confidence)
    })
  })
})

describe('shouldSkipStep', () => {
  describe('design-review', () => {
    test('suggests skip for small changes under threshold', () => {
      const result = shouldSkipStep('design-review', {
        estimatedLOC: 30,
        fileCount: 1,
        type: 'fix',
      })
      expect(result.suggest).toBe(true)
      expect(result.reason).toContain('Small change')
    })

    test('does not suggest skip for large changes', () => {
      const result = shouldSkipStep('design-review', {
        estimatedLOC: 200,
        fileCount: 10,
        type: 'feature',
      })
      expect(result.suggest).toBe(false)
    })

    test('respects file count threshold', () => {
      const result = shouldSkipStep('design-review', {
        estimatedLOC: 30,
        fileCount: 5, // exceeds threshold
        type: 'fix',
      })
      expect(result.suggest).toBe(false)
    })
  })

  describe('spec skip', () => {
    test('suggests skip for quick task type', () => {
      const result = shouldSkipStep('spec', {
        estimatedLOC: 15,
        fileCount: 1,
        type: 'quick',
      })
      expect(result.suggest).toBe(true)
      expect(result.confidence).toBeGreaterThanOrEqual(0.9)
    })

    test('suggests skip for very small changes', () => {
      const result = shouldSkipStep('spec', {
        estimatedLOC: 10,
        fileCount: 1,
        type: 'feature',
      })
      expect(result.suggest).toBe(true)
    })
  })

  describe('unknown steps', () => {
    test('does not suggest skip for unknown steps', () => {
      const result = shouldSkipStep('unknown-step', {
        estimatedLOC: 10,
        fileCount: 1,
      })
      expect(result.suggest).toBe(false)
    })
  })
})

describe('INTENT_PATTERNS', () => {
  test('all patterns have required fields', () => {
    for (const intent of INTENT_PATTERNS) {
      expect(intent.command).toBeDefined()
      expect(intent.type).toBeDefined()
      expect(intent.patterns).toBeInstanceOf(Array)
      expect(intent.patterns.length).toBeGreaterThan(0)
      expect(intent.baseConfidence).toBeGreaterThan(0)
      expect(intent.baseConfidence).toBeLessThanOrEqual(1)
    }
  })
})

describe('SKIP_THRESHOLDS', () => {
  test('all thresholds have required fields', () => {
    for (const [step, threshold] of Object.entries(SKIP_THRESHOLDS)) {
      expect(threshold.maxLOC).toBeDefined()
      expect(threshold.maxLOC).toBeGreaterThan(0)
      expect(threshold.maxFiles).toBeDefined()
      expect(threshold.maxFiles).toBeGreaterThan(0)
      expect(threshold.reason).toBeDefined()
    }
  })

  test('design-review has conservative thresholds', () => {
    expect(SKIP_THRESHOLDS['design-review'].maxLOC).toBeLessThanOrEqual(50)
    expect(SKIP_THRESHOLDS['design-review'].maxFiles).toBeLessThanOrEqual(2)
  })
})
