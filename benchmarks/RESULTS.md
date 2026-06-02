# Benchmark Results

Append-only comparison table. Each row is a completed benchmark run.

| Run ID | Task | Category | Agents (parallel groups) | Wall Clock | Quality | Tokens | Winner | Notes |
|--------|------|----------|--------------------------|------------|---------|--------|--------|-------|
| 2026-06-02 00:46 | GPU Monitor Dashboard | implementation | `[qwen-implementer, qwen-architect, gemma-scout, gemma-context-weaver] → [qwen-verifier, gemma-bug-sniffer, gemma-ux-voice] → qwen-doc-writer` | ~5min | 4.5/5 | est. | — | Baseline run. 8 agents used. Verifier found 2 critical bugs. Qwen agents queued (not truly parallel). Scout/context-weaver overlapped. |
| 2026-06-02 19:28 | GPU Monitor SPA Update | bugfix | `[gemma-bug-sniffer, qwen-verifier]` | ~30s | 4.75/5 | est. | A | Bug hunt for "Illegal invocation". Verifier found real cause (destructured querySelector). Bug-sniffer missed it (red herring). SSE + mobile + network access all working. |

## Legend

- **Agents column format:** `[gemma-scout, gemma-bug-sniffer] → qwen-architect → [qwen-test-runner, qwen-verifier]` (brackets = parallel group, arrow = sequential chain)
- **Quality:** average of correctness/completeness/efficiency/safety (out of 5)
- **Winner:** `—` = first run, `A` = current config, `B` = previous config, `T` = tie

## Patterns Observed

1. **Qwen-to-Qwen "parallel" is sequential** — `qwen-implementer` + `qwen-architect` in same parallel group both hit :8001 and queue. Chain them instead.
2. **Gemma scout + context-weaver overlap** — both summarized the same files. Use one or the other per task.
3. **qwen-verifier is essential for external commands** — caught 2 critical nvidia-smi field name bugs that would have broken the endpoint entirely.
4. **Cross-validation works** — gemma-bug-sniffer independently confirmed verifier's off-by-one finding.
5. **qwen-implementer needs command validation** — didn't verify nvidia-smi field names before writing parsing code.
6. **qwen-verifier > gemma-bug-sniffer for deep JS bugs** — verifier correctly identified destructuring issue; bug-sniffer missed it and flagged a red herring. Use verifier for complex runtime errors.
7. **Never destructure DOM methods** — `querySelector` loses `this` binding when destructured. Use arrow functions or direct calls.

## Optimization Backlog

- [ ] **HIGH:** Chain Qwen agents sequentially instead of parallel (architect → implementer → verifier)
- [ ] **HIGH:** Always run qwen-verifier on code calling external commands
- [x] **HIGH:** Add qwen-verifier to ALL frontend code that manipulates DOM methods — DONE 2026-06-02
- [ ] **MEDIUM:** Choose between gemma-scout and gemma-context-weaver, don't spawn both for same purpose
- [x] **MEDIUM:** Set Gemma `--parallel 2` to enable real Gemma-to-Gemma parallelism — DONE 2026-06-02
- [ ] **MEDIUM:** Add eslint rule to prevent destructuring DOM methods (querySelector, etc.)
- [ ] **LOW:** Add command validation step to qwen-implementer prompt
- [ ] **LOW:** Consider `gemma-validator` agent for pre-flight command checking
- [ ] **LOW:** Add SSE heartbeat to prevent proxy timeouts (NGINX, Cloudflare)
