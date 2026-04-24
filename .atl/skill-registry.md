# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When creating a pull request, opening a PR, or preparing changes for review | branch-pr | C:\Users\Usuario\.gemini\antigravity\skills\branch-pr\SKILL.md |
| When writing Go tests, using teatest, or adding test coverage | go-testing | C:\Users\Usuario\.gemini\antigravity\skills\go-testing\SKILL.md |
| When creating a GitHub issue, reporting a bug, or requesting a feature | issue-creation | C:\Users\Usuario\.gemini\antigravity\skills\issue-creation\SKILL.md |
| When user says "judgment day", "review adversarial", "dual review", "juzgar", "que lo juzguen" | judgment-day | C:\Users\Usuario\.gemini\antigravity\skills\judgment-day\SKILL.md |
| When user asks to create a new skill, add agent instructions, or document patterns for AI | skill-creator | C:\Users\Usuario\.gemini\antigravity\skills\skill-creator\SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### branch-pr
- Every PR MUST link an approved issue (`Closes #N`) — no exceptions
- Every PR MUST have exactly one `type:*` label
- Branch naming: `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`
- Commit format: `type(scope): description` — conventional commits only
- No `Co-Authored-By` trailers — never add AI attribution
- Run shellcheck on modified shell scripts before pushing
- PR body must follow template: linked issue, type checkbox, summary, changes table, test plan, checklist

### go-testing
- Use table-driven tests with `[]struct` + `t.Run()` for all multi-case tests
- Test Bubbletea models via `Model.Update()` for state transitions, `teatest.NewTestModel()` for full flows
- Golden file testing for View() output — store in `testdata/` directory
- Mock system dependencies via interfaces, use `t.TempDir()` for file operations
- Skip integration tests with `testing.Short()` — `if testing.Short() { t.Skip() }`
- Error tests must check `(err != nil) != tt.wantErr` pattern

### issue-creation
- Blank issues disabled — MUST use bug_report or feature_request template
- Every issue auto-gets `status:needs-review` — requires maintainer `status:approved` before PR
- Questions go to Discussions, not issues
- Bug reports require: description, steps to reproduce, expected/actual behavior, OS, agent, shell
- Feature requests require: problem description, proposed solution, affected area

### judgment-day
- Launch TWO judge sub-agents in parallel (blind, independent) — orchestrator NEVER reviews code itself
- Classify warnings: `WARNING (real)` = normal user can trigger; `WARNING (theoretical)` = contrived scenario → report as INFO
- After 2 fix iterations with remaining issues → ASK user, never auto-escalate
- APPROVED = 0 confirmed CRITICALs + 0 confirmed real WARNINGs (theoretical may remain)
- Fix Agent is a SEPARATE delegation — never use a judge as fixer
- Resolve skills from registry BEFORE launching judges — inject Project Standards into ALL prompts

### skill-creator
- SKILL.md is the only required file — assets/ and references/ are optional
- Frontmatter must include: name, description (with Trigger:), license, metadata.author, metadata.version
- Name pattern: `{technology}` for generic, `{project}-{component}` for project-specific
- references/ must point to LOCAL files, never web URLs
- Keep code examples minimal — link to docs instead of duplicating
- Register new skills in AGENTS.md after creation

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| — | — | No project convention files found |

No convention files (agents.md, CLAUDE.md, .cursorrules, GEMINI.md, copilot-instructions.md) found in project root.
