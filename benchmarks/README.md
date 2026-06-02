# Benchmark Methodology

## Philosophy

Every task in this workspace is a data point. We're building an empirical understanding of how Qwen 3.6 27B and Gemma 4 E4B collaborate across 3 GPUs when orchestrated as parallel subagents.

## How to Run a Benchmark

### Step 1 — Capture GPU baseline

Before launching agents, get a snapshot:

```bash
nvidia-smi --query-gpu=index,utilization.gpu,memory.used,power.draw --format=csv,noheader
```

Record the output in your benchmark JSON under `gpu.*`.

### Step 2 — Launch agents in parallel

Launch all independent agents in a **single message** with multiple `agent` tool calls. Do NOT wait for one agent to finish before launching the next (unless there's a data dependency).

```
Good:  Launch gemma-scout + gemma-bug-sniffer + qwen-architect in one message
Bad:   Launch gemma-scout, wait, then launch gemma-bug-sniffer, wait, then qwen-architect
```

Exception: Chain sequentially when Agent B needs Agent A's output (e.g., architect designs → implementer codes).

### Step 3 — Record wall-clock timing

Note the time before launching and after the last agent returns. Per-agent timing can be estimated from the agent tool's return.

### Step 4 — Capture GPU end state

```bash
nvidia-smi --query-gpu=index,utilization.gpu,memory.used,power.draw --format=csv,noheader
```

### Step 5 — Write the benchmark entry

Copy `TEMPLATE.json`, fill in the fields, save as `benchmarks/run-YYYYMMDD-HHMMSS.json`.

### Step 6 — Update RESULTS.md

Add a row to the summary table in `RESULTS.md`.

## Quick Benchmark (TL;DR version)

For fast iteration, a minimal benchmark entry needs:

```json
{
  "run_id": "run-20260602-143000",
  "task": {
    "description": "Build GPU monitor dashboard",
    "category": "implementation"
  },
  "configuration": {
    "agents_used": ["qwen-implementer", "qwen-architect", "gemma-bug-sniffer"],
    "parallel_groups": [{"group": 1, "agents": ["qwen-implementer", "gemma-bug-sniffer"]}]
  },
  "timing": {
    "total_wall_clock_ms": 45000
  },
  "quality": {
    "correctness": 5,
    "notes": "All agents contributed, found 3 critical bugs"
  }
}
```

## Quality Scoring

| Score | Meaning |
|-------|---------|
| 5 | Perfect — solved the task completely, no regressions |
| 4 | Excellent — solved with minor issues that were easy to fix |
| 3 | Good — solved but required significant follow-up |
| 2 | Partial — solved part of the task or introduced bugs |
| 1 | Failed — output was unusable or incorrect |

Rate on these dimensions:
- **Correctness** — does the output actually work?
- **Completeness** — did it cover all aspects of the task?
- **Efficiency** — was it done with minimal wasted tokens/time?
- **Safety** — did any agent make unauthorized or risky changes?

## Comparison Protocol

When re-running a task with a different agent configuration:

1. Reference the original `run_id` in the `comparison` field
2. Calculate deltas: `delta_latency = new - old` (negative = faster)
3. Note the winner and why
4. Look for patterns across multiple comparisons before changing agent configs

## Metrics That Matter (Ranked)

1. **Task correctness** — meaningless if quality drops
2. **Wall-clock latency** — total time from task start to usable output
3. **Token efficiency** — fewer tokens = faster inference on local models
4. **GPU utilization** — reveals idle time and serialization bottlenecks
5. **Agent count** — fewer agents for the same result = better
6. **Error rate** — timeouts, tool failures, hallucinations
