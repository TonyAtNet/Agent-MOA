import { describe, test, expect } from "bun:test"
import { runMoa, proposeOne } from "../orchestrator"
import { createCache, cacheSet } from "../cache"
import type { MoaPreset } from "../types"

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

  test("falls back when both proposers fail", async () => {
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
    expect(callCount).toBe(0)
  })
})
