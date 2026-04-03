// AIDEV-NOTE: This file must use CommonJS (module.exports) — the project is
// a CJS package (no "type": "module" in package.json). Using ESM `export`
// syntax here would cause a SyntaxError at require() time (CRITICAL-4 fix).
const EnvProtection = async ({ client, $ }) => {
  return {
    tool: {
      execute: {
        before: async (input, output) => {
          if (input.tool === "read" && output.args.filePath.includes(".env")) {
            throw new Error("Do not read .env files")
          }
        }
      }
    }
  }
}

module.exports = { EnvProtection }
