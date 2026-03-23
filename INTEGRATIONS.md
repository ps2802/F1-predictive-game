# Integrations

**Project:** Gridlock — F1 Predictive Game
**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Supabase

---

## Final Chosen Stack

```
Gridlock
│
├── CLAUDE.md                       ← project context + TS/security/style rules
│
├── .claude/
│   ├── settings.json               ← MCP server configs + lifecycle hooks
│   └── hooks/
│       └── check-secrets.sh        ← blocks hardcoded secrets before file writes
│
├── [Marketplace] Superpowers       ← workflow skill pack (TDD, debug, review)
├── [Marketplace] Claude-Mem        ← only memory layer (SQLite + Chroma + MCP)
├── [CLI install] UI UX Pro Max     ← UI/design skill pack
│
└── MCP Servers (configured in settings.json)
    ├── supabase                    ← database ops, migrations, RLS management
    ├── context7                    ← live Next.js / Supabase / React docs
    └── github                      ← PR/issue management
```

---

## Install Order

### Step 1 — Files (already done by this session)

The following files were created:
- `CLAUDE.md` — project rules, TypeScript guidelines, security policy
- `.claude/settings.json` — MCP server configs + hooks
- `.claude/hooks/check-secrets.sh` — secrets detection hook
- `INTEGRATIONS_AUDIT.md` — full audit record
- `INTEGRATIONS.md` — this file

### Step 2 — UI UX Pro Max (inside Claude Code session)

```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

Alternatively, via CLI (installs globally):
```bash
npm install -g uipro-cli
uipro init --ai claude
```

### Step 3 — Superpowers (inside Claude Code session)

```
/plugin install superpowers@claude-plugins-official
```

Skills installed:
- `test-driven-development` — enforces RED→GREEN→REFACTOR on all feature work
- `systematic-debugging` — four-phase root-cause analysis before jumping to fixes
- `verification-before-completion` — validates fixes actually resolved the issue
- `requesting-code-review` — pre-submit checklist
- `writing-plans` / `executing-plans` — structured feature planning
- `dispatching-parallel-agents` — concurrent subagent coordination when needed

### Step 4 — Claude-Mem (inside Claude Code session)

```
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

This starts the memory worker on port 37777 and registers 5 lifecycle hooks (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd).

### Step 5 — Environment Variables

Required for MCP servers to function. Add to shell profile or pass at runtime:

```bash
# Supabase MCP (required for database operations via MCP)
export SUPABASE_ACCESS_TOKEN=your_supabase_personal_access_token

# GitHub MCP (optional — enables PR/issue operations)
export GITHUB_PERSONAL_ACCESS_TOKEN=your_github_pat

# Context7 needs no token — free, no auth required
```

The project's existing `.env.local` (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) is separate from MCP credentials and remains unchanged.

---

## Usage Notes

### Superpowers

Skills activate automatically based on task context. Key behaviors:
- When asked to implement a feature → `test-driven-development` kicks in, expects tests first
- When debugging → `systematic-debugging` enforces root-cause tracing before fixes
- When completing work → `verification-before-completion` runs a validation pass

Override by explicitly asking Claude to skip TDD for a specific task.

### Claude-Mem

Memory is transparent — Claude automatically stores observations and retrieves relevant context. To search explicitly:

```
search for "Supabase RLS policy decisions"
show memory timeline
```

Memory persists across sessions. To clear for a fresh start:
```
/plugin uninstall claude-mem
/plugin install claude-mem
```

### UI UX Pro Max

Activated when requesting UI work:
```
"Design a leaderboard card component for the F1 game"
"Create a race prediction form with motorsport styling"
"Build a dark-mode driver standings table"
```

The skill will automatically select from its 67 UI styles and 161 color palettes to match the F1/motorsport domain.

### MCP Servers

**Supabase MCP** — use for:
- Running migrations via natural language
- Querying the database directly during dev
- Generating RLS policies
- Schema exploration

**Context7 MCP** — use for:
- "How does Supabase SSR auth work in Next.js App Router?"
- "What is the correct way to use cookies in Next.js 16 middleware?"
- Always-current docs, not Claude's training cutoff

**GitHub MCP** — use for:
- Creating/reviewing PRs
- Listing open issues
- Checking CI status

---

## What Was Intentionally Skipped

### Get Shit Done (`gsd-build/get-shit-done`)
**Why skipped:** Full multi-agent orchestration layer with five persistent state files (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, CONTEXT.md). Gridlock is a 10-file Next.js app — this overhead would slow development with no meaningful benefit. Superpowers provides sufficient workflow structure.

**Revisit if:** The project scales to 5+ parallel feature streams or brings on multiple developers needing shared context state.

### n8n MCP (`czlonkowski/n8n-mcp`)
**Why skipped:** No n8n in the stack. The project uses Next.js API routes + Supabase triggers for all automation. An MCP server for n8n workflow nodes consumes context budget without delivering any capability.

**Revisit if:** Background job processing is needed (e.g., scheduled race result ingestion, notification workflows).

### Obsidian Skills (`kepano/obsidian-skills`)
**Why skipped:** Obsidian is not in the workflow. These skills target PKM file formats (wikilinks, JSON Canvas) that have no relevance to web development on this project.

**Revisit if:** Documentation is managed in Obsidian.

### LightRAG (`hkuds/lightrag`)
**Why skipped:** Python dependency, requires a separate RAG service with vector database backend (Neo4j, Chroma, Qdrant). The project has no document corpus. Claude-Mem provides cross-session memory. LightRAG is overkill with stack mismatch.

**Revisit if:** The project develops a large knowledge base (e.g., historical F1 data, driver stats corpus) requiring semantic search over thousands of documents.

### Awesome Claude Code (`hesreallyhim/awesome-claude-code`)
**Why skipped:** Pure reference list. Nothing to install.

### Everything Claude Code — wholesale (`affaan-m/everything-claude-code`)
**Why skipped:** 116 skills + 59 commands + 28 agents would be prompt soup for a focused web app. Most content (Django, Laravel, Spring Boot, PyTorch, ClickHouse, Rust, Go rules) is irrelevant. Wholesale install would bloat the harness and create hook conflicts with Claude-Mem.

**What was cherry-picked instead:** Coding style rules, security rules, and hook configuration patterns — all distilled into `CLAUDE.md` and `.claude/settings.json`. MCP config patterns for Supabase and Context7 were used as reference for settings.json.

---

## Rollback Steps

### Remove Superpowers
```
/plugin uninstall superpowers
```

### Remove Claude-Mem
```
/plugin uninstall claude-mem
```
Memory data stored in SQLite/Chroma at the plugin's local storage path is not deleted automatically — see Claude-Mem docs for data removal.

### Remove UI UX Pro Max
```
npx uipro-cli --uninstall
```
Or delete the skill from the installation path specified during setup.

### Remove MCP servers
Edit `.claude/settings.json` and remove the server entry from `mcpServers`. The MCP process will not start on the next session.

### Remove hooks
Edit `.claude/settings.json` and remove or comment out entries from the `hooks` section.

### Revert to clean state
```bash
rm CLAUDE.md
rm -rf .claude/
```

This leaves the project exactly as it was before this integration work.
