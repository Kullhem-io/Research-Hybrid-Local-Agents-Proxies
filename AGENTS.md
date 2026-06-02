# Qwen Agent Test & Experiment Space

## Mission

Benchmark and optimize **parallel subagent collaboration** between Qwen 3.6 27B and Gemma 4 E4B across a multi-GPU setup. Every task in this workspace should:

1. **Use parallel subagents** — never do work sequentially when agents can run simultaneously
2. **Record performance** — every benchmark run is logged to `benchmarks/` with structured data
3. **Drive iteration** — benchmark data informs subagent prompt modifications, new agent creation, and architectural decisions

## Hardware & Runtime Topology

```
GPU 0: RTX 3090 (24 GB) ─── Qwen 3.6 27B MTP (:8001, tensor-split 5:1 → GPU0+GPU1)
GPU 1: RTX 3060  (12 GB) ─── Qwen 27B tensor shard (1/5 of layers)
GPU 2: RTX 3060  (12 GB) ─── Gemma 4 E4B (:8004) + bge-small-en (:8010)
```

**Parallelism rules (Gemma `--parallel 2` is enabled):**
- ✅ **Gemma agents can run 2 in parallel** — llama-server on :8004 handles 2 concurrent requests
- ✅ **Cross-model parallelism** — Qwen + Gemma simultaneously (different servers)
- ❌ **Qwen agents queue** — only 1 concurrent request at :8001, chain sequentially

### Parallelism Optimization
- ✅ Gemma `--parallel 2` is **enabled** — 2 Gemma agents can truly run in parallel
- Qwen agents should be **chained sequentially**, never spawned in parallel
- Max useful parallel group: **2 Gemma + 1 Qwen** (3 agents truly concurrent)

## Available Subagents

### Gemma Agents (Fast Sensing — GPU2)
| Agent | Role | Use When |
|-------|------|----------|
| `gemma-scout` | Quick repo exploration, first impressions | Need a fast overview of code, files, or structure |
| `gemma-bug-sniffer` | Bug detection, brittle logic spotting | Pre-review code before deeper analysis |
| `gemma-context-weaver` | Summarize scattered context, logs, history | Compress discussion/file content into a brief |
| `gemma-ux-voice` | Tone, clarity, human-facing text review | Polish UI copy, error messages, conversation text |
| `gemma-media-inspector` | Screenshot, image, audio inspection | Any multimodal input needs analysis |

### Qwen Agents (Deep Reasoning — GPU0+GPU1)
| Agent | Role | Use When |
|-------|------|----------|
| `qwen-architect` | System design, tradeoffs, routing | Non-trivial architecture decisions |
| `qwen-implementer` | Code implementation, multi-step fixes | Writing or modifying code |
| `qwen-test-runner` | Test execution, smoke checks, probes | Validating code works |
| `qwen-verifier` | Code review, risk assessment, validation | Independent audit of changes |
| `qwen-doc-writer` | Technical documentation, handoff notes | Creating durable documentation |

## Parallel Patterns

Chain: **Gemma senses in parallel → Qwen reasons sequentially → Gemma reviews in parallel**

```
Pattern: New Feature
  gemma-scout           → explore existing codebase
  qwen-architect        → design solution (after scout returns)
  qwen-implementer      → write code (after architect returns)
  qwen-test-runner      → run tests
  qwen-verifier         → review changes
  gemma-ux-voice        → review user-facing text
  (test-runner, verifier, ux-voice can all run in parallel)

Pattern: Bug Hunt
  gemma-bug-sniffer     → fast-pass for obvious issues
  gemma-scout           → explore related code
  qwen-verifier         → deep review (after gemma agents return)

Pattern: Code Review
  gemma-bug-sniffer     → spot bugs
  gemma-ux-voice        → check user-facing text
  qwen-verifier         → deep correctness review
  (all three in parallel)
```

## Benchmarking Methodology

### Every task run should record:
1. **Which agents** were used and in what order (parallel vs sequential)
2. **Wall-clock latency** per agent and total
3. **Quality outcome** — did the output solve the task?
4. **GPU utilization** during execution

### Logs go to `benchmarks/`
- Raw data: `benchmarks/run-YYYYMMDD-HHMMSS.json`
- Summary log: `benchmarks/RESULTS.md` (append-only comparison table)

### How to benchmark a task:
1. Before starting, note the task description and which agents you plan to use
2. Launch all independent agents in parallel (single message, multiple `agent` tool calls)
3. Record wall-clock time from launch to all agents returning
4. After all agents complete, write a benchmark entry to `benchmarks/run-*.json`
5. Update `benchmarks/RESULTS.md` with the result row

See `benchmarks/TEMPLATE.json` for the JSON schema and `benchmarks/README.md` for full methodology.

## Proxy-vs-Subagents Research

An initial architectural analysis has been completed. Key findings:

- **Pure proxy routing** loses the value of role-specific prompts and tool permission boundaries — not recommended as a replacement
- **Hybrid approach** (proxy enhances subagents, doesn't replace them) is the optimal long-term path
- **Phase 1 done:** Gemma `--parallel 2` is enabled, Qwen agents should be chained sequentially

See `docs/proxy-vs-subagents.md` for the full analysis.

## Experimentation Guidelines

- This space is disposable — no production code expected
- Always use parallel subagents when tasks are independent
- Always benchmark runs so we can compare agent strategies over time
- When creating new subagent roles, use the evaluation template in `benchmarks/AGENT_EVALUATION_TEMPLATE.md`
- The goal is finding the absolute best ways to utilize both models and all 3 GPUs simultaneously
