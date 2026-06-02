# New Subagent Evaluation Template

Use this template when considering creating a new subagent role or modifying an existing one. The goal is to prevent subagent proliferation and ensure each agent earns its place.

## Agent Proposal

```
Name:           gemma-<role> or qwen-<role>
Model:          Gemma 4 E4B / Qwen 3.6 27B
GPU Target:     GPU2 (3060) / GPU0+GPU1 (3090+3060)
Read-only:      yes / no
Category:       sensing / reasoning / execution / review / multimodal
Replaces:       (existing agent this would replace, or "none")
Supplements:    (existing agents this would work alongside)
```

## Justification

**What capability gap does this fill?**
<!-- Describe the specific tasks this agent handles that no existing agent covers well -->

**Why can't an existing agent do this with a modified prompt?**
<!-- If it's just a prompt change, modify the existing agent instead of creating a new one -->

## Proposed System Prompt

<!-- Draft the agent's system prompt / role definition -->

## Evaluation Criteria

Run these tasks with and without the new agent. The agent earns its place if:

| Criterion | Threshold |
|-----------|-----------|
| Quality improvement | > 10% better output on target tasks |
| Latency impact | < 20% slower on tasks where it's added |
| Unique value | Handles at least 2 tasks better than any existing agent |
| No overlap | Doesn't produce the same output as an existing agent |

## Benchmark Plan

### Tasks to test WITH the new agent:
1. 
2. 
3. 

### Tasks to test WITHOUT the new agent (control):
1. (same tasks, different agent config)
2. 
3. 

### Metrics to compare:
- [ ] Correctness score
- [ ] Wall-clock latency
- [ ] Token count (input + output)
- [ ] GPU utilization during execution
- [ ] Quality of output (manual 1-5 score)

## Decision

```
Result:     APPROVED / REJECTED / MODIFIED
Date:       
Run IDs:    (benchmark runs that informed this decision)
Decision:   (why this agent was approved or rejected)
```
