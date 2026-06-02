# Benchmark Results

Append-only comparison table. Each row is a completed benchmark run.

| Run ID | Task | Category | Agents (parallel groups) | Wall Clock | Quality | Tokens | Winner | Notes |
|--------|------|----------|--------------------------|------------|---------|--------|--------|-------|
| 2026-06-02 00:46 | GPU Monitor Dashboard | implementation | `[qwen-implementer, qwen-architect, gemma-scout, gemma-context-weaver] → [qwen-verifier, gemma-bug-sniffer, gemma-ux-voice] → qwen-doc-writer` | ~5min | 4.5/5 | est. | — | Baseline run. 8 agents used. Verifier found 2 critical bugs. Qwen agents queued (not truly parallel). Scout/context-weaver overlapped. |

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

## Optimization Backlog

- [ ] **HIGH:** Chain Qwen agents sequentially instead of parallel (architect → implementer → verifier)
- [ ] **HIGH:** Always run qwen-verifier on code calling external commands
- [ ] **MEDIUM:** Choose between gemma-scout and gemma-context-weaver, don't spawn both for same purpose
- [x] **MEDIUM:** Set Gemma `--parallel 2` to enable real Gemma-to-Gemma parallelism — DONE 2026-06-02
- [ ] **LOW:** Add command validation step to qwen-implementer prompt
- [ ] **LOW:** Consider `gemma-validator` agent for pre-flight command checking
