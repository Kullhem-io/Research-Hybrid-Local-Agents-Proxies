# Proxy Routing vs Subagent Spawning: Analysis & Recommendation

> **Date:** 2026-06-02  
> **Scope:** Qwen 3.6 27B (RTX 3090 + 3060 tensor-split) + Gemma 4 E4B (RTX 3060)  
> **Status:** Analysis complete — Hybrid approach recommended

---

## Executive Summary

The current benchmark uses 10 role-specialized subagents (5 Gemma, 5 Qwen) spawned as separate processes to collaborate on tasks. This document evaluates whether a proxy-based routing layer would improve upon, replace, or complement the existing subagent model.

**Conclusion:** A hybrid approach — keeping subagent spawning for role isolation while adding a lightweight proxy between subagents and their llama-server backends — delivers the strongest outcome. The proxy handles model selection, request deduplication, caching, and telemetry. The subagent layer preserves role semantics, tool permission boundaries, and debuggability.

**Immediate action:** Set Gemma `--parallel 2` and chain Qwen agents sequentially. These zero-cost changes eliminate the illusion of parallelism that currently wastes spawn overhead.

---

## 1. Runtime Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        Qwen Code (host)                        │
│                  Spawns subagent processes                      │
└────────┬──────────┬──────────┬──────────┬───────────────────────┘
         │          │          │          │
         ▼          ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │   (up to 10)
    │  1     │ │  2     │ │  3     │ │  N     │
    └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
        │          │          │          │
        ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Llama.cpp Servers                           │
│                                                                 │
│  GPU 0 (RTX 3090)        GPU 1 (RTX 3060)      GPU 2 (RTX 3060)│
│  ┌──────────────┐        ┌──────────────┐      ┌────────────┐  │
│  │ Qwen 27B     │───────▶│ Qwen shard   │      │ Gemma 4    │  │
│  │ :8001        │ (5:1)  │ (1/5 layers) │      │ E4B :8004  │  │
│  │ ~98% VRAM    │        │ ~82% VRAM    │      │ ~43% VRAM  │  │
│  └──────────────┘        └──────────────┘      │ ~6GB free  │  │
│                                                 │ bge-small  │  │
│                                                 │ :8010      │  │
│                                                 └────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Constraint

**llama-server serializes requests per instance.** Two Qwen subagents spawned "in parallel" do not execute concurrently — the second queues behind the first at `:8001`. The same applies to Gemma at `:8004` (unless `--parallel 2` is set).

**True parallelism exists only across models:** one Qwen request and one Gemma request can run simultaneously because they hit different servers on different GPUs.

---

## 2. Current Subagent Model (Approach A)

### Architecture

```
Qwen Code
    │
    ├── gemma-scout          → :8004  (read-only, pattern recognition)
    ├── gemma-bug-sniffer    → :8004  (read-only, defect detection)
    ├── gemma-context-weaver → :8004  (read-only, synthesis)
    ├── gemma-ux-voice       → :8004  (read-only, UX review)
    ├── gemma-media-inspector→ :8004  (read-only, asset audit)
    │
    ├── qwen-architect       → :8001  (design, planning)
    ├── qwen-implementer     → :8001  (code generation)
    ├── qwen-test-runner     → :8001  (test execution)
    ├── qwen-verifier        → :8001  (quality assurance)
    └── qwen-doc-writer      → :8001  (documentation)
```

Each agent carries:
- Role-specific system prompt
- Scoped tool permissions (some read-only, some mutation-capable)
- Hardcoded model binding (Gemma agents → `:8004`, Qwen agents → `:8001`)

### Pros

| Advantage | Detail |
|---|---|
| **Explicit role isolation** | Each agent has a dedicated persona and scope, reducing hallucination drift |
| **Semantic prompt scoping** | System prompts are tuned per-role; Gemma agents get tight, directive prompts that play to their strengths |
| **Per-agent tool sandboxing** | Read-only agents literally cannot call mutation tools — enforced at process boundary |
| **Debuggable** | Each agent's input/output is independently inspectable |
| **Zero infrastructure** | No proxy service, no new deployment surface, no additional failure mode |

### Cons

| Limitation | Impact |
|---|---|
| **Qwen-to-Qwen is sequential** | Spawning `qwen-architect` + `qwen-implementer` simultaneously is an illusion — second agent queues at `:8001` |
| **Manual task decomposition** | Host must manually split work into agent-sized chunks and sequence dependencies |
| **Subprocess spawn latency** | Each agent costs 2–5 seconds of cold-start overhead (process creation, connection handshake, first token) |
| **Context duplication** | Shared project context is re-sent to every agent independently |
| **No cross-agent state sharing** | Agent A's findings are not automatically available to Agent B without explicit pass-through from the host |
| **Model locked per agent** | A Gemma agent cannot escalate a hard request to Qwen mid-conversation |

---

## 3. Proxy-Based Routing (Approach B)

### Architecture

```
Qwen Code
    │
    ▼
┌─────────────────────────────────┐
│         Request Proxy           │
│                                 │
│  ┌───────────────────────────┐  │
│  │   Classifier              │  │
│  │  (rule / embedding / LLM) │  │
│  └───────────┬───────────────┘  │
│              │                  │
│    ┌─────────┴─────────┐       │
│    ▼                   ▼       │
│  :8001 (Qwen)      :8004 (Gemma)│
└─────────────────────────────────┘
```

The proxy sits between Qwen Code and all llama-server instances. Every request passes through the classifier, which decides which backend handles it.

### Classifier Options

| Method | Latency Overhead | Accuracy | Dependencies |
|---|---|---|---|
| **Rule-based** (keyword/regex) | < 1 ms | ~80% | None |
| **Embedding-based** (bge-small-en cosine similarity) | ~50 ms | ~90% | Existing `:8010` on GPU 2 |
| **Tiny LLM** (e.g., Phi-3 mini, Gemma 2B) | ~200 ms | ~95% | Additional model load |

### Pros

| Advantage | Detail |
|---|---|
| **Transparent routing** | Qwen Code sends requests to a single endpoint; proxy handles destination |
| **Per-request granularity** | Each turn can hit a different model — no agent-level lock-in |
| **Load balancing** | Proxy can distribute Gemma requests across multiple `--parallel` slots or future instances |
| **Observability** | Central telemetry: routing decisions, latencies, token counts, fallback events |
| **Fallback / escalation** | If Gemma returns low-confidence output, proxy can retry on Qwen automatically |
| **Warm instances** | No subprocess spawn per request — connections are persistent |

### Cons

| Limitation | Impact |
|---|---|
| **LOSES role-specific prompts** | Without subagents, every request shares the same system prompt — no persona scoping |
| **LOSES tool permission boundaries** | Process-level sandboxing disappears — proxy cannot enforce "this request is read-only" |
| **New operational surface** | Proxy is a new service: it can crash, misroute, or become a bottleneck |
| **Classifier can be wrong** | Even 95% accuracy means 1 in 20 requests hit the wrong model |
| **Qwen still serializes** | Proxy does not solve llama-server's single-request-per-instance limit |

---

## 4. Hybrid Approach (Approach C) — Recommended

### Architecture

```
Qwen Code (retains role, permissions, tool sandboxing per subagent)
    │
    ├── gemma-scout         ──┐
    ├── gemma-bug-sniffer    ──┤
    ├── gemma-context-weaver ──┤
    ├── qwen-architect       ──┤
    ├── qwen-implementer     ──┤
    └── ...                   ──┤
                                │
                                ▼
                    ┌─────────────────────────┐
                    │   Lightweight Proxy     │
                    │   (deployed on GPU 2)    │
                    │                          │
                    │  • Request deduplication │
                    │  • Per-request routing   │
                    │  • Token budget tracking │
                    │  • Routing telemetry     │
                    │  • Auto-escalation       │
                    │  • Response caching      │
                    │                          │
                    │  DOES NOT:               │
                    │  • Replace sys prompts   │
                    │  • Enforce tool perms    │
                    │  • Decide task scope     │
                    └───────┬─────────┬───────┘
                            │         │
                            ▼         ▼
                        :8001 (Qwen)  :8004 (Gemma)
```

### How It Works

1. **Qwen Code spawns subagents as before** — each with its own role-specific system prompt and tool permissions.
2. **Subagent requests route through the proxy** instead of hitting llama-server directly. The proxy's `settings.json` entries point to the proxy URL rather than the backend servers.
3. **Proxy adds intelligence on top:**
   - Deduplicates identical or near-identical requests (e.g., two agents asking the same file-read question)
   - Tracks per-agent token budgets and warns when an agent is consuming disproportionate compute
   - Logs routing decisions, latencies, and token counts for post-hoc analysis
   - Auto-escalates: if a Gemma-bound subagent's request contains patterns matching "implementation" or "architect," proxy can route to Qwen with a warning
   - Caches responses for idempotent read-only requests
4. **Qwen Code retains full control** over role semantics, tool permissions, and task decomposition. The proxy is transparent to the host's orchestration logic.

### Pros

| Advantage | Detail |
|---|---|
| **Best of both worlds** | Role isolation from subagents + routing intelligence from proxy |
| **Tool safety preserved** | Subagent process boundaries still enforce permission scoping |
| **Reduced wasted requests** | Deduplication eliminates redundant context re-sends |
| **Data-driven optimization** | Proxy telemetry reveals which agents dominate token usage, which routes underperform |
| **Contained risk** | Proxy is additive — if it fails, subagents can fall back to direct llama-server connections |
| **Dynamic model routing within agent** | A Gemma-bound agent can have specific turns escalated to Qwen without changing its config |

### Cons

| Limitation | Mitigation |
|---|---|
| New service to operate | Deploy proxy on GPU 2 alongside Gemma; simple Node.js or Python process |
| Classifier still applies to routing | Subagent system prompts still constrain behavior; classifier only affects model choice, not role |
| Additional latency | Deduplication cache hit is <1 ms; cache miss + routing is ~50 ms with embedding classifier |

---

## 5. GPU Parallelism Reality Check

### The Illusion

```
Time →

t=0s    Spawn qwen-architect ──────────▶ :8001 (GPU 0)
t=0s    Spawn qwen-implementer ───▶ [QUEUED at :8001]
t=5s    architect finishes
t=5s    implementer begins ───────────▶ :8001 (GPU 0)
t=12s   implementer finishes

Total wall time: ~12s (sequential, despite parallel spawn)
```

### The Reality

```
Time →

t=0s    gemma-scout ──────▶ :8004 (GPU 2)
t=0s    qwen-architect ──▶ :8001 (GPU 0)     ← TRUE parallelism
t=4s    gemma-scout finishes
t=4s    gemma-bug-sniffer ▶ :8004 (GPU 2)
t=7s    qwen-architect finishes
t=7s    qwen-implementer ▶  :8001 (GPU 0)     ← sequential chain (correct)
t=9s    gemma-bug-sniffer finishes
t=12s   qwen-implementer finishes

Total wall time: ~12s (but Gemma did useful work during Qwen's execution)
```

### Actionable Recommendations

| Change | Why | Effort |
|---|---|---|
| **Set Gemma `--parallel 2`** | GPU 2 has ~6 GB free VRAM — enough for a second concurrent Gemma session. Enables true parallelism for Gemma agents. | 1-line config change |
| **Chain Qwen agents sequentially** | Accepts that `:8001` is single-slot. Eliminates wasted spawn overhead for agents that would queue anyway. | Orchestration logic change |
| **Consolidate overlapping Gemma agents** | `gemma-context-weaver` and `gemma-scout` have overlapping read-synthesis roles. Merge into one agent that handles both. | Prompt consolidation |

---

## 6. Capability Gap: Qwen 27B vs Gemma 4B

### Where Gemma Excels

With strong, directive system prompts, Gemma 4B performs well at:

- **Pattern recognition** — bug sniffing, detecting anti-patterns in code
- **Structured review** — UX review with a fixed checklist, media asset auditing
- **Scouting** — summarizing file structure, identifying relevant files for a task

These tasks benefit from Gemma's lower latency and lower VRAM footprint. The prompt acts as a strong constraint that keeps the smaller model in its comfort zone.

### Where the Gap Widens

- **Open-ended generation** — implementation, architecture design, free-form code creation
- **Tool use** — Gemma's function calling is unreliable; it frequently drops required parameters or misformats tool calls
- **Multi-step reasoning** — chains longer than 2–3 hops tend to drift

### Current Assignment Alignment

The existing model assignment is well-aligned with these capabilities:

| Model | Assigned Work | Fit |
|---|---|---|
| **Gemma 4B** | Read-only review, pattern detection, scouting | ✅ Strong — tight prompts + constrained scope |
| **Qwen 27B** | Code mutation, architecture, testing, documentation | ✅ Strong — larger context window + reliable tool use |

---

## 7. Tradeoff Matrix

| Dimension | Subagent Only (A) | Proxy Only (B) | Hybrid (C) |
|---|---|---|---|
| **Role specialization** | Excellent | Poor | Excellent |
| **Tool permissions** | Hard-enforced (process boundary) | Lost | Preserved |
| **True parallelism** | Cross-model only | Same | Same + Gemma load balancing |
| **Spawn overhead** | 2–5 s per agent | Zero | Reduced (fewer wasted requests) |
| **Per-request model routing** | Locked per agent | Dynamic | Dynamic within agent |
| **Operational complexity** | Zero | New service | New service, contained risk |
| **Context efficiency** | Poor (duplicates) | Better (proxy cache) | Better (deduplication) |
| **Debuggability** | Excellent (per-agent logs) | Moderate (proxy logs) | Excellent (both layers) |
| **Escalation path** | Manual (host must re-route) | Automatic | Automatic + manual |
| **Deploy effort** | Done | Medium | Low–Medium |

---

## 8. Recommended Implementation Path

### Phase 1: Optimize Current System (Immediate, Zero Cost)

**Goal:** Eliminate wasted parallel spawns without adding infrastructure.

1. Set Gemma server to `--parallel 2` — enables true concurrent Gemma requests
2. Update orchestration to chain Qwen agents sequentially (spawn next only after previous completes)
3. Consolidate `gemma-context-weaver` into `gemma-scout` — overlapping scope, single slot wasted
4. Document the actual parallelism topology so future contributors don't re-discover the serialization constraint

**Expected impact:** 15–25% reduction in total wall time by eliminating queued-but-spawned Qwen agents and enabling parallel Gemma execution.

**Verification:** Run existing benchmark suite; compare wall time before/after. Confirm Gemma `:8004` handles 2 concurrent requests without OOM.

### Phase 2: Add Lightweight Proxy (Medium Effort)

**Goal:** Insert routing intelligence between subagents and llama-servers.

1. Deploy proxy service on GPU 2 (same machine as Gemma, ~6 GB free)
2. Update subagent `settings.json` entries to point through proxy URL instead of direct llama-server URLs
3. Implement:
   - **Deduplication** — hash request body + system prompt; cache responses for idempotent reads (TTL: 60 s)
   - **Telemetry** — log route decision, backend, latency, token count per request
   - **Auto-escalation** — keyword-based fallback from Gemma → Qwen for requests containing implementation/architecture keywords
   - **Token budget tracking** — per-agent rolling window; alert when single agent exceeds 40% of total tokens
4. Start with rule-based classifier (zero dependency, <1 ms overhead)

**Expected impact:** 10–20% reduction in total token consumption via deduplication; visibility into routing hotspots.

**Verification:** Proxy access logs show deduplication hits. No subagent behavior regression compared to Phase 1 baseline.

### Phase 3: Data-Driven Optimization (Post-Telemetry)

**Goal:** Use proxy telemetry to make evidence-based improvements.

1. Analyze routing logs to identify:
   - Which subagents generate the most redundant requests
   - Which requests frequently trigger escalation
   - Latency distribution per backend
2. Upgrade classifier from rule-based to embedding-based (bge-small-en at `:8010` is already running on GPU 2)
3. Consider deploying a second Gemma instance on GPU 2 if telemetry shows Gemma requests are the bottleneck
4. Refine subagent roles based on actual token usage patterns — consolidate or split based on data, not intuition

**Expected impact:** Continued optimization based on real usage data rather than assumptions.

---

## 9. Cautions & Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Proxy becomes single point of failure | Medium | Subagents can fall back to direct llama-server URLs if proxy is unreachable |
| Classifier misroutes a request | Low–Medium | Subagent system prompt still constrains output; worst case is slower response from Qwen instead of Gemma |
| Proxy adds latency | Low | Rule-based: <1 ms; embedding-based: ~50 ms; both acceptable relative to LLM inference time (seconds) |
| GPU 2 VRAM pressure with proxy + 2 Gemma | Low | Proxy is lightweight (Node.js/Python, <500 MB RAM, no GPU needed); Gemma `--parallel 2` fits in available ~6 GB |
| Team assumes proxy solves serialization | Medium | Document clearly: proxy does not add parallelism to a single llama-server instance |

---

## 10. Missing Information

The following items should be filled in as implementation progresses:

- [ ] **Exact VRAM usage with Gemma `--parallel 2`** — needs measurement to confirm second concurrent session fits
- [ ] **Proxy technology choice** — Node.js (matching `gpu-monitor/`) vs Python vs Rust; decision pending Phase 2 kickoff
- [ ] **Deduplication hash strategy** — should we hash the full request body, or a normalized version that ignores temperature, turn number, etc.?
- [ ] **Escalation threshold tuning** — what keyword patterns or confidence scores should trigger Gemma → Qwen escalation?
- [ ] **Benchmark baseline numbers** — current wall time and token count for the full 10-agent benchmark run, to measure Phase 1/2 improvement against
- [ ] **Whether `gemma-context-weaver` and `gemma-scout` truly overlap** — review their system prompts to confirm consolidation is valid before Phase 1

---

*Document generated from benchmark analysis. Last updated 2026-06-02.*
