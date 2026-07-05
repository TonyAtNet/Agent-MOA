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
    const response = await Promise.race([
      client.session.prompt({
        path: { id: session.id },
        body: {
          model,
          parts: [{ type: "text", text: prompt }],
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ])
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
    console.warn(`[opencode-moa] aggregator failed: ${e.message}, falling back to ${successful[0].modelId}`)
    output = successful[0].content
  }

  cacheSet(cache, prompt, preset.aggregator, output)
  return output
}
