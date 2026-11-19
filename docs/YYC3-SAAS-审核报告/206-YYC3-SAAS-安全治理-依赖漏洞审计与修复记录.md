---
file: 206-YYC3-SAAS-安全治理-依赖漏洞审计与修复记录.md
title: YYC³ SAAS 依赖漏洞审计与修复记录
description: 针对默认分支 30 漏洞告警的全量审计、分级修复、版本锁定与回归验证记录
author: YYC³ Team <admin@0379.email>
version: v1.0.0
created: 2026-11-19
updated: 2026-11-19
status: published
tags: [security, audit, dependency, vulnerability, remediation]
category: security
language: zh-CN
audience: developers,devops,security,managers
complexity: advanced
project: yyc3-saas-landing
phase: remediation
---

# YYC³ SAAS 依赖漏洞审计与修复记录

> **_YYC³_**（YanYuCloudCube™ · 注册商标）
> _言启象限 | 语枢未来_
> **_Words Initiate Quadrants, Language Serves as Core for Future_**
> _万象归元于云枢 | 深栈智启新纪元_
> **_All things converge in cloud pivot; Deep stacks ignite a new era of intelligence_**

---

## 核心理念

**五高架构**：高可用 | 高性能 | 高安全 | 高扩展 | 高智能
**五标体系**：标准化 | 规范化 | 自动化 | 可视化 | 智能化
**五化转型**：流程化 | 数字化 | 生态化 | 工具化 | 服务化
**五维评估**：时间维 | 空间维 | 属性维 | 事件维 | 关联维

---

## 一、背景与触发

2026-11-19 推送 `main` 时，GitHub 返回漏洞告警：

> GitHub found 30 vulnerabilities on YYC-Cube/YYC3-Saas-Landing's default branch (1 critical, 19 high, 10 moderate).

本文档记录对该告警的**实际审计过程、修复动作、版本锁定与回归验证**，所有版本号与统计均来自本机真实命令输出，未做估算。

## 二、审计方法与环境

### 2.1 审计命令

```bash
pnpm audit --registry=https://registry.npmjs.org/ --json
```

### 2.2 关键约束与已知问题

| 项 | 事实 |
|---|---|
| 默认 registry | `https://registry.npmmirror.com` |
| 该 registry 的 audit 端点 | **不可用**：`ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS` |
| 处置 | 仅对 audit 命令临时指定官方 registry，**未修改** `.npmrc`、未切换包管理器、未改动 pnpm workspace |
| 计数口径差异 | GitHub 按"漏洞包 × 严重级别"聚合为 30；`pnpm audit` 按 advisory 条目统计为 **32**（1 critical / 23 high / 8 moderate）。两者同源不同粒度，本记录以 advisory 明细为准 |

## 三、审计结果（修复前）

| 严重级别 | 条目数 | 涉及模块 |
|---|---|---|
| Critical | 1 | `next` |
| High | 23 | `brace-expansion`(8)、`sharp`(3)、`postcss`(2)、`js-yaml`(2)、`browserslist`(2)、`next`(1)、`nanoid`(1)、`source-map-js`(1)、`zod`(1)、`minimatch`(1) |
| Moderate | 8 | `postcss`(3)、`next`(2)、`brace-expansion`(2)、`baseline-browser-mapping`(1)、`minimatch`(1) |

### 3.1 Critical 项

| 模块 | 安装版本 | 受影响区间 | 修复版本 | 说明 |
|---|---|---|---|---|
| `next` | 15.5.24 | `>=10.0.0 <=15.5.27` | `>=15.5.28` | Image Optimization API 在启用 SVG 时存在未授权远程代码执行 |

> 补充事实：本项目 `next.config.js` 已设置 `images: { unoptimized: true }`，Image Optimization API 未被启用，实际暴露面已被压缩；但**不能据此豁免升级**，因为该配置可能在未来被改回，且同批 high/moderate 项同样需要修复。

### 3.2 High 项摘要

| 模块 | 安装版本 | 修复版本 | 代表问题 |
|---|---|---|---|
| `brace-expansion` | 1.1.14 / 5.0.6 | 1.1.21 / 5.0.12 | 多重 DoS（指数展开、递归栈耗尽、OOM） |
| `sharp` | 0.34.5 | 0.35.5 | libvips / libheif / librsvg 继承漏洞 |
| `postcss` | 8.4.31 | 8.5.23 | `sourceMappingURL` 任意文件读取 |
| `js-yaml` | 4.3.0 | 4.3.2 | `!!omap` 二次方 CPU 消耗 |
| `nanoid` | 3.3.16 | 3.3.18 | size=0 时无限循环 |
| `browserslist` | 4.28.2 | 4.28.7 | 无界内存增长 / 原型写入 |
| `source-map-js` | 1.2.1 | 1.2.2 | 事件循环 DoS |
| `zod` | 3.25.76 | >=4.6.6 | 超大约束集合校验时内存耗尽 |

## 四、修复动作

### 4.1 直接依赖升级

| 依赖 | 修复前 | 修复后（实际安装） | 类型 |
|---|---|---|---|
| `next` | `^15.5.24` | `^15.5.29` → 实装 **15.5.29** | 补丁级，非破坏性 |
| `zod` | `^3.25.76` | `^4.6.6` → 实装 **4.6.7** | **大版本，需专项回归** |

### 4.2 传递依赖锁定（`pnpm.overrides`）

写入 `package.json` 的 `pnpm.overrides`，全部为 audit 给出的**已修复版本**，无编造：

| 覆盖项 | 锁定版本 |
|---|---|
| `brace-expansion@1` | 1.1.21 |
| `brace-expansion@5` | 5.0.12 |
| `minimatch@10` | 11.0.1 |
| `postcss@8` | 8.5.23 |
| `js-yaml@4` | 4.3.2 |
| `nanoid@3` | 3.3.18 |
| `browserslist@4` | 4.28.7 |
| `baseline-browser-mapping@2` | 2.11.0 |
| `source-map-js@1` | 1.2.2 |
| `sharp@0.34` | 0.35.5 |

> 说明：`minimatch` 仍存在 3.1.5 版本（`eslint` 生态内），该版本不在受影响区间内，audit 未告警。

### 4.3 zod 4 升级的兼容性验证

| 检查项 | 结果 |
|---|---|
| zod 全仓库引用点 | 仅 `lib/ai/workflow-optimizer.ts` 一处 |
| 使用的 API | `z.object` / `z.string` / `z.enum` / `z.array` / `z.number().min().max()` / `z.infer` / `.describe()` |
| 是否存在 `zodResolver` | **不存在**（无 react-hook-form + zod 联动） |
| `tsc --noEmit` | PASS |
| 结论 | 现有用法在 zod 4 下类型检查通过；**仍建议**在业务联调阶段复核运行时 schema 行为 |

## 五、回归验证

| 停闸 | 命令 | 结果 |
|---|---|---|
| 测试 | `pnpm test` | **14/14 PASS** |
| Lint | `pnpm lint` | **0 errors** |
| 类型 | `pnpm exec tsc --noEmit` | **PASS** |
| 构建 | `pnpm build` | **PASS**（Next 15.5.29 静态导出正常） |

### 5.1 审计结果对比

| 时点 | Critical | High | Moderate | 合计 advisory |
|---|---|---|---|---|
| 修复前 | 1 | 23 | 8 | 32 |
| 升级 next 后 | 0 | 22 | 6 | 28 |
| 全部修复后 | **0** | **0** | **0** | **0** |

## 六、遗留与已知非漏洞问题

| 项 | 状态 | 说明 |
|---|---|---|
| `vaul@0.9.9` peer 依赖不匹配 | **未修复（非安全项）** | 声明支持 React 16–18，实际安装 React 19.2.6；`pnpm install` 有 WARN，但不影响构建与运行。升级 `vaul` 属行为变更，需单独评审 |
| `latest` 浮动版本（`@emotion/is-prop-valid`、`@upstash/redis`、`framer-motion`、`motion`、`react-use-measure`、`recharts`） | **仍存在** | 锁文件已固定实际版本，但声明仍为 `latest`；建议后续统一改为精确版本（P2） |
| `next lint` 规则放宽 | 未放宽 | 本次未通过降级规则换取通过 |
| `ignoreduringbuilds` | 保留 | 唯一权威门禁为 CI 阻塞式 `pnpm lint` |

## 七、复现与持续监控建议

### 7.1 本地复现

```bash
# 注意：默认 npmmirror 不支持 audit 端点，必须显式指定官方 registry
pnpm audit --registry=https://registry.npmjs.org/

# 查看 JSON 明细
pnpm audit --registry=https://registry.npmjs.org/ --json
```

### 7.2 CI 建议

1. 新增独立 job：`pnpm audit --registry=https://registry.npmjs.org/ --audit-level=high`，失败即阻断。
2. 保留 Dependabot 现有配置，但要求 PR 必须通过四道停闸。
3. 每季度复核 `pnpm.overrides`，在 upstream 修复后移除临时覆盖，避免长期偏离主版本。

### 7.3 回滚

```bash
# 回滚本次依赖修复（以提交为单位）
git revert <本次提交哈希>
pnpm install
pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build
```

- 回滚后漏洞将重新出现，**仅限紧急故障场景**，且必须同步挂起上线。
- 回滚须同时恢复 `package.json` 与 `pnpm-lock.yaml`，不可只回滚其一。

---

## 变更历史

| 版本 | 日期 | 变更内容 | 作者 |
| ---- | ---- | -------- | ---- |
| v1.0.0 | 2026-11-19 | 首次依赖漏洞全量审计与修复：32 → 0 advisory，四道停闸全绿 | YYC³ Team |

---

<p align="center">
  <b>YYC³</b>（YanYuCloudCube™ · 注册商标）<br>
  言启象限 | 语枢未来<br>
  <i>Words Initiate Quadrants, Language Serves as Core for Future</i><br>
  万象归元于云枢 | 深栈智启新纪元<br>
  <i>All things converge in cloud pivot; Deep stacks ignite a new era of intelligence</i><br>
  <sub>© 2026 YanYuCloudCube™（YYC³）· <a href="mailto:admin@0379.email">admin@0379.email</a></sub>
</p>
