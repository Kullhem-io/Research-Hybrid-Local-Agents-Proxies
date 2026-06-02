# Research-Hybrid-Local-Agents-Proxies

Benchmarking workspace for testing parallel subagent collaboration between two local LLMs across a 3-GPU setup. The goal: find the optimal way to use both models simultaneously — whether through subagents, a proxy-based router, or a hybrid approach.

## Hardware Topology

```
GPU 0: RTX 3090  (24 GB) ── Qwen 3.6 27B MTP (:8001)
GPU 1: RTX 3060  (12 GB) ── Qwen 27B tensor shard (5:1 split with GPU 0)
GPU 2: RTX 3060  (12 GB) ── Gemma 4 E4B (:8004) + bge-small-en (:8010)
```

**Key constraint:** llama-server serializes requests per instance. True parallelism only exists across different models (Qwen + Gemma simultaneously). Two Qwen agents spawned together will queue behind each other.

## Quick Start

1. **Prerequisites**
   - NVIDIA GPUs (tested on RTX 3090 + 2× RTX 3060)
   - `llama-server` instances running Qwen 3.6 27B on `:8001` and Gemma 4 E4B on `:8004`
   - Qwen Code CLI

2. **Run the GPU Monitor dashboard** (first benchmark task)
   ```bash
   cd gpu-monitor && npm install && npm start
   # Dashboard at http://localhost:3000
   ```

3. **Every task should use parallel subagents and record benchmarks to `benchmarks/`** (see `AGENTS.md` for methodology)

## Project Structure

| Directory | Contents |
|-----------|----------|
| `benchmarks/` | Benchmark logs, templates, results comparison table, agent evaluation templates |
| `docs/` | Research documents — proxy-vs-subagents architecture analysis, decisions |
| `gpu-monitor/` | Working GPU monitoring dashboard (Node.js + Express, vanilla HTML/CSS/JS) |
| `.qwen/agents/` | 10 subagent definitions (5 Gemma, 5 Qwen) |
| `AGENTS.md` | Methodology, parallel patterns, agent catalog, and experimentation guidelines |

## Subagents (10 total)

**Gemma agents (GPU 2 — fast sensing):** gemma-scout, gemma-bug-sniffer, gemma-context-weaver, gemma-ux-voice, gemma-media-inspector

**Qwen agents (GPU 0+1 — deep reasoning):** qwen-architect, qwen-implementer, qwen-test-runner, qwen-verifier, qwen-doc-writer

See `AGENTS.md` for role descriptions, when to use each agent, and the chain patterns that maximize cross-model parallelism.

## Current Findings

From the first benchmark run (GPU Monitor Dashboard, 2026-06-02):

- Qwen-to-Qwen "parallel" is sequential — llama-server serializes at `:8001`
- Gemma agents can run truly in parallel with Qwen agents
- `qwen-verifier` is essential for code that calls external commands (caught 2 critical bugs in the baseline run)
- Hybrid proxy approach recommended over pure proxy replacement (see `docs/proxy-vs-subagents.md`)

See `benchmarks/RESULTS.md` for the full results table and optimization backlog.

## Research Roadmap

1. **Phase 1 (immediate):** Set Gemma `--parallel 2`, chain Qwen sequentially — zero-cost optimization
2. **Phase 2 (medium):** Add lightweight proxy between subagents and llama-servers for dedup, telemetry, auto-escalation
3. **Phase 3 (post-telemetry):** Data-driven role consolidation and classifier upgrades

Full analysis in `docs/proxy-vs-subagents.md`.
