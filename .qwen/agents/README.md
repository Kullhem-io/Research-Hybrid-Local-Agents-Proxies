# Qwen Code Subagent Experiment

This workspace defines project-level Qwen Code subagents for testing local
Gemma + Qwen collaboration.

## Agents

- `gemma-scout`
  Fast read-only Gemma 4 E4B scout for summaries, first impressions,
  multimodal observations, and lightweight review.
- `gemma-bug-sniffer`
  Fast read-only Gemma reviewer for obvious bugs, brittle assumptions, and
  suspicious behavior.
- `gemma-context-weaver`
  Fast read-only Gemma context synthesizer for logs, docs, and scattered
  history.
- `gemma-ux-voice`
  Fast read-only Gemma reviewer for conversational tone, UI text, Discord
  behavior, and personality drift.
- `gemma-media-inspector`
  Gemma multimodal inspector for screenshots, images, audio notes, and compact
  observations.
- `qwen-architect`
  Qwen 3.6 MTP architecture agent for routing, memory, services, and non-trivial
  system tradeoffs.
- `qwen-implementer`
  Qwen 3.6 MTP implementation agent for code and configuration changes.
- `qwen-test-runner`
  Qwen 3.6 MTP validation agent for tests, service probes, and smoke checks.
- `qwen-verifier`
  Qwen 3.6 MTP read-only verifier for review and validation.
- `qwen-doc-writer`
  Qwen 3.6 MTP documentation and handoff writer.

## Recommended Parallel Shape

Use Gemma for fast sensing and Qwen for execution:

```text
gemma-context-weaver -> compress scattered context into a brief
gemma-bug-sniffer    -> catch obvious problems quickly
gemma-ux-voice       -> check user-facing tone and behavior
qwen-architect       -> design the durable solution
qwen-implementer     -> implement, preferably isolated in a worktree
qwen-test-runner     -> run targeted validation
qwen-verifier        -> independent final review
```

When multiple agents may edit files, launch mutating agents with Qwen Code's
`isolation: "worktree"` option. Keep Gemma read-only until it proves reliable
for this workflow.

## Useful Parallel Patterns

Architecture question:

```text
gemma-context-weaver + qwen-architect
```

Bug hunt:

```text
gemma-bug-sniffer + qwen-verifier
```

Implementation:

```text
gemma-scout + qwen-architect + qwen-implementer
```

Post-change validation:

```text
qwen-test-runner + qwen-verifier + gemma-ux-voice
```

Screenshot or media issue:

```text
gemma-media-inspector + qwen-architect
```

## Model Mapping

- Qwen: `openai:unsloth/Qwen3.6-27B-MTP-GGUF:UD-Q6_K_XL`
- Gemma: `openai:unsloth/gemma-4-E4B-it-GGUF:UD-Q4_K_XL`

Qwen Code resolves these through `~/.qwen/settings.json` model providers.
