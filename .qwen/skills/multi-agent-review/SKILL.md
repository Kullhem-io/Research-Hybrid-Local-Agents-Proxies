---
name: multi-agent-parallel-review
description: Launch multiple subagents in parallel to review code from different angles before applying changes
source: auto-skill
extracted_at: '2026-06-02T07:47:35.865Z'
---

## Multi-Agent Parallel Review Workflow

When building or reviewing a non-trivial feature, delegate different review angles to specialized subagents **in parallel** before synthesizing findings and applying fixes. This surfaces issues that a single pass would miss.

### Agent Roles & When to Use

| Agent | Best For | Trigger |
|-------|----------|---------|
| `qwen-implementer` | Writing code (CSS, JS, configs, implementations) | Any coding task |
| `qwen-architect` | Design review, robustness, edge cases, parsing logic | Backend/API work, parsing external data |
| `qwen-verifier` | Contract checking, field name mismatches, completeness | Before shipping — verify frontend ↔ backend alignment |
| `gemma-bug-sniffer` | Targeted logic bugs, off-by-one errors, edge cases | After implementation, before testing |
| `gemma-ux-voice` | User-facing text, labels, error messages, accessibility | Any frontend/UI work |
| `gemma-scout` | Quick project exploration, identifying missing pieces | At the start, to orient yourself |
| `gemma-context-weaver` | Summarizing what's built, creating context snapshots | After implementation, to consolidate state |
| `gemma-media-inspector` | Image/media review | Screenshots, assets |
| `qwen-doc-writer` | Documentation, README updates | After features land |
| `qwen-test-runner` | Running tests, smoke checks | After code changes |

### Procedure

1. **Build** — Delegate implementation to the most capable agent (qwen-implementer for code, qwen-doc-writer for docs)
2. **Review in parallel** — Launch 2-4 review agents simultaneously:
   - `qwen-architect` for design/robustness
   - `qwen-verifier` for contract correctness
   - `gemma-bug-sniffer` for logic bugs
   - `gemma-ux-voice` for user-facing polish
3. **Synthesize** — Read all agent reports, prioritize findings by severity (critical → high → medium → low)
4. **Fix** — Apply fixes from the main agent, not from subagents (you control the merge)
5. **Verify** — Re-run tests or spot-check the fixes

### Why This Works

- **Parallelism** — Agents review independently without blocking each other
- **Diverse perspectives** — Architect catches design issues verifier misses; UX voice catches accessibility gaps no one else considers
- **Both models** — Leverages both Qwen (deep analysis) and Gemma (fast, focused checks)
- **Catches more bugs** — In the GPU monitor build, this approach found 2 critical bugs that would have broken the entire endpoint, plus 4 medium/low issues

### When to Skip

- Trivial one-file changes (config tweaks, typo fixes)
- When the user explicitly asks for a quick-and-dirty approach
- When time-critical and a single review is sufficient
