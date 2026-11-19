import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { WorkflowEngine } from "../lib/workflow-engine.ts"

const root = resolve(import.meta.dirname, "..")
const read = (p) => readFileSync(resolve(root, p), "utf8")

test("TC-07 条件表达式注入不得执行任意代码", async () => {
  const payloads = [
    "process.exit(1)",
    "globalThis.__pwned = true",
    "$a; process.exit(1)",
    "require('fs')",
  ]

  for (const condition of payloads) {
    const engine = new WorkflowEngine()
    const execution = await engine.executeWorkflow(
      "security",
      [{ id: "inject", type: "condition", name: "注入测试", config: { condition } }],
      { a: 1 },
    )

    assert.equal(execution.status, "completed")
    assert.equal(execution.steps[0].status, "completed")
    assert.equal(execution.steps[0].output.result, false)
  }
  assert.equal(globalThis.__pwned, undefined)
})

test("TC-05 白名单比较表达式按预期求值", async () => {
  const engine = new WorkflowEngine()
  const execution = await engine.executeWorkflow(
    "normal",
    [{ id: "cmp", type: "condition", name: "比较测试", config: { condition: "$a > 5", trueValue: "yes", falseValue: "no" } }],
    { a: 10 },
  )

  assert.equal(execution.status, "completed")
  assert.equal(execution.steps[0].output.result, true)
  assert.equal(execution.steps[0].output.value, "yes")
})

test("TC-06 步骤抛错时标记失败并保留错误信息", async () => {
  const engine = new WorkflowEngine()
  const execution = await engine.executeWorkflow(
    "failure",
    [{ id: "bad", type: "unknown", name: "非法步骤", config: {} }],
  )

  assert.equal(execution.status, "failed")
  assert.equal(execution.steps[0].status, "failed")
  assert.match(execution.steps[0].error, /Unknown step type/)
})

test("P0-1 源码中不得存在 eval 或 new Function", () => {
  const source = read("lib/workflow-engine.ts")
  assert.doesNotMatch(source, /\beval\s*\(/)
  assert.doesNotMatch(source, /new\s+Function\s*\(/)
})

test("P0-3 CI 门禁不得设置失败豁免", () => {
  const ci = read(".github/workflows/deploy.yml")
  assert.doesNotMatch(ci, /continue-on-error\s*:\s*true/)
  assert.doesNotMatch(ci, /tsc\s+--noEmit\s*\|\|\s*true/)
})

test("P0-4 环境变量模板仅含变量名", () => {
  assert.ok(existsSync(resolve(root, ".env.example")))
  const template = read(".env.example")
  const values = template
    .split("\n")
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => line.split("=")[1].trim())
  assert.ok(values.length > 0)
  assert.ok(values.every((value) => value === ""), "模板中不得出现真实值")
})

test("S2 活动源码不得引用 Vercel AI SDK", () => {
  const files = [
    "lib/workflow-engine.ts",
    "lib/ai/workflow-optimizer.ts",
    "components/ai-analytics-chat.tsx",
    "components/ai-customer-support.tsx",
  ]
  for (const file of files) {
    assert.doesNotMatch(read(file), /@ai-sdk|from\s+["']ai["']|useChat|generateObject|generateText/)
  }
  const pkg = JSON.parse(read("package.json"))
  for (const name of ["ai", "@ai-sdk/openai", "@ai-sdk/react", "@vercel/analytics"]) {
    assert.equal(pkg.dependencies?.[name], undefined)
  }
})
