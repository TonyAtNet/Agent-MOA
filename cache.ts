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
