/**
 * Tests for Intent Router
 *
 * @module test/lib/intent-router.test
 */

const {
  detectIntent,
  shouldSkipStep,
  generateCheckpointSummary,
  formatCheckpointPrompt,
  getWorkflowRecommendation,
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
      const result = detectIntent('/spec PROJ-123')
      expect(result.type).toBe('explicit')
      expect(result.confidence).toBe(1.0)
      expect(result.command).toBe('/spec')
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

describe('generateCheckpointSummary', () => {
  test('generates spec summary with counts', () => {
    const summary = generateCheckpointSummary('spec', {
      requirementsCount: 3,
      apiChanges: 2,
      estimatedLOC: 150,
      fileCount: 4,
    })

    expect(summary).toContain('Spec Summary')
    expect(summary).toContain('3 requirements')
    expect(summary).toContain('2 API changes')
    expect(summary).toContain('150 LOC')
    expect(summary).toContain('4 files')
  })

  test('generates task summary with phases', () => {
    const summary = generateCheckpointSummary('tasks', {
      phaseCount: 3,
      taskCount: 8,
      phases: [
        { name: 'Setup', taskCount: 2 },
        { name: 'Implementation', taskCount: 4 },
        { name: 'Testing', taskCount: 2 },
      ],
    })

    expect(summary).toContain('Task Summary')
    expect(summary).toContain('3 phases')
    expect(summary).toContain('8 tasks')
    expect(summary).toContain('Setup')
    expect(summary).toContain('Implementation')
    expect(summary).toContain('Testing')
  })

  test('generates implement summary with progress', () => {
    const summary = generateCheckpointSummary('implement', {
      currentPhase: 'Phase 2: Implementation',
      tasksCompleted: 3,
      tasksTotal: 8,
      filesChanged: 5,
    })

    expect(summary).toContain('Implementation Progress')
    expect(summary).toContain('Phase 2')
    expect(summary).toContain('3/8')
    expect(summary).toContain('5')
  })

  test('handles missing data gracefully', () => {
    const summary = generateCheckpointSummary('spec', {})
    expect(summary).toContain('Spec Summary')
    // Should not throw, just show what's available
  })
})

describe('formatCheckpointPrompt', () => {
  test('includes skip suggestion when suggested', () => {
    const prompt = formatCheckpointPrompt('design-review', {
      skipSuggested: true,
      skipReason: 'Small change (~30 LOC)',
    })

    expect(prompt).toContain('Skip this step')
    expect(prompt).toContain('30 LOC')
  })

  test('shows appropriate options for each stage', () => {
    expect(formatCheckpointPrompt('requirements-review', {})).toContain('Design')
    expect(formatCheckpointPrompt('design-review', {})).toContain('Tasks')
    expect(formatCheckpointPrompt('tasks', {})).toContain('Implement')
    expect(formatCheckpointPrompt('phase-review', {})).toContain('approve phase')
  })
})

describe('getWorkflowRecommendation', () => {
  test('returns full workflow for feature type', () => {
    const intent = { type: 'feature', command: '/feature', confidence: 0.9 }
    const rec = getWorkflowRecommendation(intent)

    expect(rec.workflow).toBe('full')
    expect(rec.steps).toContain('spec (requirements)')
    expect(rec.steps).toContain('spec (design)')
    expect(rec.steps).toContain('tasks')
    expect(rec.steps).toContain('implement')
  })

  test('returns fix workflow for fix type', () => {
    const intent = { type: 'fix', command: '/feature', confidence: 0.9 }
    const rec = getWorkflowRecommendation(intent)

    expect(rec.workflow).toBe('fix')
    expect(rec.canSkip).toContain('spec (requirements)')
  })

  test('returns quick workflow for quick type', () => {
    const intent = { type: 'quick', command: '/implement', confidence: 0.7 }
    const rec = getWorkflowRecommendation(intent)

    expect(rec.workflow).toBe('quick')
    expect(rec.steps).toEqual(['implement', 'review'])
  })

  test('returns research workflow for research type', () => {
    const intent = { type: 'research', command: '/feature', confidence: 0.8 }
    const rec = getWorkflowRecommendation(intent)

    expect(rec.workflow).toBe('research')
    expect(rec.steps).toContain('research')
    expect(rec.steps).toContain('decision')
    expect(rec.agent).toBe('research-agent')
  })

  test('returns unknown for null intent', () => {
    const rec = getWorkflowRecommendation(null)
    expect(rec.workflow).toBe('unknown')
    expect(rec.steps).toEqual([])
  })

  test('returns unknown for intent without type', () => {
    const rec = getWorkflowRecommendation({ command: null, confidence: 0 })
    expect(rec.workflow).toBe('unknown')
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
