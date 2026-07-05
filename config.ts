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

  const proposers: [string, string] = [
    `${sorted[0].providerID}/${sorted[0].modelID}`,
    findDifferentProvider(sorted[0].providerID, sorted),
  ]
  const aggregator = `${sorted[1].providerID}/${sorted[1].modelID}`

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
  return `${providers[1].providerID}/${providers[1].modelID}`
}

export function saveConfig(homeDir: string, config: MoaConfig): void {
  const configPath = join(homeDir, "moa.json")
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}
