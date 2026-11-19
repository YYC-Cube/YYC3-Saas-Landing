"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Loader2, Send, Sparkles, BarChart3, TrendingUp, AlertCircle, RefreshCw } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface LocalMessage {
  id: string
  role: "user" | "assistant"
  text: string
}

export function AIAnalyticsChat() {
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Vercel AI SDK 已剥离：静态导出下无服务端端点，改为明确的降级应答，不发起虚构请求。
  // 恢复智能分析须经确认清单 Q3/Q5 决策后引入受控适配层，配置经环境变量注入。
  const sendMessage = (text: string) => {
    const stamp = Date.now()
    setMessages((prev) => [
      ...prev,
      { id: `u-${stamp}`, role: "user", text },
      {
        id: `a-${stamp}`,
        role: "assistant",
        text: "当前为静态演示模式，数据分析服务尚未接入。请通过确认清单 Q3/Q5 完成架构决策后再启用智能分析。",
      },
    ])
    setIsLoading(false)
  }

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // 清除错误提示
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    setError(null)
    setIsLoading(true)
    sendMessage(input)
    setInput("")
  }



  // 快捷问题示例
  const quickQuestions = [
    { icon: TrendingUp, text: "显示本月销售额趋势", color: "text-blue-400" },
    { icon: BarChart3, text: "分析用户增长情况", color: "text-green-400" },
    { icon: Sparkles, text: "本季度收入对比", color: "text-purple-400" },
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-h-[800px]">
      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-4"
          >
            <Card className="p-4 bg-destructive/10 border-destructive/50 flex items-center">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 消息列表区域 */}
      <Card className="flex-1 overflow-hidden flex flex-col bg-card/50 backdrop-blur-sm border-border/50">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            // 欢迎界面
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", duration: 0.6 }}
                className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"
              >
                <Sparkles className="w-8 h-8 text-primary" />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <h3 className="text-xl font-semibold mb-2">开始数据分析对话</h3>
                <p className="text-muted-foreground max-w-md">
                  询问任何关于您业务数据的问题，AI 将自动查询、分析并生成可视化图表
                </p>
              </motion.div>

              {/* 快捷问题 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex flex-wrap gap-3 justify-center max-w-2xl"
              >
                {quickQuestions.map((q, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="gap-2 bg-transparent hover:bg-foreground/5 transition-all duration-200 hover:scale-105"
                    onClick={() => setInput(q.text)}
                  >
                    <q.icon className={`w-4 h-4 ${q.color}`} />
                    {q.text}
                  </Button>
                ))}
              </motion.div>

              {/* 功能提示 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-8 grid grid-cols-3 gap-4 max-w-2xl text-xs text-muted-foreground"
              >
                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/50">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span>🔍</span>
                  </div>
                  <span className="text-center">智能查询</span>
                </div>
                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/50">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span>📊</span>
                  </div>
                  <span className="text-center">数据可视化</span>
                </div>
                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/50">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span>💡</span>
                  </div>
                  <span className="text-center">洞察分析</span>
                </div>
              </motion.div>
            </div>
          ) : (
            // 消息列表
            <AnimatePresence mode="popLayout">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{message.text}</div>
                  </div>

                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">👤</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {/* 加载指示器 */}
          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              </div>
              <div className="bg-muted rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span
                    className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </Card>

      {/* 输入区域 */}
      <form onSubmit={handleSubmit} className="mt-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="询问您的数据问题，例如：显示本月销售额趋势..."
              className="w-full px-4 py-3 pr-12 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
              maxLength={500}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {input.length}/500
            </div>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={!input.trim() || isLoading}
            className="px-6 transition-all hover:scale-105"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">AI 分析结果仅供参考，实际数据以系统记录为准</p>
      </form>
    </div>
  )
}
