import { describe, test, expect } from "bun:test"
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
    const cache = createCache(1)
    cacheSet(cache, "hello", "model-a", "world")
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
    cacheSet(cache, "keep", "model-c", "this")
    cacheCleanup(cache)
    expect(cacheGet(cache, "hello", "model-a")).toBeNull()
    expect(cacheGet(cache, "foo", "model-b")).toBeNull()
    expect(cacheGet(cache, "keep", "model-c")).toBe("this")
  })
})
