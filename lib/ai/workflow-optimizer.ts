/**
 * @file 工作流优化器
 * @description 提供AI驱动的工作流优化功能
 * @module lib/ai/workflow-optimizer
 * @author YYC³
 * @version 1.0.0
 * @created 2025-01-30
 * @updated 2025-01-30
 * @copyright Copyright (c) 2025 YYC³
 * @license MIT
 */

// 工作流优化分析器（Vercel AI SDK 已剥离；改为基于执行统计的本地规则分析）
import { z } from "zod"
import { workflowEngine, type WorkflowExecution } from "@/lib/workflow-engine"

// 瓶颈分析结果
const BottleneckSchema = z.object({
  step: z.string().describe("出现瓶颈的步骤名称"),
  issue: z.string().describe("具体问题描述"),
  impact: z.string().describe("对整体流程的影响"),
  severity: z.enum(["low", "medium", "high"]).describe("严重程度"),
})

// 优化建议
const OptimizationSchema = z.object({
  suggestion: z.string().describe("优化建议"),
  expectedImprovement: z.string().describe("预期改进效果"),
  implementation: z.string().describe("实施方法"),
  priority: z.enum(["low", "medium", "high"]).describe("优先级"),
})

// 自动化机会
const AutomationOpportunitySchema = z.object({
  task: z.string().describe("可自动化的任务"),
  automationMethod: z.string().describe("自动化方法"),
  timeSaved: z.string().describe("预计节省时间"),
  complexity: z.enum(["easy", "medium", "hard"]).describe("实施复杂度"),
})

// 完整分析结果
const WorkflowAnalysisSchema = z.object({
  summary: z.string().describe("整体分析总结"),
  bottlenecks: z.array(BottleneckSchema).describe("识别的瓶颈"),
  optimizations: z.array(OptimizationSchema).describe("优化建议"),
  automationOpportunities: z.array(AutomationOpportunitySchema).describe("自动化机会"),
  performanceScore: z.number().min(0).max(100).describe("性能评分"),
  recommendations: z.array(z.string()).describe("关键建议"),
})

export type WorkflowAnalysis = z.infer<typeof WorkflowAnalysisSchema>

/**
 * 分析工作流并提供优化建议
 */
export async function analyzeWorkflow(workflowId: string): Promise<WorkflowAnalysis> {
  // 获取工作流执行历史
  const history = await getWorkflowHistory(workflowId)

  if (history.length === 0) {
    throw new Error("No execution history found for this workflow")
  }

  // 计算统计数据
  const stats = calculateWorkflowStats(history)

  // Vercel AI SDK 已剥离：改为基于执行统计的本地规则分析，保留 Zod 类型约束。
  const bottlenecks: WorkflowAnalysis["bottlenecks"] = [
    {
      step: stats.slowestStep.name,
      issue: `平均执行耗时 ${stats.slowestStep.avgDuration.toFixed(2)} 秒，为全链路最慢步骤`,
      impact: "拉长整体工作流执行时长",
      severity: stats.slowestStep.avgDuration > 5 ? "high" : "medium",
    },
  ]

  if (stats.mostFailedStep.failureRate > 0) {
    bottlenecks.push({
      step: stats.mostFailedStep.name,
      issue: `步骤失败率 ${stats.mostFailedStep.failureRate.toFixed(2)}%`,
      impact: "导致工作流中断与重试成本",
      severity: stats.mostFailedStep.failureRate > 20 ? "high" : "medium",
    })
  }

  const optimizations: WorkflowAnalysis["optimizations"] = [
    {
      suggestion: `优先优化步骤「${stats.slowestStep.name}」`,
      expectedImprovement: "降低平均执行时长",
      implementation: "拆分长耗时步骤或引入异步处理",
      priority: "medium",
    },
  ]

  const automationOpportunities: WorkflowAnalysis["automationOpportunities"] = []

  const performanceScore = Math.max(
    0,
    Math.min(100, Math.round(stats.successRate - stats.avgDuration * 2)),
  )

  return {
    summary: `基于 ${stats.totalExecutions} 次执行的本地规则分析：成功率 ${stats.successRate.toFixed(2)}%，平均耗时 ${stats.avgDuration.toFixed(2)} 秒`,
    bottlenecks,
    optimizations,
    automationOpportunities,
    performanceScore,
    recommendations: [
      `关注最慢步骤「${stats.slowestStep.name}」`,
      `关注高失败率步骤「${stats.mostFailedStep.name}」`,
      "模型辅助分析待架构决策（确认清单 Q3/Q5）后接入",
    ],
  }
}

/**
 * 获取工作流执行历史
 */
async function getWorkflowHistory(workflowId: string): Promise<WorkflowExecution[]> {
  // 从执行引擎获取历史记录
  const allExecutions = workflowEngine.getAllExecutions()
  return allExecutions
    .filter((exec) => exec.workflowId === workflowId)
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
}

/**
 * 计算工作流统计数据
 */
function calculateWorkflowStats(history: WorkflowExecution[]) {
  const totalExecutions = history.length
  const successfulExecutions = history.filter((exec) => exec.status === "completed").length
  const successRate = (successfulExecutions / totalExecutions) * 100

  // 计算平均执行时间
  const durations = history
    .filter((exec) => exec.endTime)
    .map((exec) => (exec.endTime!.getTime() - exec.startTime.getTime()) / 1000)
  const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length

  // 找出最慢的步骤
  const stepDurations = new Map<string, number[]>()
  history.forEach((exec) => {
    exec.steps.forEach((step) => {
      if (step.startTime && step.endTime) {
        const duration = (step.endTime.getTime() - step.startTime.getTime()) / 1000
        if (!stepDurations.has(step.stepId)) {
          stepDurations.set(step.stepId, [])
        }
        stepDurations.get(step.stepId)!.push(duration)
      }
    })
  })

  let slowestStep = { name: "N/A", avgDuration: 0 }
  stepDurations.forEach((durations, stepId) => {
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length
    if (avg > slowestStep.avgDuration) {
      slowestStep = { name: stepId, avgDuration: avg }
    }
  })

  // 找出失败最多的步骤
  const stepFailures = new Map<string, { total: number; failed: number }>()
  history.forEach((exec) => {
    exec.steps.forEach((step) => {
      if (!stepFailures.has(step.stepId)) {
        stepFailures.set(step.stepId, { total: 0, failed: 0 })
      }
      const stats = stepFailures.get(step.stepId)!
      stats.total++
      if (step.status === "failed") {
        stats.failed++
      }
    })
  })

  let mostFailedStep = { name: "N/A", failureRate: 0 }
  stepFailures.forEach((stats, stepId) => {
    const failureRate = (stats.failed / stats.total) * 100
    if (failureRate > mostFailedStep.failureRate) {
      mostFailedStep = { name: stepId, failureRate }
    }
  })

  return {
    totalExecutions,
    successRate,
    avgDuration,
    slowestStep,
    mostFailedStep,
  }
}

/**
 * 生成优化报告
 */
export async function generateOptimizationReport(workflowId: string): Promise<string> {
  const analysis = await analyzeWorkflow(workflowId)

  const report = `
# 工作流优化报告

## 工作流 ID: ${workflowId}

## 整体评估
${analysis.summary}

**性能评分**: ${analysis.performanceScore}/100

## 识别的瓶颈

${analysis.bottlenecks
  .map(
    (b, i) => `
### ${i + 1}. ${b.step}
- **问题**: ${b.issue}
- **影响**: ${b.impact}
- **严重程度**: ${b.severity === "high" ? "高" : b.severity === "medium" ? "中" : "低"}
`,
  )
  .join("\n")}

## 优化建议

${analysis.optimizations
  .map(
    (o, i) => `
### ${i + 1}. ${o.suggestion}
- **预期改进**: ${o.expectedImprovement}
- **实施方法**: ${o.implementation}
- **优先级**: ${o.priority === "high" ? "高" : o.priority === "medium" ? "中" : "低"}
`,
  )
  .join("\n")}

## 自动化机会

${analysis.automationOpportunities
  .map(
    (a, i) => `
### ${i + 1}. ${a.task}
- **自动化方法**: ${a.automationMethod}
- **预计节省时间**: ${a.timeSaved}
- **实施复杂度**: ${a.complexity === "easy" ? "简单" : a.complexity === "medium" ? "中等" : "复杂"}
`,
  )
  .join("\n")}

## 关键建议

${analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}

---
*报告生成时间: ${new Date().toLocaleString("zh-CN")}*
  `.trim()

  return report
}
