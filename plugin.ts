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

export const MoaPlugin: Plugin = async ({ client, directory }) => {
  const homeDir = homedir()
  const configDir = join(homeDir, ".config", "opencode")

  const providers = await fetchProviders(client)
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

      const snippet = part.text.slice(0, 200)
      const promptHash = Bun.hash(snippet).toString()
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
  } as any
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
