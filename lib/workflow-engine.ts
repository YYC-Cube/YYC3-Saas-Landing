/**
 * @file 工作流引擎
 * @description 提供工作流执行和管理功能
 * @module lib/workflow-engine
 * @author YYC³
 * @version 1.0.0
 * @created 2025-01-30
 * @updated 2025-01-30
 * @copyright Copyright (c) 2025 YYC³
 * @license MIT
 */

// 工作流执行引擎（Vercel AI SDK 已剥离；AI 步骤退化为本地规则适配器）

export interface WorkflowStep {
  id: string
  type: "trigger" | "action" | "condition" | "ai"
  name: string
  config: Record<string, unknown>
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  status: "running" | "completed" | "failed" | "paused"
  startTime: Date
  endTime?: Date
  steps: StepExecution[]
  context: Record<string, unknown>
}

export interface StepExecution {
  stepId: string
  status: "pending" | "running" | "completed" | "failed" | "skipped"
  startTime?: Date
  endTime?: Date
  input?: unknown
  output?: unknown
  error?: string
}

export class WorkflowEngine {
  private executions: Map<string, WorkflowExecution> = new Map()

  /**
   * 执行工作流
   */
  async executeWorkflow(
    workflowId: string,
    steps: WorkflowStep[],
    initialContext: Record<string, unknown> = {},
  ): Promise<WorkflowExecution> {
    const executionId = `exec-${Date.now()}`
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: "running",
      startTime: new Date(),
      steps: steps.map((step) => ({
        stepId: step.id,
        status: "pending",
      })),
      context: { ...initialContext },
    }

    this.executions.set(executionId, execution)

    try {
      // 按顺序执行每个步骤
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        const stepExecution = execution.steps[i]

        stepExecution.status = "running"
        stepExecution.startTime = new Date()

        try {
          const result = await this.executeStep(step, execution.context)

          stepExecution.status = "completed"
          stepExecution.endTime = new Date()
          stepExecution.output = result

          // 更新执行上下文
          execution.context[`step_${step.id}_output`] = result
        } catch (error) {
          stepExecution.status = "failed"
          stepExecution.endTime = new Date()
          stepExecution.error = error instanceof Error ? error.message : String(error)

          // 步骤失败，终止工作流
          execution.status = "failed"
          execution.endTime = new Date()
          throw error
        }
      }

      // 所有步骤成功完成
      execution.status = "completed"
      execution.endTime = new Date()
    } catch (error) {
      console.error("Workflow execution failed:", error)
    }

    return execution
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: WorkflowStep, context: Record<string, unknown>): Promise<unknown> {
    switch (step.type) {
      case "trigger":
        return this.executeTrigger(step, context)
      case "action":
        return this.executeAction(step, context)
      case "condition":
        return this.executeCondition(step, context)
      case "ai":
        return this.executeAI(step, context)
      default:
        throw new Error(`Unknown step type: ${step.type}`)
    }
  }

  /**
   * 执行触发器
   */
  private async executeTrigger(step: WorkflowStep, context: Record<string, unknown>): Promise<unknown> {
    // 触发器通常在工作流开始时已经触发，这里只是记录
    return {
      triggered: true,
      timestamp: new Date().toISOString(),
      data: context.triggerData || {},
    }
  }

  /**
   * 执行操作
   */
  private async executeAction(step: WorkflowStep, context: Record<string, unknown>): Promise<unknown> {
    const { name, config } = step

    if (name.includes("数据库")) {
      // 模拟数据库操作
      return {
        action: "database",
        operation: config.operation || "query",
        affected: Math.floor(Math.random() * 100),
      }
    }

    if (name.includes("邮件")) {
      // 模拟发送邮件
      return {
        action: "email",
        to: config.to || "user@example.com",
        subject: config.subject || "通知",
        sent: true,
      }
    }

    // 默认操作
    return {
      action: "generic",
      config,
      executed: true,
    }
  }

  /**
   * 执行条件判断
   */
  private async executeCondition(step: WorkflowStep, context: Record<string, unknown>): Promise<unknown> {
    const { config } = step
    const condition = typeof config.condition === "string" ? config.condition : ""
    const trueValue = config.trueValue
    const falseValue = config.falseValue

    // 简单的条件评估（实际应用中需要更复杂的表达式解析）
    const result = this.evaluateCondition(condition, context)

    return {
      condition,
      result,
      value: result ? trueValue : falseValue,
    }
  }

  /**
   * 执行 AI 处理
   */
  private async executeAI(step: WorkflowStep, context: Record<string, unknown>): Promise<unknown> {
    const { config } = step

    try {
      // Vercel AI SDK 已按尽调决议剥离：本步骤退化为本地规则适配器，
      // 返回确定性的提示词渲染结果，不发起任何外部模型请求。
      // 如需恢复模型能力，须经确认清单 Q3/Q5 决策后引入受控适配层，配置经环境变量注入。
      const prompt = typeof config.prompt === "string" ? config.prompt : ""
      const fullPrompt = this.buildPrompt(prompt, config.inputData, context)

      if (config.outputSchema) {
        return { type: "structured", data: { prompt: fullPrompt }, mode: "local-rule" }
      }
      return { type: "text", data: fullPrompt, mode: "local-rule" }
    } catch (error) {
      console.error("AI step execution failed:", error)
      throw error
    }
  }

  /**
   * 评估条件
   */
  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    // 安全策略：仅接受白名单比较表达式，禁止 eval / new Function 等动态执行。
    // 语法：$var <op> literal | $var <op> $var
    if (typeof condition !== "string" || condition.trim() === "") return false

    const expression = condition.trim()
    const pattern = /^(\$[A-Za-z_][A-Za-z0-9_]*)\s*(===|!==|==|!=|>=|<=|>|<)\s*(\$[A-Za-z_][A-Za-z0-9_]*|"[^"]*"|'[^']*'|-?\d+(?:\.\d+)?|true|false|null)$/
    const parts = expression.match(pattern)
    if (!parts) {
      console.warn("[workflow-engine] 拒绝不支持的条件表达式", condition)
      return false
    }

    const [, leftToken, operator, rightToken] = parts
    const resolve = (token: string): unknown => {
      if (!token.startsWith("$")) {
        if (token === "true") return true
        if (token === "false") return false
        if (token === "null") return null
        if (/^-?\d/.test(token)) return Number(token)
        return token.slice(1, -1)
      }
      const key = token.slice(1)
      return Object.prototype.hasOwnProperty.call(context, key) ? context[key] : undefined
    }

    const left = resolve(leftToken)
    const right = resolve(rightToken)

    switch (operator) {
      case "===":
      case "==":
        return left === right
      case "!==":
      case "!=":
        return left !== right
      case ">":
        return typeof left === "number" && typeof right === "number" && left > right
      case "<":
        return typeof left === "number" && typeof right === "number" && left < right
      case ">=":
        return typeof left === "number" && typeof right === "number" && left >= right
      case "<=":
        return typeof left === "number" && typeof right === "number" && left <= right
      default:
        return false
    }
  }

  /**
   * 构建 AI 提示词
   */
  private buildPrompt(template: string, inputData: unknown, context: Record<string, unknown>): string {
    let prompt = template

    // 替换输入数据
    if (inputData) {
      prompt = prompt.replace("{{input}}", JSON.stringify(inputData))
    }

    // 替换上下文变量
    Object.keys(context).forEach((key) => {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, "g"), JSON.stringify(context[key]))
    })

    return prompt
  }

  /**
   * 获取执行状态
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId)
  }

  /**
   * 获取所有执行记录
   */
  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values())
  }

  /**
   * 暂停工作流
   */
  pauseExecution(executionId: string): void {
    const execution = this.executions.get(executionId)
    if (execution && execution.status === "running") {
      execution.status = "paused"
    }
  }

  /**
   * 恢复工作流
   */
  resumeExecution(executionId: string): void {
    const execution = this.executions.get(executionId)
    if (execution && execution.status === "paused") {
      execution.status = "running"
      // 这里应该继续执行剩余步骤
    }
  }
}

// 导出单例实例
export const workflowEngine = new WorkflowEngine()
