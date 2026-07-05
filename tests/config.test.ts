import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { join } from "node:path"
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { loadConfig, autoGenerateConfig, saveConfig } from "../config"
import type { MoaConfig, ProviderInfo } from "../types"

const tmpDir = join(tmpdir(), "opencode-moa-test-" + Date.now())

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
    const p1 = config.presets.auto.proposers[0].split("/")[0]
    const p2 = config.presets.auto.proposers[1].split("/")[0]
    expect(p1).not.toBe(p2)
    expect(config.presets.auto.aggregator).toBe("anthropic/claude-sonnet-4")
    expect(config.presets.auto._auto_generated).toBe(true)
  })
})
