/**
 * @file 独立服务配置
 * @description 从环境变量读取并校验配置；禁止硬编码 IP/端口/密钥/凭证
 * @module server/config
 * @author YYC³ Team
 * @version 1.0.0
 * @created 2026-11-19
 * @updated 2026-11-19
 * @copyright Copyright (c) 2026 YYC3
 * @license MIT
 */

export interface ServiceConfig {
  port: number
  host: string
  databaseUrl: string
  databaseStandbyUrl: string | null
  redisUrl: string | null
  redisToken: string | null
  modelApiBaseUrl: string | null
  modelApiKey: string | null
  modelName: string | null
  serviceToken: string | null
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConfigError"
  }
}

function parsePort(raw: string | undefined): number {
  if (!raw) return 3100
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new ConfigError("PORT 必须是 1-65535 的整数")
  }
  return value
}

function readOptional(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key]
  return value && value.trim() !== "" ? value : null
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const databaseUrl = readOptional(env, "DATABASE_URL")
  if (!databaseUrl) {
    throw new ConfigError("缺少必需环境变量 DATABASE_URL（PG17 主库连接串）")
  }

  const host = readOptional(env, "HOST") ?? "0.0.0.0"
  const serviceToken = readOptional(env, "SERVICE_API_TOKEN")

  return {
    port: parsePort(env.PORT),
    host,
    databaseUrl,
    databaseStandbyUrl: readOptional(env, "DATABASE_STANDBY_URL"),
    redisUrl: readOptional(env, "KV_REST_API_URL") ?? readOptional(env, "REDIS_URL"),
    redisToken: readOptional(env, "KV_REST_API_TOKEN") ?? readOptional(env, "REDIS_TOKEN"),
    modelApiBaseUrl: readOptional(env, "MODEL_API_BASE_URL"),
    modelApiKey: readOptional(env, "MODEL_API_KEY"),
    modelName: readOptional(env, "MODEL_NAME"),
    serviceToken,
  }
}
