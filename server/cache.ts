/**
 * @file 独立服务缓存层
 * @description Redis 语义缓存；未配置或故障时降级为直连生成器，不阻断主流程
 * @module server/cache
 * @author YYC³ Team
 * @version 1.0.0
 * @created 2026-11-19
 * @updated 2026-11-19
 * @copyright Copyright (c) 2026 YYC3
 * @license MIT
 */

import { Redis } from "@upstash/redis"
import type { ServiceConfig } from "./config.ts"

export interface CacheOutcome<T> {
  value: T
  hit: boolean
  degraded: boolean
}

export function createCache(config: ServiceConfig) {
  let redis: Redis | null = null
  if (config.redisUrl && config.redisToken) {
    redis = new Redis({ url: config.redisUrl, token: config.redisToken })
  }

  async function getOrSet<T>(key: string, generator: () => Promise<T>, ttlSeconds = 3600): Promise<CacheOutcome<T>> {
    if (!redis) {
      return { value: await generator(), hit: false, degraded: true }
    }
    try {
      const cached = await redis.get<T>(key)
      if (cached !== null) {
        return { value: cached, hit: true, degraded: false }
      }
      const value = await generator()
      await redis.setex(key, ttlSeconds, value)
      return { value, hit: false, degraded: false }
    } catch (error) {
      console.warn("[Cache] 降级为直连", error instanceof Error ? error.message : "unknown")
      return { value: await generator(), hit: false, degraded: true }
    }
  }

  async function health(): Promise<boolean> {
    if (!redis) return false
    try {
      await redis.ping()
      return true
    } catch {
      return false
    }
  }

  return { getOrSet, health }
}

export type CacheHandle = ReturnType<typeof createCache>
