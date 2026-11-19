/**
 * @file 独立服务启动入口
 * @description 启动独立 API 服务；SIGTERM/SIGINT 优雅关闭连接池
 * @module server/index
 * @author YYC³ Team
 * @version 1.0.0
 * @created 2026-11-19
 * @updated 2026-11-19
 * @copyright Copyright (c) 2026 YYC3
 * @license MIT
 */

import { loadConfig, ConfigError } from "./config.ts"
import { createApp } from "./app.ts"
import { createDb } from "./db.ts"
import { createCache } from "./cache.ts"
import { createModel } from "./model.ts"

function main(): void {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`[server] 配置错误: ${error.message}`)
    } else {
      console.error("[server] 配置加载失败", error)
    }
    process.exitCode = 1
    return
  }

  const services = {
    db: createDb(config),
    cache: createCache(config),
    model: createModel(config),
  }
  const server = createApp(config, services)

  server.listen(config.port, config.host, () => {
    console.log(`[server] 独立服务已启动 http://${config.host}:${config.port}`)
  })

  const shutdown = (signal: string): void => {
    console.log(`[server] 收到 ${signal}，开始优雅关闭`)
    server.close(async () => {
      await services.db.close()
      console.log("[server] 关闭完成")
      process.exit(0)
    })
  }
  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

main()
