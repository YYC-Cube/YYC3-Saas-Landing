/**
 * @file 独立服务数据库层
 * @description PG17 主库/备库连接池，只读请求优先备库，主库故障自动降级到备库
 * @module server/db
 * @author YYC³ Team
 * @version 1.0.0
 * @created 2026-11-19
 * @updated 2026-11-19
 * @copyright Copyright (c) 2026 YYC3
 * @license MIT
 */

import { Pool, type PoolClient, type QueryResultRow } from "pg"
import type { ServiceConfig } from "./config.ts"

export interface QueryOptions {
  readonly: boolean
  params?: unknown[]
}

export interface QueryOutcome<T extends QueryResultRow> {
  rows: T[]
  rowCount: number
  source: "primary" | "standby"
  degraded: boolean
}

export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DatabaseUnavailableError"
  }
}

export function createDb(config: ServiceConfig) {
  const primary = new Pool({ connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30_000 })
  const standby = config.databaseStandbyUrl
    ? new Pool({ connectionString: config.databaseStandbyUrl, max: 5, idleTimeoutMillis: 30_000 })
    : null

  primary.on("error", (error) => console.error("[DB primary] 空闲连接错误", error.message))
  standby?.on("error", (error) => console.error("[DB standby] 空闲连接错误", error.message))

  async function run<T extends QueryResultRow>(
    pool: Pool,
    sql: string,
    params: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }> {
    const client: PoolClient = await pool.connect()
    try {
      const result = await client.query<T>(sql, params)
      return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length }
    } finally {
      client.release()
    }
  }

  async function query<T extends QueryResultRow>(sql: string, options: QueryOptions): Promise<QueryOutcome<T>> {
    const params = options.params ?? []
    const preferred = options.readonly && standby ? standby : primary
    const fallback = preferred === primary ? standby : primary

    try {
      const result = await run<T>(preferred, sql, params)
      return {
        ...result,
        source: preferred === primary ? "primary" : "standby",
        degraded: false,
      }
    } catch (primaryError) {
      if (!fallback) {
        throw new DatabaseUnavailableError(
          `数据库查询失败且无可用备库: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}`,
        )
      }
      console.warn("[DB] 首选池失败，切换备用池", primaryError instanceof Error ? primaryError.message : "unknown")
      try {
        const result = await run<T>(fallback, sql, params)
        return {
          ...result,
          source: fallback === primary ? "primary" : "standby",
          degraded: true,
        }
      } catch (fallbackError) {
        throw new DatabaseUnavailableError(
          `主备库均不可用: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        )
      }
    }
  }

  async function health(): Promise<{ primary: boolean; standby: boolean }> {
    const probe = async (pool: Pool | null): Promise<boolean> => {
      if (!pool) return false
      try {
        await pool.query("SELECT 1")
        return true
      } catch {
        return false
      }
    }
    const [primaryOk, standbyOk] = await Promise.all([probe(primary), probe(standby)])
    return { primary: primaryOk, standby: standbyOk }
  }

  async function close(): Promise<void> {
    await Promise.all([primary.end(), standby?.end()].filter(Boolean) as Promise<void>[])
  }

  return { query, health, close }
}

export type DbHandle = ReturnType<typeof createDb>
