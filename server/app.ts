/**
 * @file 独立服务 HTTP 入口
 * @description 仅暴露受控端点：健康检查、参数化只读查询、模型对话；鉴权经环境变量令牌
 * @module server/app
 * @author YYC³ Team
 * @version 1.0.0
 * @created 2026-11-19
 * @updated 2026-11-19
 * @copyright Copyright (c) 2026 YYC3
 * @license MIT
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { createDb, DatabaseUnavailableError, type DbHandle } from "./db.ts"
import { createCache, type CacheHandle } from "./cache.ts"
import { createModel, isModelConfigured, ModelNotConfiguredError, ModelRequestError, type ModelHandle } from "./model.ts"
import type { ServiceConfig } from "./config.ts"

interface Services {
  db: DbHandle
  cache: CacheHandle
  model: ModelHandle
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage, limitBytes = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > limitBytes) throw new Error("请求体过大")
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"))
}

function authorized(req: IncomingMessage, config: ServiceConfig): boolean {
  if (!config.serviceToken) return false
  return req.headers.authorization === `Bearer ${config.serviceToken}`
}

const READONLY_SQL = /^\s*select\s/i

export function createApp(config: ServiceConfig, services?: Services) {
  const db = services?.db ?? createDb(config)
  const cache = services?.cache ?? createCache(config)
  const model = services?.model ?? createModel(config)

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)

    try {
      if (url.pathname === "/health" && req.method === "GET") {
        const [dbHealth, cacheHealth] = await Promise.all([db.health(), cache.health()])
        json(res, 200, {
          status: "ok",
          db: dbHealth,
          cache: cacheHealth,
          model: isModelConfigured(config),
        })
        return
      }

      if (!authorized(req, config)) {
        json(res, 401, { error: "未授权：需配置且提供 Bearer SERVICE_API_TOKEN" })
        return
      }

      if (url.pathname === "/api/query" && req.method === "POST") {
        const body = (await readBody(req)) as { sql?: string; params?: unknown[] }
        if (typeof body.sql !== "string" || !READONLY_SQL.test(body.sql)) {
          json(res, 400, { error: "仅允许以 SELECT 开头的只读查询" })
          return
        }
        if (body.sql.includes(";")) {
          json(res, 400, { error: "禁止多语句查询" })
          return
        }
        if (body.params !== undefined && !Array.isArray(body.params)) {
          json(res, 400, { error: "params 必须为数组" })
          return
        }
        const outcome = await db.query(body.sql, { readonly: true, params: body.params })
        json(res, 200, {
          rows: outcome.rows,
          rowCount: outcome.rowCount,
          source: outcome.source,
          degraded: outcome.degraded,
        })
        return
      }

      if (url.pathname === "/api/chat" && req.method === "POST") {
        const body = (await readBody(req)) as { messages?: Array<{ role: string; content: string }>; cacheKey?: string }
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          json(res, 400, { error: "messages 必须为非空数组" })
          return
        }
        const validRoles = new Set(["system", "user", "assistant"])
        if (body.messages.some((m) => !m || !validRoles.has(m.role) || typeof m.content !== "string")) {
          json(res, 400, { error: "消息格式非法" })
          return
        }

        const messages = body.messages as Array<{ role: "system" | "user" | "assistant"; content: string }>
        if (typeof body.cacheKey === "string" && body.cacheKey.length > 0) {
          const outcome = await cache.getOrSet(`chat:${body.cacheKey}`, () => model.chat(messages))
          json(res, 200, { content: outcome.value.content, hit: outcome.hit, degraded: outcome.degraded })
          return
        }
        const outcome = await model.chat(messages)
        json(res, 200, { content: outcome.content, configured: outcome.configured })
        return
      }

      json(res, 404, { error: "端点不存在" })
    } catch (error) {
      if (error instanceof DatabaseUnavailableError) {
        json(res, 503, { error: error.message })
      } else if (error instanceof ModelNotConfiguredError) {
        json(res, 503, { error: error.message })
      } else if (error instanceof ModelRequestError) {
        json(res, error.status >= 500 ? 502 : 400, { error: error.message })
      } else if (error instanceof SyntaxError) {
        json(res, 400, { error: "请求体不是合法 JSON" })
      } else {
        console.error("[server] 未处理异常", error)
        json(res, 500, { error: "服务内部错误" })
      }
    }
  })
}
