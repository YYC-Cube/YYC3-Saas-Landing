import { test } from "node:test"
import assert from "node:assert/strict"
import { loadConfig, ConfigError } from "../server/config.ts"
import { createApp } from "../server/app.ts"

const baseEnv = {
  DATABASE_URL: "postgresql://placeholder.invalid:5432/yyc3",
  SERVICE_API_TOKEN: "test-token-not-a-real-secret",
}

const mockServices = {
  db: {
    async query(sql, options) {
      return { rows: [{ sql, readonly: options.readonly }], rowCount: 1, source: "primary", degraded: false }
    },
    async health() {
      return { primary: true, standby: false }
    },
    async close() {},
  },
  cache: {
    async getOrSet(key, generator) {
      return { value: await generator(), hit: false, degraded: true }
    },
    async health() {
      return false
    },
  },
  model: {
    async chat(messages) {
      return { content: `echo:${messages.length}`, configured: true }
    },
  },
}

function startServer(env = {}) {
  const config = loadConfig({ ...baseEnv, ...env })
  const server = createApp(config, mockServices)
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      resolve({ server, base: `http://127.0.0.1:${addr.port}` })
    })
  })
}

test("Q4 配置：缺少 DATABASE_URL 时 fail-closed", () => {
  assert.throws(() => loadConfig({ ...baseEnv, DATABASE_URL: "" }), ConfigError)
})

test("Q4 配置：非法 PORT 被拒绝", () => {
  assert.throws(() => loadConfig({ ...baseEnv, PORT: "99999" }), ConfigError)
})

test("Q4 配置：主备连接串均来自环境变量", () => {
  const config = loadConfig({ ...baseEnv, DATABASE_STANDBY_URL: "postgresql://standby.invalid:5432/yyc3" })
  assert.equal(typeof config.databaseUrl, "string")
  assert.equal(typeof config.databaseStandbyUrl, "string")
})

test("Q3 健康检查端点无需鉴权并返回组件状态", async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/health`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, "ok")
    assert.equal(body.db.primary, true)
    assert.equal(body.cache, false)
  } finally {
    server.close()
  }
})

test("鉴权：未提供令牌时受保护端点返回 401", async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    })
    assert.equal(res.status, 401)
  } finally {
    server.close()
  }
})

test("Q4 只读查询：拒绝非 SELECT 与多语句", async () => {
  const { server, base } = await startServer()
  const headers = { "Content-Type": "application/json", Authorization: "Bearer test-token-not-a-real-secret" }
  try {
    for (const sql of ["DELETE FROM users", "SELECT 1; DROP TABLE users"]) {
      const res = await fetch(`${base}/api/query`, { method: "POST", headers, body: JSON.stringify({ sql }) })
      assert.equal(res.status, 400)
    }
    const ok = await fetch(`${base}/api/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sql: "SELECT $1::int AS value", params: [1] }),
    })
    assert.equal(ok.status, 200)
  } finally {
    server.close()
  }
})

test("Q3 模型对话：参数校验与降级路径", async () => {
  const { server, base } = await startServer()
  const headers = { "Content-Type": "application/json", Authorization: "Bearer test-token-not-a-real-secret" }
  try {
    const bad = await fetch(`${base}/api/chat`, { method: "POST", headers, body: JSON.stringify({ messages: [] }) })
    assert.equal(bad.status, 400)
    const ok = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    })
    assert.equal(ok.status, 200)
    assert.equal((await ok.json()).content, "echo:1")
  } finally {
    server.close()
  }
})
