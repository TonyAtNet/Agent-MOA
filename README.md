# opencode-moa

[![中文文档](https://img.shields.io/badge/文档-简体中文-red)](./README.zh.md)

Mixture of Agents plugin for OpenCode — parallel multi-model inference with intelligent aggregation. Zero config, install and go. Better answers through model diversity.

## What is MoA?

Mixture of Agents (MoA) improves LLM output quality by running **multiple models in parallel** and having an **aggregator model** synthesize the best answer from all proposals.

```
User Query
    │
    ├─▶ Proposer A (Model 1) ──▶ Response A
    ├─▶ Proposer B (Model 2) ──▶ Response B
    │
    ▼
Aggregator (Model 3)
    │
    ▼
Final Answer
```

Instead of trusting a single model, MoA cross-validates answers from different models, eliminating hallucinations and producing more comprehensive results.

## Features

- **Zero config** — auto-detects your configured providers and generates sensible defaults
- **Parallel proposers** — 2 models propose answers simultaneously
- **Intelligent aggregation** — a stronger model synthesizes the best combined answer
- **Transparent** — hooks into OpenCode's message pipeline, no manual invocation needed
- **Built-in caching** — avoids redundant LLM calls for identical prompts within 5 minutes
- **Graceful degradation** — proposer timeout? Falls back to the available one. Both down? Tells you why.

## Install

### Option 1: npm (recommended)

```bash
npm install -g opencode-moa
```

### Option 2: opencode.json

```json
{
  "plugin": ["opencode-moa"]
}
```

OpenCode auto-installs plugins declared here via Bun on startup.

### Option 3: manual

Copy files into `~/.config/opencode/plugins/moa/`.

## Quickstart

1. Install the plugin
2. Restart OpenCode — the plugin loads automatically and generates `~/.config/opencode/moa.json`
3. Start coding — every message now gets MoA-enhanced responses

You'll see this banner on first load:

```
╭──────────────────────────────────────────╮
│ 🦸 MoA Plugin loaded                     │
│                                          │
│ Auto-detected your models and generated:  │
│   ~/.config/opencode/moa.json            │
│                                          │
│ Current preset: auto                     │
│   Proposer 1: opencode/gpt-5.1-codex     │
│   Proposer 2: anthropic/claude-sonnet-4  │
│   Aggregator: anthropic/claude-opus-4    │
│                                          │
│ Edit moa.json to customize               │
╰──────────────────────────────────────────╯
```

## Configuration

Edit `~/.config/opencode/moa.json`:

```json
{
  "enabled": true,
  "defaultPreset": "auto",
  "presets": {
    "auto": {
      "proposers": [
        "opencode/gpt-5.1-codex",
        "anthropic/claude-sonnet-4"
      ],
      "aggregator": "anthropic/claude-opus-4",
      "aggregatorPrompt": "You are an aggregator. Synthesize the best answer from the following proposals.",
      "strategy": "parallel"
    },
    "deep-think": {
      "proposers": [
        "anthropic/claude-opus-4",
        "deepseek/deepseek-v4"
      ],
      "aggregator": "openai/gpt-5",
      "strategy": "parallel"
    }
  }
}
```

- `proposers` — exactly 2 model IDs that generate proposals in parallel
- `aggregator` — the model that combines proposals into the final answer
- `aggregatorPrompt` — custom prompt for the aggregator (optional)
- `strategy` — currently only `"parallel"` supported

Model IDs follow the `provider/model-id` format. Run `opencode models` to see available models.

## Roadmap

- [x] Phase A: Plugin (current)
- [ ] Phase B: Native OpenCode provider (`/model moa/<preset>`)
- [ ] Streaming output during aggregation
- [ ] 3+ proposers support

## License

MIT
