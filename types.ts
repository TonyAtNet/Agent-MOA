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
