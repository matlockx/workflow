---
description: "Write a detailed PR descirption inf github markdown"
model: github-copilot/claude-sonnet-4.5
temperature: 0.1
tools:
  write: true
  edit: false
  patch: false
  # enable reading + shell so it can run git and inspect files
  read: true
  grep: true
  glob: true
  bash: true
---

I have a local Git branch ready to create a pull request. Please generate comprehensive PR documentation similar to the example I'll provide.

## Context

- Branch name: $2
- Base branch: develop
- Ticket/Issue ID: $1

## What I Need

Analyze my commits and generate a detailed PR document that includes:

1. **Problem Section**: Explain what bugs/issues existed, with numbered list of specific problems
2. **Root Cause**: Technical explanation of why the issues occurred
3. **Solution**: Break down by commit with:
   - Commit hash and title
   - Problem it solved
   - Specific fix approach
   - Result/impact
4. **Cumulative Changes**: File-by-file breakdown with line counts and what changed
5. **Testing**: List all test scenarios covered
6. **Performance Impact**: Table showing before/after metrics if applicable
7. **Safety & Compatibility**: Breaking changes, backward compatibility notes
8. **Success Criteria**: Checkboxes for requirements met
9. **Evolution**: Why multiple commits if applicable
10. **Follow-up Work**: Future improvements identified
11. **Ready-to-merge checklist**: Risk assessment, QA needs, etc.

## Style Requirements

- Use emojis for section headers (🐛 ✅ 📊 🧪 🔒 📈 🎯 📝 🔮 🔗)
- Be highly technical and specific (include code snippets, SQL examples, algorithm changes)
- Show "before/after" comparisons where relevant
- Include actual line numbers and file paths
- Use tables for comparisons
- Add checkboxes for completed items
- Include performance metrics when code affects efficiency
- Document progressive fixes if commits build on each other
- Add AIDEV-NOTE references if inline documentation was added

## Information to Provide

Please analyze:

1. Git commit history: `git log [base-branch]..HEAD --oneline`
2. Detailed commit changes: `git log [base-branch]..HEAD -p`
3. File change summary: `git diff [base-branch]..HEAD --stat`
4. Test files modified/added
5. Any performance-critical changes

## Output Format

Generate a markdown document with clear hierarchy, code blocks, and tables. Make it suitable for:

- Create a single file at `notes/PR/$1-$2.pr.md`
- GitHub PR description
- Technical documentation
- Code review reference
- Historical record of architectural decisions
