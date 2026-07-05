# MoA Plugin for OpenCode — 设计规格

## 概述

为 OpenCode 实现 Mixture of Agents (MoA) 能力：多个 LLM 并行提议 + 聚合者综合，获得超越单模型的质量。

采用**两阶段策略**：Phase A 以纯插件快速验证，Phase B 以 PR 形式深度集成到 OpenCode 的 provider 层。

## 架构

```
OpenCode Server ←→ MoA Plugin (Phase A)
                      ↓
              并行创建子 session
              ├─ Proposer A (模型 A)
              ├─ Proposer B (模型 B)
              └─ Aggregator (模型 C) → 注入结果

Phase B 升级路径：
  Provider Layer → moa Provider → Proposer A + B + Aggregator (streaming)
```

## Phase A: Plugin（当前实现目标）

### 目录结构

```
~/.config/opencode/plugins/moa/
├── package.json
├── plugin.ts          # 主入口，注册钩子
├── orchestrator.ts    # MoA 编排核心
├── config.ts          # moa.json 读取
├── cache.ts           # 响应缓存
└── types.ts
```

### 触发机制

- Hook: `message.part.updated` — 检测到新用户文本消息时触发
- 跳过条件：系统消息、工具结果、空消息
- 防重复：同一 prompt 在 30s 内不重复触发

### MoA 流程

1. 用户发送消息
2. 插件计算 prompt hash，查缓存
3. 缓存命中 → 直接注入缓存结果，跳过推理
4. 缓存未命中 → 并行创建 2 个子 session
5. 两个子 session 分别用不同的 proposer 模型生成回答
6. 收集结果后，创建第 3 个子 session 用 aggregator 模型综合
7. 聚合结果注入主线上下文 + 写入缓存

### 错误处理

| 场景 | 行为 |
|------|------|
| 提议者 A 超时 (120s) | 仅用 B 的结果 |
| 两个提议者均失败 | 回退至单模型，通知用户 |
| 聚合失败 | 返回质量最佳的提议 |
| 网络抖动 | 自动重试 1 次 (间隔 2s) |

### 配置 (`~/.config/opencode/moa.json`)

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
      "aggregatorPrompt": "你是一个聚合者。以下是对同一问题的两个回答，请综合它们的优点，输出一个最佳答案。说明你采纳了哪些建议。",
      "strategy": "parallel"
    }
  }
}
```

### 安装与分发

- 以 npm 包 `opencode-moa` 发布
- 用户安装：`npm install -g opencode-moa` 或声明在 `opencode.json` 的 `"plugin"` 数组
- OpenCode 启动时用 Bun 自动安装到 `~/.cache/opencode/node_modules/`
- 也可本地安装：复制文件到 `~/.config/opencode/plugins/moa/`

### 首次安装引导

首次加载时自动完成零配置上手：

1. 检测 `~/.config/opencode/moa.json` 是否存在
2. 不存在 → 通过 SDK 的 `client.config.providers()` 扫描用户已配置的 provider
3. 从可用模型中自动选取 2 个作为默认提议者，1 个作为聚合者
   - 选优规则：优先选不同 provider 的模型 → 性能最高的做提议者 → 余下最强的做聚合者
   - 多过 3 个模型时用 `modelIDs` 列表中的顺序作为能力高低参考
   - 不足 2 个模型时跳过自动生成，提示用户手动配置
4. 自动生成 `moa.json`，带 `_auto_generated: true` 标记
5. 控制台提示：

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

## Phase B: Provider 深度集成（后续 PR）

- 在 `packages/core/src/provider/` 新增 `moa.ts`
- 注册为 `moa` provider，支持 `/model moa/<preset>`
- 提议者阶段不流式，聚合者阶段流式输出
- 利用 OpenCode 原生 provider 调用链路，避免 SDK session 开销

## 缓存策略

- Key: `sha256(prompt_text + model_id)`
- Value: 聚合后的完整回答文本
- TTL: 5 分钟
- 存储: 内存 Map（Phase A），可升级为 SQLite

## 测试策略

- 单元测试：orchestrator 核心逻辑、缓存、配置解析
- 集成测试：mock provider，验证并行调用 + 聚合流程
- 回退测试：模拟各节点故障，验证降级行为

## 未涵盖的范围（明确排除）

- Phase B 的流式支持（Phase A 仅支持聚合后输出）
- 串行聚合模式（仅并行）
- 3+ 提议者（初始仅 2 个）
- OpenChamber 端 UI（插件层透明，自动继承）
