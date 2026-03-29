# /generate-lang-skills

Generate custom coding-standards and debugger skills for a language that has no built-in OpenCode support.

## Usage

```
/generate-lang-skills <language>
```

## What it does

1. Reads the language from the argument (or from `.agent/config.json` if no argument given)
2. Loads the prompt template from `.agent/skills/` or falls back to the built-in template
3. Asks the AI to generate two files:
   - `.agent/skills/coding-standards/SKILL.md` — idiomatic coding standards for the language
   - `.agent/agent/debugger-<language>.md` — a debugger agent definition
4. Writes the generated files and reports what was created

## Steps

### 1. Determine language

If an argument was passed (e.g. `/generate-lang-skills swift`), use that.

Otherwise, read `.agent/config.json`:

```js
const config = JSON.parse(fs.readFileSync('.agent/config.json', 'utf8'))
const language = config.language
```

If no language can be determined, ask the user: "Which language should I generate skills for?"

### 2. Load the prompt template

Look for the template at:
- `.agent/skills/generate-lang-skills.md.tmpl` (project-local override)
- Then fall back to reading the content of `templates/generate-lang-skills.md.tmpl` in the opencode repo

Replace `{{LANGUAGE}}` with the detected language name throughout the template.

### 3. Send the prompt to the AI

Use the rendered template as the prompt. The AI will output two complete files.

### 4. Parse and write the output

The AI response will contain clearly labeled file paths followed by content.
Parse each file block and write:

- `.agent/skills/coding-standards/SKILL.md`
- `.agent/agent/debugger-<language>.md`

Create parent directories as needed.

### 5. Report

Show a summary:

```
✓ Generated .agent/skills/coding-standards/SKILL.md
✓ Generated .agent/agent/debugger-<language>.md

These files are now available to all OpenCode sessions in this project.
Tip: Review and customize the generated files for your specific project needs.
```

## Notes

- If `.agent/skills/coding-standards/SKILL.md` already exists, ask the user: "coding-standards skill already exists. Overwrite? [y/N]"
- The generated skills are project-local (`.agent/`) and are not committed unless you choose to
- You can re-run this command any time to regenerate the skills
- The template at `templates/generate-lang-skills.md.tmpl` can be customized to change what gets generated
