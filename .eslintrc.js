// AIDEV-NOTE: Minimal ESLint config for the OpenCode workflow framework.
// Enforces consistent CommonJS style; no framework-specific rules needed
// since this codebase is plain Node.js scripts and markdown command files.
module.exports = {
  env: {
    node: true,
    es2020: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-undef': 'error',
    'no-console': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    '*.md',
  ],
}
