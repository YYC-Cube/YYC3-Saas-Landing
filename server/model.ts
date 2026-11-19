/**
 * @file 独立服务模型适配层
 * @description 经环境变量配置的兼容 Chat Completions 端点；不依赖任何 Vercel AI SDK
 * @module server/model
 * @author YYC³ Team
 * @version 1.0.0
 * @created 2026-11-19
 * @updated 2026-11-19
 * @copyright Copyright (c) 2026 YYC3
 * @license MIT
 */

import type { ServiceConfig } from "./config.ts"

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ChatOutcome {
  content: string
  configured: boolean
}

export class ModelNotConfiguredError extends Error {
  constructor() {
    super("模型服务未配置（需 MODEL_API_BASE_URL / MODEL_API_KEY / MODEL_NAME）")
    this.name = "ModelNotConfiguredError"
  }
}

export class ModelRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ModelRequestError"
    this.status = status
  }
}

export function isModelConfigured(config: ServiceConfig): boolean {
  return Boolean(config.modelApiBaseUrl && config.modelApiKey && config.modelName)
}

export function createModel(config: ServiceConfig) {
  async function chat(messages: ChatMessage[], signal?: AbortSignal): Promise<ChatOutcome> {
    if (!isModelConfigured(config)) {
      throw new ModelNotConfiguredError()
    }

    const response = await fetch(`${config.modelApiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.modelApiKey}`,
      },
      body: JSON.stringify({ model: config.modelName, messages }),
      signal,
    })

    if (!response.ok) {
      throw new ModelRequestError(`模型服务返回 ${response.status}`, response.status)
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== "string") {
      throw new ModelRequestError("模型响应缺少 choices[0].message.content", 502)
    }
    return { content, configured: true }
  }

  return { chat }
}

export type ModelHandle = ReturnType<typeof createModel>
