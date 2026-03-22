# Integrations Audit

**Project:** Gridlock — F1 Predictive Game
**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Supabase
**Date:** 2026-03-21
**Audited by:** Claude (claude-opus-4-6)

---

## Current State

No existing Claude tooling. No `.claude/` directory, no `CLAUDE.md`, no MCP configs, no hooks, no skills. This is a clean Next.js + Supabase web application.

---

## Audit Matrix

### 1. Superpowers — `obra/superpowers`

| Field | Value |
|-------|-------|
| **Purpose** | Composable skill pack: TDD (RED-GREEN-REFACTOR), systematic debugging, code review, parallel agent dispatch, git worktree management, planning/executing phases |
| **Category** | B — Optional skill pack |
| **How installed** | Claude Code marketplace: `/plugin marketplace add obra/superpowers` |
| **Overlap risk** | Low. Skills activate contextually, no state management, no hooks that conflict |
| **Should integrate** | **YES** |
| **Reason** | TDD enforcement and systematic-debugging are directly useful for a TypeScript/Next.js codebase. The skills are additive, reversible, and low-ceremony. Requesting-code-review and writing-plans are productivity wins. No orchestration conflict. |

---

### 2. Awesome Claude Code — `hesreallyhim/awesome-claude-code`

| Field | Value |
|-------|-------|
| **Purpose** | Curated reference list of community Claude Code tools, plugins, workflows, hooks, and CLAUDE.md templates. No installable code. |
| **Category** | E — Reference only |
| **How installed** | N/A — it is a list |
| **Overlap risk** | None |
| **Should integrate** | **NO** |
| **Reason** | Pure discovery resource. Nothing to install. Useful as a bookmark when evaluating future tooling, not as a runtime component. |

---

### 3. Get Shit Done — `gsd-build/get-shit-done`

| Field | Value |
|-------|-------|
| **Purpose** | Full orchestration layer: multi-agent spawning (researcher/planner/executor/verifier), context-rot prevention, persistent state via `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `CONTEXT.md` |
| **Category** | A — Core runtime/orchestration layer |
| **How installed** | `npx get-shit-done-cc@latest` |
| **Overlap risk** | HIGH — Full orchestration system that conflicts with Everything Claude Code's multi-agent commands and hook system |
| **Should integrate** | **NO** |
| **Reason** | GSD is designed for large, complex projects with multiple parallel work streams. Gridlock is a focused web app (10 source files). The ceremony overhead — five persistent markdown state files, phase-based orchestration, XML task specs — would slow development without meaningful benefit. The project doesn't have the scale to justify an orchestration layer. Superpowers provides sufficient workflow structure without the infrastructure cost. |

---

### 4. Claude-Mem — `thedotmack/claude-mem`

| Field | Value |
|-------|-------|
| **Purpose** | Persistent cross-session memory: SQLite (FTS5) + Chroma vector DB, exposed via 3 MCP tools (search, timeline, get_observations), 5 lifecycle hooks (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd) |
| **Category** | C — Memory layer |
| **How installed** | Claude Code marketplace: `/plugin marketplace add thedotmack/claude-mem` then `/plugin install claude-mem` |
| **Overlap risk** | Low, if it is the ONLY memory layer. Its storage (SQLite + Chroma on port 37777) is fully isolated. |
| **Should integrate** | **YES** |
| **Reason** | Provides clean, isolated cross-session memory with no conflicts. Useful for remembering F1 season context (driver lineups, race calendar changes), design decisions, Supabase schema rationale, and in-progress feature context across sessions. The 3-layer retrieval approach is token-efficient. Install it as the single memory layer — do not layer any other memory system on top. |
| **Hard constraint** | This must remain the ONLY memory system. Do not add LightRAG, AGENTS.md memory hooks from ECC, or any other memory layer. |

---

### 5. UI UX Pro Max — `nextlevelbuilder/ui-ux-pro-max-skill`

| Field | Value |
|-------|-------|
| **Purpose** | AI design intelligence skill: 67 UI styles (glassmorphism, brutalism, bento, etc.), 161 industry-specific color palettes, 57 typography pairings, 25 chart recommendations, 161 reasoning rules, 99 UX guidelines |
| **Category** | B — Optional skill pack (UI/design specialized) |
| **How installed** | `npx uipro-cli` |
| **Overlap risk** | None. Purely additive design capability, does not override core behaviors |
| **Should integrate** | **YES** |
| **Reason** | Gridlock is a high-fidelity, visually intense F1 brand application. The landing page has custom cursor animations, parallax helmet, neon laser effects, F1 HUD overlay. Future feature work (leaderboards, race cards, prediction UI) will benefit from structured design intelligence. UI UX Pro Max is activated on demand — it won't interfere with backend or API work. The F1/motorsport aesthetic maps well to its design-system generation capability. |

---

### 6. n8n MCP — `czlonkowski/n8n-mcp`

| Field | Value |
|-------|-------|
| **Purpose** | MCP server exposing 1,084 n8n workflow nodes, 2,709 templates, and workflow management tools to AI assistants |
| **Category** | D — Automation/integration layer |
| **How installed** | `npx` or Docker |
| **Overlap risk** | None (isolated MCP server) |
| **Should integrate** | **NO** |
| **Reason** | Gridlock does not use n8n. There is no automation workflow backend in this project — it is a Next.js API routes + Supabase app. n8n MCP would add an MCP server that consumes context window budget while providing zero functionality relevant to F1 predictions, race results ingestion, or leaderboard computation. If n8n is ever adopted for background automation (e.g., scheduled race result ingestion), revisit then. |

---

### 7. Obsidian Skills — `kepano/obsidian-skills`

| Field | Value |
|-------|-------|
| **Purpose** | Five skills for Obsidian-specific file formats: wikilinks, Obsidian Bases, JSON Canvas, Obsidian CLI, web content extraction via Defuddle |
| **Category** | B — Optional skill pack (domain-specific, Obsidian-locked) |
| **How installed** | Marketplace or `npx skills` |
| **Overlap risk** | None |
| **Should integrate** | **NO** |
| **Reason** | Obsidian is not part of the Gridlock workflow. These skills target a specific app ecosystem (Obsidian PKM). They would never activate in a Next.js web development context. Zero benefit, small clutter cost. |

---

### 8. LightRAG — `hkuds/lightrag`

| Field | Value |
|-------|-------|
| **Purpose** | Python RAG framework with knowledge graph construction (entity/relationship extraction), hybrid retrieval (local/global/hybrid query modes), pluggable vector backends (Chroma, Qdrant, Milvus, Neo4j, PostgreSQL) |
| **Category** | C — Memory/Knowledge layer (heavy, Python) |
| **How installed** | `pip install lightrag-hku` — requires Python 3.10+, separate service |
| **Overlap risk** | Medium — if added alongside Claude-Mem, two memory systems exist with overlapping scope |
| **Should integrate** | **NO** |
| **Reason** | LightRAG is designed for document corpora and long-term knowledge graphs. Gridlock has no document corpus to index — it is a real-time prediction game with structured relational data in Supabase. Python dependency is a stack mismatch for a Node.js project. Claude-Mem already covers cross-session memory with lower overhead. LightRAG would be a significant infrastructure addition (dedicated service, embedding model, vector backend) for zero practical gain on this app. |

---

### 9. Everything Claude Code — `affaan-m/everything-claude-code`

| Field | Value |
|-------|-------|
| **Purpose** | Full-spectrum Claude Code enhancement: 28 agents, 116 skills, 59 commands, 34 rules, 15+ hooks, pre-configured MCP servers (Supabase, GitHub, Vercel, Railway, ClickHouse), memory systems, cross-harness support |
| **Category** | A — Core runtime layer (modular, but wholesale = orchestration system) |
| **How installed** | `install-plan.js` + `install-apply.js` for selective install, or full plugin install |
| **Overlap risk** | HIGH wholesale — 116 skills + 59 commands creates prompt soup, hook system conflicts with GSD if both used, memory hooks conflict with Claude-Mem |
| **Should integrate** | **SELECTIVE EXTRACTION ONLY** |
| **Reason** | ECC is extremely broad. Wholesale adoption would deliver 116 skills that are irrelevant to this project (Django, Laravel, Spring Boot, PyTorch, ClickHouse...) and 59 commands that clutter the command palette. However, several components are directly valuable and extractable: TypeScript/coding-style rules, security rules, the hook configuration pattern, and MCP server configs for Supabase and Context7. These are cherry-picked into `CLAUDE.md` and `.claude/settings.json` rather than installed wholesale. |
| **What is extracted** | `rules/common/coding-style.md` → CLAUDE.md coding rules; `rules/common/security.md` → CLAUDE.md security rules; MCP config pattern for Supabase + Context7 → `.claude/settings.json`; hook pattern for secrets detection + no-verify blocking + console.log warnings → `.claude/settings.json` hooks |
| **What is skipped** | All 116 skills (use Superpowers instead for workflow skills); all 59 commands; 28 agents (overkill); memory hooks (use Claude-Mem instead); Vercel/Railway/ClickHouse/Cloudflare MCP (not in stack) |

---

## Summary Decisions

| Repo | Decision | Integration method |
|------|----------|-------------------|
| Superpowers | Integrate | `/plugin marketplace add obra/superpowers` |
| Awesome Claude Code | Skip | Bookmark as reference |
| Get Shit Done | Skip | Too heavy for this project scale |
| Claude-Mem | Integrate | `/plugin marketplace add thedotmack/claude-mem` |
| UI UX Pro Max | Integrate | `npx uipro-cli` |
| n8n MCP | Skip | Not in stack |
| Obsidian Skills | Skip | Not in workflow |
| LightRAG | Skip | Wrong stack, wrong scale |
| Everything Claude Code | Selective extraction | Rules + MCP config pattern manually extracted |
