# opencode-moa

[![English Documentation](https://img.shields.io/badge/Docs-English-blue)](./README.md)

OpenCode 的 Mixture of Agents 插件——并行调用多个 LLM 模型，由聚合模型综合输出最优答案。零配置，安装即用。通过模型多样性获得超越单模型的回答质量。

## 什么是 MoA？

Mixture of Agents (MoA) 通过**多个模型并行推理**，再让**聚合模型**综合所有提议，从而提升 LLM 输出质量。

```
用户提问
    │
    ├─▶ 提议者 A（模型 1）──▶ 回答 A
    ├─▶ 提议者 B（模型 2）──▶ 回答 B
    │
    ▼
聚合者（模型 3）
    │
    ▼
最终答案
```

不再依赖单一模型，MoA 让不同模型互相验证、去伪存真，输出更全面、更可靠的结果。

## 特性

- **零配置** — 自动检测已配置的 provider，生成合理的默认预设
- **并行提议** — 2 个模型同时独立生成回答
- **智能聚合** — 更强的模型综合所有提议，输出最佳答案
- **透明集成** — 注册为 OpenCode 的消息钩子，无需手动调用
- **内置缓存** — 相同 prompt 在 5 分钟内命中缓存，避免重复推理
- **优雅降级** — 提议者超时？退到可用的那个。两个都挂了？告诉你原因。

## 安装

### 方式一：npm（推荐）

```bash
npm install -g opencode-moa
```

### 方式二：opencode.json

```json
{
  "plugin": ["opencode-moa"]
}
```

OpenCode 启动时会用 Bun 自动安装 `"plugin"` 中声明的包。

### 方式三：手动安装

将文件复制到 `~/.config/opencode/plugins/moa/`。

## 快速开始

1. 安装插件
2. 重启 OpenCode——插件自动加载并生成 `~/.config/opencode/moa.json`
3. 开始编码——每条消息都会经过 MoA 增强处理

首次加载时会在控制台看到：

```
╭──────────────────────────────────────────╮
│ 🦸 MoA Plugin 已加载                      │
│                                          │
│ 已自动检测你的模型配置并生成预设：            │
│   ~/.config/opencode/moa.json            │
│                                          │
│ 当前预设: auto                            │
│   提议者 1: opencode/gpt-5.1-codex        │
│   提议者 2: anthropic/claude-sonnet-4     │
│   聚合者:   anthropic/claude-opus-4       │
│                                          │
│ 如需自定义，编辑 moa.json 即可             │
╰──────────────────────────────────────────╯
```

## 配置

编辑 `~/.config/opencode/moa.json`：

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
      "aggregatorPrompt": "你是一个聚合者。请综合以下回答的优缺点，输出一个最佳答案。",
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

- `proposers` — 2 个模型 ID，并行生成提议
- `aggregator` — 综合提议的聚合模型
- `aggregatorPrompt` — 自定义聚合提示词（可选）
- `strategy` — 目前仅支持 `"parallel"`

模型 ID 格式为 `provider/model-id`。运行 `opencode models` 查看可用模型列表。

## 路线图

- [x] Phase A：插件模式（当前）
- [ ] Phase B：原生 OpenCode provider（`/model moa/<preset>`）
- [ ] 聚合阶段流式输出
- [ ] 支持 3+ 提议者

## 许可证

MIT
