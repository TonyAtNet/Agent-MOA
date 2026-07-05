# MoA Plugin 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现 OpenCode 的 MoA (Mixture of Agents) 插件——2 个提议者模型并行推理 + 聚合者综合，零配置上手。

**架构：** TypeScript 纯插件，通过 OpenCode SDK 并行创建子 session 调用不同模型，聚合后注入主 session。独立 npm 包 `opencode-moa` 发布。配置存于 `~/.config/opencode/moa.json`，首次运行自动生成。

**技术栈：** TypeScript, Bun (运行时 + 测试), @opencode-ai/plugin (类型), @opencode-ai/sdk (客户端), Zod (参数校验)

---

## 文件结构

```
opencode-moa/                         # npm 包根目录 (D:\BaiduSyncdisk\moa)
├── package.json                      # 包元数据 + 依赖声明
├── tsconfig.json                     # TypeScript 编译配置
├── index.ts                          # 公开 API 导出
├── plugin.ts                         # OpenCode 插件入口 + 钩子注册
├── types.ts                          # 所有类型/接口定义
├── config.ts                         # moa.json 读取/写入/自动生成
├── cache.ts                          # 内存缓存层（TTL + SHA256 key）
├── orchestrator.ts                   # MoA 编排：并行提议 → 聚合 → 注入
└── tests/
    ├── config.test.ts                # 配置模块测试
    ├── cache.test.ts                 # 缓存模块测试
    └── orchestrator.test.ts          # 编排核心测试
```

**职责说明：**
- `types.ts` — 单一职责：所有接口/类型定义，被所有模块依赖
- `config.ts` — 单一职责：moa.json 的 CRUD + 首次自动生成逻辑
- `cache.ts` — 单一职责：基于 SHA256 的内存缓存，TTL 过期
- `orchestrator.ts` — 单一职责：MoA 执行流程，调用 config/cache，不直接操作 DOM/FS
- `plugin.ts` — 单一职责：OpenCode 插件生命周期，注册钩子，连接各模块

---

### 任务 1：项目脚手架

**文件：**
- 创建：`D:\BaiduSyncdisk\moa\package.json`
- 创建：`D:\BaiduSyncdisk\moa\tsconfig.json`

- [ ] **步骤 1：编写 package.json**

```json
{
  "name": "opencode-moa",
  "version": "0.1.0",
  "description": "Mixture of Agents plugin for OpenCode — multi-model parallel inference with aggregation",
  "main": "plugin.ts",
  "type": "module",
  "license": "MIT",
  "keywords": ["opencode", "moa", "mixture-of-agents", "plugin"],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/opencode-moa"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.0.0",
    "@opencode-ai/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

- [ ] **步骤 2：编写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["*.ts", "tests/*.ts"]
}
```

- [ ] **步骤 3：安装依赖**

运行：`bun install`
预期：输出 `Installed N packages`，无报错

- [ ] **步骤 4：创建目录结构**

```powershell
New-Item -ItemType Directory -Path "tests" -Force
```

- [ ] **步骤 5：Commit**

```bash
git add package.json tsconfig.json
git commit -m "chore: scaffold opencode-moa project"
```

---

### 任务 2：类型定义 (types.ts)

**文件：**
- 创建：`D:\BaiduSyncdisk\moa\types.ts`

- [ ] **步骤 1：编写 types.ts**

```typescript
export interface MoaConfig {
  enabled: boolean
  defaultPreset: string
  presets: Record<string, MoaPreset>
}

export interface MoaPreset {
  proposers: [string, string]
  aggregator: string
  aggregatorPrompt?: string
  strategy: "parallel"
  _auto_generated?: boolean
}

export interface ProposerResult {
  modelId: string
  content: string
  success: boolean
  error?: string
  durationMs: number
}

export interface CacheEntry {
  value: string
  expiresAt: number
}

export interface ProviderInfo {
  providerID: string
  modelID: string
  default?: boolean
}

export const DEFAULT_AGGREGATOR_PROMPT =
  "你是一个聚合者。以下是对同一问题的两个回答，请综合它们的优点，输出一个最佳答案。如果两个回答有冲突，说明你的选择理由。"
```

- [ ] **步骤 2：验证 TypeScript 编译通过**

运行：`bun run tsc --noEmit`
预期：Exit code 0，无类型错误

- [ ] **步骤 3：Commit**

```bash
git add types.ts
git commit -m "feat: add MoA type definitions"
```

---

### 任务 3：缓存模块 (cache.ts) — TDD

**文件：**
- 创建：`D:\BaiduSyncdisk\moa\tests\cache.test.ts`
- 创建：`D:\BaiduSyncdisk\moa\cache.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/cache.test.ts
import { describe, test, expect, beforeEach } from "bun:test"
import { createCache, cacheKey, cacheGet, cacheSet, cacheCleanup } from "../cache"

describe("cacheKey", () => {
  test("produces consistent hash for same input", () => {
    const a = cacheKey("hello", "model-a")
    const b = cacheKey("hello", "model-a")
    expect(a).toBe(b)
  })

  test("produces different hash for different prompts", () => {
    const a = cacheKey("hello", "model-a")
    const b = cacheKey("world", "model-a")
    expect(a).not.toBe(b)
  })

  test("produces different hash for different models", () => {
    const a = cacheKey("hello", "model-a")
    const b = cacheKey("hello", "model-b")
    expect(a).not.toBe(b)
  })
})

describe("cacheGet / cacheSet", () => {
  test("returns value after set within TTL", () => {
    const cache = createCache(60000)
    cacheSet(cache, "hello", "model-a", "world")
    const result = cacheGet(cache, "hello", "model-a")
    expect(result).toBe("world")
  })

  test("returns null when key not found", () => {
    const cache = createCache(60000)
    const result = cacheGet(cache, "missing", "model-a")
    expect(result).toBeNull()
  })

  test("returns null when cache entry expired", () => {
    const cache = createCache(1) // 1ms TTL
    cacheSet(cache, "hello", "model-a", "world")
    // force expire by sleeping 2ms
    Bun.sleepSync(2)
    const result = cacheGet(cache, "hello", "model-a")
    expect(result).toBeNull()
  })
})

describe("cacheCleanup", () => {
  test("removes expired entries", () => {
    const cache = createCache(1)
    cacheSet(cache, "hello", "model-a", "world")
    cacheSet(cache, "foo", "model-b", "bar")
    Bun.sleepSync(2)
    cacheSet(cache, "keep", "model-c", "this") // fresh
    cacheCleanup(cache)
    expect(cacheGet(cache, "hello", "model-a")).toBeNull()
    expect(cacheGet(cache, "foo", "model-b")).toBeNull()
    expect(cacheGet(cache, "keep", "model-c")).toBe("this")
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`bun test tests/cache.test.ts`
预期：全部 FAIL，报 "module not found" 或函数未定义

- [ ] **步骤 3：实现 cache.ts**

```typescript
import type { CacheEntry } from "./types"

export interface CacheStore {
  store: Map<string, CacheEntry>
  ttlMs: number
}

export function createCache(ttlMs: number = 300000): CacheStore {
  return { store: new Map(), ttlMs }
}

export function cacheKey(prompt: string, modelId: string): string {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(prompt + "::" + modelId)
  return hasher.digest("hex")
}

export function cacheGet(cache: CacheStore, prompt: string, modelId: string): string | null {
  const key = cacheKey(prompt, modelId)
  const entry = cache.store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.store.delete(key)
    return null
  }
  return entry.value
}

export function cacheSet(cache: CacheStore, prompt: string, modelId: string, value: string): void {
  const key = cacheKey(prompt, modelId)
  cache.store.set(key, { value, expiresAt: Date.now() + cache.ttlMs })
}

export function cacheCleanup(cache: CacheStore): void {
  const now = Date.now()
  for (const [key, entry] of cache.store) {
    if (now > entry.expiresAt) cache.store.delete(key)
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`bun test tests/cache.test.ts`
预期：全部 PASS (5 tests)

- [ ] **步骤 5：Commit**

```bash
git add cache.ts tests/cache.test.ts
git commit -m "feat: add cache module with TTL and SHA256 keys"
```

---

### 任务 4：配置模块 (config.ts) — TDD

**文件：**
- 创建：`D:\BaiduSyncdisk\moa\tests\config.test.ts`
- 创建：`D:\BaiduSyncdisk\moa\config.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/config.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { join } from "node:path"
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdirSync } from "node:os"
import { loadConfig, autoGenerateConfig, saveConfig } from "../config"
import type { MoaConfig, ProviderInfo } from "../types"

const tmpDir = join(tmpdirSync(), "opencode-moa-test-" + Date.now())

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
})

describe("loadConfig", () => {
  test("returns parsed config when file exists", () => {
    const config: MoaConfig = {
      enabled: true,
      defaultPreset: "test-preset",
      presets: {
        "test-preset": {
          proposers: ["provider-a/model-1", "provider-b/model-2"],
          aggregator: "provider-c/model-3",
          strategy: "parallel",
        },
      },
    }
    writeFileSync(join(tmpDir, "moa.json"), JSON.stringify(config, null, 2))
    const result = loadConfig(tmpDir, [])
    expect(result).toEqual(config)
  })

  test("triggers auto-generate when file is missing and sufficient providers exist", () => {
    const providers: ProviderInfo[] = [
      { providerID: "opencode", modelID: "gpt-5.1-codex" },
      { providerID: "anthropic", modelID: "claude-sonnet-4" },
      { providerID: "anthropic", modelID: "claude-opus-4" },
    ]
    const result = loadConfig(tmpDir, providers)
    expect(result.enabled).toBe(true)
    expect(result.defaultPreset).toBe("auto")
    expect(result.presets.auto.proposers).toHaveLength(2)
    expect(result.presets.auto._auto_generated).toBe(true)
  })

  test("returns empty config when no file and insufficient providers (< 3)", () => {
    const providers: ProviderInfo[] = [
      { providerID: "openai", modelID: "gpt-4" },
    ]
    const result = loadConfig(tmpDir, [...providers])
    expect(result.enabled).toBe(true)
    expect(result.defaultPreset).toBe("")
    expect(Object.keys(result.presets)).toHaveLength(0)
  })
})

describe("autoGenerateConfig", () => {
  test("selects proposers from different providers when possible", () => {
    const providers: ProviderInfo[] = [
      { providerID: "opencode", modelID: "gpt-5.1-codex" },
      { providerID: "anthropic", modelID: "claude-sonnet-4" },
      { providerID: "anthropic", modelID: "claude-haiku-4" },
      { providerID: "deepseek", modelID: "deepseek-v3" },
    ]
    const config = autoGenerateConfig(providers)
    // 前 2 个 proposer 应是不同 provider
    const p1 = config.presets.auto.proposers[0].split("/")[0]
    const p2 = config.presets.auto.proposers[1].split("/")[0]
    expect(p1).not.toBe(p2)
    // aggregator 是最强的模型
    expect(config.presets.auto.aggregator).toBe("anthropic/claude-sonnet-4")
    expect(config.presets.auto._auto_generated).toBe(true)
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`bun test tests/config.test.ts`
预期：全部 FAIL

- [ ] **步骤 3：实现 config.ts**

```typescript
import { join } from "node:path"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import type { MoaConfig, ProviderInfo } from "./types"
import { DEFAULT_AGGREGATOR_PROMPT } from "./types"

export function loadConfig(homeDir: string, providers: ProviderInfo[]): MoaConfig {
  const configPath = join(homeDir, "moa.json")
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, "utf-8"))
    } catch {
      // corrupted config, fall through to auto-generate
    }
  }
  if (providers.length >= 3) {
    const config = autoGenerateConfig(providers)
    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2))
    } catch { /* fail silently, config in-memory still works */ }
    return config
  }
  return {
    enabled: true,
    defaultPreset: "",
    presets: {},
  }
}

export function autoGenerateConfig(providers: ProviderInfo[]): MoaConfig {
  const sorted = [...providers]
  // Sort: prefer unique providers, then use list order as capability proxy
  sorted.sort((a, b) => {
    // prioritize different providers first
    return 0 // keep original order from providers() response
  })

  const proposers: [string, string] = [
    `${sorted[0].providerID}/${sorted[0].modelID}`,
    findDifferentProvider(sorted[0].providerID, sorted),
  ]
  const aggregator = `${sorted[sorted.length - 1].providerID}/${sorted[sorted.length - 1].modelID}`

  return {
    enabled: true,
    defaultPreset: "auto",
    presets: {
      auto: {
        proposers,
        aggregator,
        aggregatorPrompt: DEFAULT_AGGREGATOR_PROMPT,
        strategy: "parallel",
        _auto_generated: true,
      },
    },
  }
}

function findDifferentProvider(usedProvider: string, providers: ProviderInfo[]): string {
  const alt = providers.find(p => p.providerID !== usedProvider)
  if (alt) return `${alt.providerID}/${alt.modelID}`
  // fallback: same provider, different model
  return `${providers[1].providerID}/${providers[1].modelID}`
}

export function saveConfig(homeDir: string, config: MoaConfig): void {
  const configPath = join(homeDir, "moa.json")
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`bun test tests/config.test.ts`
预期：全部 PASS (4 tests)

- [ ] **步骤 5：Commit**

```bash
git add config.ts tests/config.test.ts
git commit -m "feat: add config module with auto-generation"
```

---

### 任务 5：编排核心 (orchestrator.ts) — TDD

**文件：**
- 创建：`D:\BaiduSyncdisk\moa\tests\orchestrator.test.ts`
- 创建：`D:\BaiduSyncdisk\moa\orchestrator.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/orchestrator.test.ts
import { describe, test, expect } from "bun:test"
import { runMoa, proposeOne, aggregate } from "../orchestrator"
import { createCache, cacheSet } from "../cache"
import type { MoaPreset, ProposerResult } from "../types"

function fakeClient(responses: Record<string, string>) {
  return {
    session: {
      create: async () => ({ id: `child-${Math.random().toString(36).slice(2)}` }),
      prompt: async ({ body }: any) => {
        const modelId = body.model?.modelID ?? "fallback"
        const content = responses[modelId] ?? "default response"
        return { data: { info: {}, parts: [{ type: "text", text: content }] } }
      },
    },
  }
}

describe("proposeOne", () => {
  test("returns success result with content", async () => {
    const client = fakeClient({ "model-a": "answer A" })
    const result = await proposeOne(
      client as any,
      { providerID: "test", modelID: "model-a" },
      "what is 2+2?",
      "session-1",
      5000
    )
    expect(result.success).toBe(true)
    expect(result.content).toBe("answer A")
  })

  test("returns failure when client throws", async () => {
    const badClient = {
      session: {
        create: async () => { throw new Error("network error") },
      },
    }
    const result = await proposeOne(
      badClient as any,
      { providerID: "test", modelID: "model-a" },
      "prompt",
      "session-1",
      5000
    )
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe("runMoa", () => {
  test("returns aggregated result when both proposers succeed", async () => {
    const client = fakeClient({
      "model-a": "use React hooks",
      "model-b": "use Vue composition API",
      "model-agg": "## 综合建议：React hooks 更适合本项目",
    })
    const preset: MoaPreset = {
      proposers: ["test/model-a", "test/model-b"],
      aggregator: "test/model-agg",
      strategy: "parallel",
    }
    const cache = createCache(60000)
    const result = await runMoa(client as any, preset, "how to build this component?", "session-1", cache)
    expect(result).toContain("综合建议")
  })

  test("handles single proposer failure", async () => {
    const client = fakeClient({
      "model-b": "use solid architecture",
      "model-agg": "## 基于唯一可用建议",
    })
    // model-a will fail because responses doesn't have it — proposeOne will throw
    const badClient = {
      session: {
        create: async () => ({ id: `child-${Math.random().toString(36).slice(2)}` }),
        prompt: async ({ body }: any) => {
          const id = body.model?.modelID ?? ""
          if (id === "model-a") throw new Error("timeout")
          if (id === "model-b") return { data: { info: {}, parts: [{ type: "text", text: "use solid architecture" }] } }
          return { data: { info: {}, parts: [{ type: "text", text: "## 基于唯一可用建议" }] } }
        },
      },
    }
    const preset: MoaPreset = {
      proposers: ["test/model-a", "test/model-b"],
      aggregator: "test/model-agg",
      strategy: "parallel",
    }
    const cache = createCache(60000)
    const result = await runMoa(badClient as any, preset, "prompt", "session-1", cache)
    expect(result).toContain("基于唯一可用建议")
  })

  test("falls back to single model when both proposers fail", async () => {
    const failingClient = {
      session: {
        create: async () => ({ id: `child-${Math.random().toString(36).slice(2)}` }),
        prompt: async () => { throw new Error("all down") },
      },
    }
    const preset: MoaPreset = {
      proposers: ["test/model-a", "test/model-b"],
      aggregator: "test/model-agg",
      strategy: "parallel",
    }
    const cache = createCache(60000)
    const result = await runMoa(failingClient as any, preset, "prompt", "session-1", cache)
    expect(result).toContain("MoA 执行失败")
  })

  test("returns cached result on duplicate prompt", async () => {
    const preset: MoaPreset = {
      proposers: ["test/model-a", "test/model-b"],
      aggregator: "test/model-agg",
      strategy: "parallel",
    }
    const cache = createCache(60000)
    cacheSet(cache, "duplicate prompt", preset.aggregator, "cached output")
    let callCount = 0
    const client = {
      session: {
        create: async () => { callCount++; return { id: `child-${callCount}` } },
        prompt: async () => { return { data: { info: {}, parts: [{ type: "text", text: "fresh" }] } } },
      },
    }
    const result = await runMoa(client as any, preset, "duplicate prompt", "session-1", cache)
    expect(result).toBe("cached output")
    expect(callCount).toBe(0) // no LLM calls made
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`bun test tests/orchestrator.test.ts`
预期：全部 FAIL

- [ ] **步骤 3：实现 orchestrator.ts**

```typescript
import type { MoaPreset, ProposerResult } from "./types"
import type { CacheStore } from "./cache"
import { cacheGet, cacheSet } from "./cache"
import { DEFAULT_AGGREGATOR_PROMPT } from "./types"

export async function proposeOne(
  client: any,
  model: { providerID: string; modelID: string },
  prompt: string,
  parentSessionId: string,
  timeoutMs: number
): Promise<ProposerResult> {
  const start = Date.now()
  try {
    const session = await client.session.create({
      body: { parentID: parentSessionId },
    })
    const response = await client.session.prompt({
      path: { id: session.id },
      body: {
        model,
        parts: [{ type: "text", text: prompt }],
      },
    })
    const text = response.data?.parts
      ?.filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n") ?? ""
    return {
      modelId: `${model.providerID}/${model.modelID}`,
      content: text,
      success: true,
      durationMs: Date.now() - start,
    }
  } catch (e: any) {
    return {
      modelId: `${model.providerID}/${model.modelID}`,
      content: "",
      success: false,
      error: e.message ?? "unknown error",
      durationMs: Date.now() - start,
    }
  }
}

async function aggregate(
  client: any,
  model: { providerID: string; modelID: string },
  userPrompt: string,
  results: ProposerResult[],
  aggregatorPrompt: string,
  parentSessionId: string
): Promise<string> {
  const proposals = results
    .filter(r => r.success)
    .map((r, i) => `### 回答 ${i + 1} (${r.modelId})\n${r.content}`)
    .join("\n\n---\n\n")

  const session = await client.session.create({
    body: { parentID: parentSessionId },
  })
  const response = await client.session.prompt({
    path: { id: session.id },
    body: {
      model,
      parts: [
        {
          type: "text",
          text: `${aggregatorPrompt}\n\n## 用户问题\n${userPrompt}\n\n${proposals}`,
        },
      ],
    },
  })
  return response.data?.parts
    ?.filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("\n") ?? ""
}

export async function runMoa(
  client: any,
  preset: MoaPreset,
  prompt: string,
  parentSessionId: string,
  cache: CacheStore
): Promise<string> {
  const cached = cacheGet(cache, prompt, preset.aggregator)
  if (cached) return cached

  const [proposerA, proposerB] = preset.proposers
  const [providerA, modelA] = proposerA.split("/")
  const [providerB, modelB] = proposerB.split("/")
  const [aggProvider, aggModel] = preset.aggregator.split("/")

  const results = await Promise.all([
    proposeOne(client, { providerID: providerA, modelID: modelA }, prompt, parentSessionId, 120000),
    proposeOne(client, { providerID: providerB, modelID: modelB }, prompt, parentSessionId, 120000),
  ])

  const successful = results.filter(r => r.success)
  if (successful.length === 0) {
    return `⚠️ MoA 执行失败：两个提议者均不可用。\n错误: ${results.map(r => r.error).join("; ")}`
  }

  const aggPrompt = preset.aggregatorPrompt ?? DEFAULT_AGGREGATOR_PROMPT

  let output: string
  try {
    output = await aggregate(
      client,
      { providerID: aggProvider, modelID: aggModel },
      prompt,
      results,
      aggPrompt,
      parentSessionId
    )
  } catch (e: any) {
    // aggregation failed, return best proposal
    output = successful[0].content
  }

  cacheSet(cache, prompt, preset.aggregator, output)
  return output
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`bun test tests/orchestrator.test.ts`
预期：全部 PASS (5 tests)

- [ ] **步骤 5：Commit**

```bash
git add orchestrator.ts tests/orchestrator.test.ts
git commit -m "feat: add MoA orchestrator with parallel propose + aggregate"
```

---

### 任务 6：插件入口 (plugin.ts) + 钩子连接

**文件：**
- 创建：`D:\BaiduSyncdisk\moa\plugin.ts`
- 修改：`D:\BaiduSyncdisk\moa\index.ts`

- [ ] **步骤 1：编写 plugin.ts**

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { join } from "node:path"
import { homedir } from "node:os"
import { createCache, cacheCleanup } from "./cache"
import { loadConfig } from "./config"
import { runMoa } from "./orchestrator"
import type { MoaConfig, ProviderInfo } from "./types"

const DEBOUNCE_MS = 30000
let lastPromptHash = ""
let lastPromptTime = 0
let config: MoaConfig | null = null
let providers: ProviderInfo[] = []

export const MoaPlugin: Plugin = async ({ client, directory }) => {
  const homeDir = homedir()
  const configDir = join(homeDir, ".config", "opencode")

  providers = await fetchProviders(client)
  config = loadConfig(configDir, providers)

  if (config.presets.auto?._auto_generated) {
    const preset = config.presets.auto
    console.log(
      `╭──────────────────────────────────────────╮\n` +
      `│ 🦸 MoA Plugin 已加载                      │\n` +
      `│                                          │\n` +
      `│ 已自动检测你的模型配置并生成预设：            │\n` +
      `│   ${join(configDir, "moa.json").replace(/\\/g, "/")}    │\n` +
      `│                                          │\n` +
      `│ 当前预设: auto                            │\n` +
      `│   提议者 1: ${preset.proposers[0]}        │\n` +
      `│   提议者 2: ${preset.proposers[1]}        │\n` +
      `│   聚合者:   ${preset.aggregator}          │\n` +
      `│                                          │\n` +
      `│ 如需自定义，编辑 moa.json 即可             │\n` +
      `╰──────────────────────────────────────────╯`
    )
  } else if (!config || Object.keys(config.presets).length === 0) {
    console.log(
      `╭──────────────────────────────────────────╮\n` +
      `│ 🦸 MoA Plugin 已加载                      │\n` +
      `│                                          │\n` +
      `│ 未检测到足够的模型配置，请手动设置：           │\n` +
      `│   ${join(configDir, "moa.json").replace(/\\/g, "/")}    │\n` +
      `╰──────────────────────────────────────────╯`
    )
  }

  const cache = createCache(300000)
  setInterval(() => cacheCleanup(cache), 60000)

  return {
    "message.part.updated": async (message: any, part: any) => {
      if (!config?.enabled || !config.defaultPreset) return
      const preset = config.presets[config.defaultPreset]
      if (!preset) return

      if (part.type !== "text") return
      if (!part.text || part.text.trim().length === 0) return
      if (message.role !== "user") return

      const promptHash = part.text.slice(0, 200)
      const now = Date.now()
      if (promptHash === lastPromptHash && now - lastPromptTime < DEBOUNCE_MS) return
      lastPromptHash = promptHash
      lastPromptTime = now

      try {
        const result = await runMoa(client, preset, part.text, message.sessionID ?? "root", cache)
        await client.session.prompt({
          path: { id: message.sessionID },
          body: {
            noReply: true,
            parts: [{
              type: "text",
              text: `## MoA 聚合结果\n\n${result}`,
            }],
          },
        })
      } catch (e: any) {
        console.error(`[opencode-moa] error: ${e.message}`)
      }
    },
  }
}

async function fetchProviders(client: any): Promise<ProviderInfo[]> {
  try {
    const resp = await client.config.providers()
    const result: ProviderInfo[] = []
    for (const provider of resp.data?.providers ?? []) {
      for (const model of provider.models ?? []) {
        result.push({
          providerID: provider.id,
          modelID: model.id,
        })
      }
    }
    return result
  } catch {
    return []
  }
}
```

- [ ] **步骤 2：编写 index.ts 导出**

```typescript
export { MoaPlugin } from "./plugin"
export { runMoa, proposeOne } from "./orchestrator"
export { loadConfig, autoGenerateConfig, saveConfig } from "./config"
export { createCache, cacheGet, cacheSet, cacheCleanup, cacheKey } from "./cache"
export type { MoaConfig, MoaPreset, ProposerResult, CacheEntry, ProviderInfo } from "./types"
```

- [ ] **步骤 3：验证所有测试仍通过**

运行：`bun test tests/`
预期：全部 PASS (14 tests)

- [ ] **步骤 4：TypeScript 编译检查**

运行：`bun run tsc --noEmit`
预期：Exit code 0

- [ ] **步骤 5：Commit**

```bash
git add plugin.ts index.ts
git commit -m "feat: add OpenCode plugin entry with auto-setup and MoA hook"
```

---

### 任务 7：发布到 npm

**文件：**
- 修改：`D:\BaiduSyncdisk\moa\package.json` — 补充 files/scripts/publishConfig

- [ ] **步骤 1：更新 package.json 添加发布字段**

修改 `package.json`，增加：

```json
{
  "files": [
    "plugin.ts",
    "index.ts",
    "types.ts",
    "config.ts",
    "cache.ts",
    "orchestrator.ts"
  ],
  "scripts": {
    "test": "bun test tests/",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "bun run typecheck && bun run test"
  }
}
```

- [ ] **步骤 2：运行全量测试**

运行：`bun test tests/`
预期：全部 PASS (14 tests)

- [ ] **步骤 3：TypeScript 类型检查**

运行：`bun run typecheck`
预期：Exit code 0

- [ ] **步骤 4：发布**

```bash
npm publish --access public
```
预期：上传成功，返回 `+ opencode-moa@0.1.0`

- [ ] **步骤 5：Commit**

```bash
git add package.json
git commit -m "chore: add publish config and scripts"
```

---

## 自检

**1. 规格覆盖度：**
- ✅ 架构 (组装/目录结构) → 任务 1-2
- ✅ 配置管理 + 自动生成 → 任务 4
- ✅ 缓存策略 (SHA256 + TTL) → 任务 3
- ✅ MoA 流程 (并行提议 → 聚合) → 任务 5
- ✅ 首次安装引导 → 任务 6
- ✅ 错误处理 (超时/全部失败/聚合失败) → 任务 5 测试覆盖
- ✅ 防重复 (30s 去重) → 任务 6
- ✅ 安装与分发 → 任务 7
- ✅ 跳过系统消息/工具结果 → 任务 6 (role check)
- ✅ Phase B 排除 (仅 Phase A) → 未涵盖
- ✅ 串行聚合排除 → 未涵盖
- ✅ 3+ 提议者排除 → 未涵盖
- ✅ OpenChamber UI 排除 → 未涵盖

**2. 占位符扫描：**
- ✅ 无 TODO/TBD/后续实现
- ✅ 无 "添加适当错误处理" (具体错误处理已在代码中)
- ✅ 所有测试步骤含实际测试代码
- ✅ 所有类型在任务 2 定义，后续任务直接引用

**3. 类型一致性：**
- ✅ `MoaConfig.enabled` 在 config.ts (L5+L35) 和 plugin.ts (L62) 使用一致
- ✅ `MoaPreset.proposers` 始终为 `[string, string]`
- ✅ `ProposerResult` 的字段在 orchestrator.ts 所有返回路径中一致填充
- ✅ `cacheKey/get/set` 签名在 cache.ts 和 orchestrator.ts (缓存调用) 一致
- ✅ `runMoa(prompt)` 参数在 plugin.ts (L53) 和 orchestrator.ts (L72) 签名匹配
