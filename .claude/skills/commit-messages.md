# Project Commit Conventions

This file extends the global commit-messages skill (`~/.claude/skills/commit-messages/SKILL.md`).

## Lowercase Rule

Commit messages MUST begin with a lowercase letter after the colon.

**Correct:**
```
feat(composer): add getSummary() method
fix(client): handle network timeout errors
chore(deps): update algosdk to v3.1.0
```

**Incorrect:**
```
feat(composer): Add getSummary() method
fix(client): Handle network timeout errors
chore(deps): Update algosdk to v3.1.0
```

Note: The commit history contains Renovate bot commits that use uppercase (e.g., "chore(deps): Update..."). These are automated and follow Renovate's default format. All commits written by Claude Code or developers should use lowercase.

## Common Scopes

- `client` - RouterClient class changes
- `composer` - SwapComposer class changes
- `middleware` - Middleware system changes
- `types` - Type definitions
- `deps` - Dependency updates
- `examples` - Example application changes
- `docs` - Documentation updates
