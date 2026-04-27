Review this session for learnings about working with Agents in this codebase. Update AGENTS.md with context that would help future Agent sessions be more effective.

## Step 1: Reflect

What context was missing that would have helped Agents work more effectively?

- Bash commands that were used or discovered
- Code style patterns followed
- Testing approaches that worked
- Environment/configuration quirks
- Warnings or gotchas encountered

## Step 2: Find AGENTS.md Files

```bash
find . -name "AGENTS.md" 2>/dev/null | head -20
```

## Step 3: Draft Additions

**Keep it concise** - one line per concept. AGENTS.md is part of the prompt, so brevity matters.

Format: `<command or pattern>` - `<brief description>`

Avoid:

- Verbose explanations
- Obvious information
- One-off fixes unlikely to recur

## Step 4: Show Proposed Changes

For each addition:

```
### Update: ./AGENTS.md

**Why:** [one-line reason]

\`\`\`diff
+ [the addition - keep it brief]
\`\`\`
```

## Step 5: Apply with Approval

Ask if the user wants to apply the changes. Only edit files they approve.
