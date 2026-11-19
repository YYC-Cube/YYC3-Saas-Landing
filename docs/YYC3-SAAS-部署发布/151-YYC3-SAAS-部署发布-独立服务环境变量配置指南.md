---
file: 151-YYC3-SAAS-部署发布-独立服务环境变量配置指南.md
title: YYC³ SAAS 独立服务环境变量配置指南
description: 独立服务承载 PG17 主备、Redis 与模型调用所需的环境变量、注入方式、启动验证与回滚
author: YYC³ Team <admin@0379.email>
version: v1.0.0
created: 2026-11-19
updated: 2026-11-19
status: published
tags: [deployment, environment, pg17, redis, model, ops]
category: deployment
language: zh-CN
audience: developers,devops,dba
complexity: advanced
project: yyc3-saas-landing
phase: deployment
---

# YYC³ SAAS 独立服务环境变量配置指南

> **_YYC³_**（YanYuCloudCube™ · 注册商标）
> _言启象限 | 语枢未来_
> **_Words Initiate Quadrants, Language Serves as Core for Future_**
> _万象归元于云枢 | 深栈智启新纪元_
> **_All things converge in cloud pivot; Deep stacks ignite a new era of intelligence_**

---

## 一、适用范围

本文档面向 `server/` 独立服务（`pnpm server` 启动），说明承载 **PostgreSQL 17 主备**、**Redis** 与**模型调用**所需的全部环境变量、注入方式、校验规则与验证步骤。

**本文档不包含任何真实凭证。** 所有值必须在部署环境注入，仓库内只保留键名模板 `.env.example`。

## 二、变量清单

| 变量 | 必填 | 用途 | 代码读取位置 | 缺失行为 |
|---|---|---|---|---|
| `DATABASE_URL` | **是** | PG17 主库连接串（NAS 主库） | `server/config.ts` | **服务拒绝启动**，输出 `缺少必需环境变量 DATABASE_URL` |
| `DATABASE_STANDBY_URL` | 否 | PG17 备库连接串（本机） | `server/config.ts` → `server/db.ts` | 无备库；主库故障时直接 503 |
| `KV_REST_API_URL` | 否 | Redis（Upstash REST 语义）地址 | `server/config.ts` → `server/cache.ts` | 缓存降级为直连 |
| `KV_REST_API_TOKEN` | 否 | Redis 令牌 | 同上 | 同上 |
| `REDIS_URL` | 否 | 标准 Redis 连接串（与 `KV_REST_API_*` 二选一） | 同上 | 同上 |
| `REDIS_TOKEN` | 否 | 标准 Redis 令牌 | 同上 | 同上 |
| `MODEL_API_BASE_URL` | 否 | 模型服务基址（OpenAI 兼容） | `server/config.ts` → `server/model.ts` | `/api/chat` 返回 503 `模型服务未配置` |
| `MODEL_API_KEY` | 否 | 模型服务密钥 | 同上 | 同上 |
| `MODEL_NAME` | 否 | 模型名 | 同上 | 同上 |
| `SERVICE_API_TOKEN` | **强烈建议** | 独立服务鉴权令牌（Bearer） | `server/app.ts` | 未配置时**所有受保护端点返回 401**（fail-closed） |
| `PORT` | 否 | 监听端口，默认 3100 | `server/config.ts` | 使用默认值；非法值启动失败 |
| `HOST` | 否 | 监听地址，默认 `0.0.0.0` | `server/config.ts` | 使用默认值 |
| `NEXT_PUBLIC_SITE_URL` | 否 | 前端站点地址（静态导出） | 前端构建 | 不影响服务启动 |

> **重要**：`DATABASE_URL` 缺失时服务**不会**以默认值启动，而是直接退出。这是刻意设计的 fail-closed 策略，避免误连错误库。

## 三、注入方式（按环境）

### 3.1 本地开发

```bash
cp .env.example .env.local
# 编辑 .env.local，填入真实值
# 注意：.env.local 已被 .gitignore 忽略，禁止提交
```

Node 原生不会自动加载 `.env.local`，需显式注入：

```bash
set -a && source .env.local && set +a
pnpm server
```

### 3.2 Linux / systemd

```ini
# /etc/systemd/system/yyc3-api.service
[Unit]
Description=YYC3 SaaS Independent API
After=network.target

[Service]
Type=simple
# 凭证放在仅 root 可读的环境文件，切勿写入 unit 文件
EnvironmentFile=/etc/yyc3/api.env
WorkingDirectory=/opt/yyc3/yyc3-saas-landing
ExecStart=/usr/bin/node server/index.ts
Restart=on-failure
RestartSec=5
User=yyc3
Group=yyc3

[Install]
WantedBy=multi-user.target
```

```bash
# 权限收敛
chown root:root /etc/yyc3/api.env
chmod 600 /etc/yyc3/api.env
systemctl daemon-reload
systemctl enable --now yyc3-api
```

### 3.3 Docker / Compose

```yaml
services:
  api:
    build: .
    command: ["node", "server/index.ts"]
    env_file:
      - /etc/yyc3/api.env   # 宿主机注入，镜像内不含凭证
    ports:
      - "127.0.0.1:3100:3100"   # 仅回环，由反向代理对外
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### 3.4 CI / GitHub Actions

在仓库 `Settings → Secrets and variables → Actions` 配置，**禁止**写入 workflow 明文：

```yaml
- name: Run tests
  run: pnpm test        # 测试使用占位值，不依赖真实凭证
```

> 当前 CI 只做构建与测试，不部署独立服务。若后续新增部署 job，凭证须通过 `${{ secrets.* }}` 注入。

## 四、连接串格式规范

### 4.1 PG17 主备

```text
postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=<mode>
```

| 角色 | 说明 | 变量 |
|---|---|---|
| 主库 | 用户确认：本地 NAS 主库，端口 **5433** | `DATABASE_URL` |
| 备库 | 用户确认：本机 PG17 备 | `DATABASE_STANDBY_URL` |

> 端口 5433 与主机地址**不得写入仓库**，只在部署环境注入。文档记录该端口仅用于运维核对。

### 4.2 语义说明

- 只读请求（`/api/query`）**优先走备库**；备库未配置或失败时回落主库。
- 主库失败时，若备库可用则自动降级并返回 `degraded: true`。
- 主备均不可用 → `503` + `DatabaseUnavailableError` 消息。

## 五、启动验证

### 5.1 无配置（应失败）

```bash
env -u DATABASE_URL node server/index.ts
# 预期：[server] 配置错误: 缺少必需环境变量 DATABASE_URL（PG17 主库连接串）
```

### 5.2 有配置（应启动）

```bash
DATABASE_URL='postgresql://...' SERVICE_API_TOKEN='<token>' PORT=3100 node server/index.ts
# 预期：[server] 独立服务已启动 http://0.0.0.0:3100
```

### 5.3 健康检查

```bash
curl -s http://127.0.0.1:3100/health
# 预期结构：
# {"status":"ok","db":{"primary":true,"standby":true},"cache":true,"model":true}
```

逐项判读：

| 字段 | `true` 含义 | `false` 含义 |
|---|---|---|
| `db.primary` | 主库 `SELECT 1` 成功 | 主库不可达或凭证错误 |
| `db.standby` | 备库可用 | 未配置备库或不可达 |
| `cache` | Redis ping 成功 | 未配置或不可达（业务降级，不阻塞） |
| `model` | 三个模型变量齐备 | 模型未配置（`/api/chat` 返回 503） |

### 5.4 鉴权验证

```bash
# 无令牌 → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3100/api/query \
  -H 'Content-Type: application/json' -d '{"sql":"SELECT 1"}'

# 有令牌 → 200
curl -s -X POST http://127.0.0.1:3100/api/query \
  -H "Authorization: Bearer $SERVICE_API_TOKEN" \
  -H 'Content-Type: application/json' -d '{"sql":"SELECT 1 AS ok"}'
```

## 六、安全要求

| 要求 | 说明 |
|---|---|
| 禁止硬编码 | 任何 IP / 端口 / 密钥 / 凭证不得进入源码、文档、镜像 |
| 禁止提交 `.env*` | `.gitignore` 已覆盖 `.env`、`.env.local`、`.env*.local`；仅 `.env.example` 可提交且只含键名 |
| 最小权限 | 数据库账号仅授予业务所需 `SELECT`（服务仅允许只读查询） |
| 令牌轮换 | `SERVICE_API_TOKEN` 建议 90 天轮换一次，轮换期间双令牌并行 |
| 网络暴露 | 独立服务默认监听 `0.0.0.0`，生产必须置于反向代理后并限制来源 |
| 日志 | 服务不打印连接串；若需排查，只输出主机名与错误码 |

## 七、常见故障排查

| 现象 | 可能原因 | 排查 |
|---|---|---|
| 启动即退出，提示缺少 `DATABASE_URL` | 环境变量未注入 | 检查 `EnvironmentFile` 路径与权限 |
| `/health` 中 `db.primary=false` | 主库不可达 / 凭证错误 / 端口错误 | `psql` 手动连接验证；核对 5433 |
| `db.standby=false` | 未配置备库或备库未启动 | 检查 `DATABASE_STANDBY_URL` |
| `cache=false` | Redis 未配置或不可达 | 属可接受降级；核对 `KV_REST_API_*` |
| `/api/chat` 返回 503 | 模型三变量不齐 | 核对 `MODEL_API_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME` |
| 所有受保护端点 401 | 未配置 `SERVICE_API_TOKEN` 或请求头缺失 | 核对令牌与 `Authorization: Bearer <token>` |

## 八、回滚方案

| 场景 | 动作 |
|---|---|
| 配置错误导致无法启动 | 回退 `EnvironmentFile` 至上一版本（保留备份），`systemctl restart yyc3-api` |
| 新版本服务异常 | `git revert <提交>` + `pnpm install`，重启服务；数据库无 schema 变更，无需数据回滚 |
| Redis 故障 | 无需回滚，服务自动降级直连 |
| 模型服务不可用 | 无需回滚，`/api/chat` 返回 503，前端展示降级提示 |
| 主库故障 | 自动切备库（只读可用）；主库恢复后重启服务以重建主库连接池 |

## 九、与前端部署的关系

| 项 | 状态 |
|---|---|
| 前端 | `output: "export"` 静态导出，部署 GitHub Pages / `saas.yyc3.vip`（Q8 已确认可访问） |
| 独立服务 | 需单独部署到可运行 Node 的宿主机或容器平台 |
| 联调 | 前端通过可配置 API 基址访问独立服务（当前前端仍为降级提示，接入需另行排期） |

> 当前状态如实说明：独立服务已具备承载能力并通过本地启动验证，但**前端尚未接线**，AI 相关 UI 仍显示降级提示。接线属后续迭代。

---

## 变更历史

| 版本 | 日期 | 变更内容 | 作者 |
| ---- | ---- | -------- | ---- |
| v1.0.0 | 2026-11-19 | 首次发布：变量清单、四种注入方式、启动验证、安全要求、故障排查与回滚 | YYC³ Team |

---

<p align="center">
  <b>YYC³</b>（YanYuCloudCube™ · 注册商标）<br>
  言启象限 | 语枢未来<br>
  <i>Words Initiate Quadrants, Language Serves as Core for Future</i><br>
  万象归元于云枢 | 深栈智启新纪元<br>
  <i>All things converge in cloud pivot; Deep stacks ignite a new era of intelligence</i><br>
  <sub>© 2026 YanYuCloudCube™（YYC³）· <a href="mailto:admin@0379.email">admin@0379.email</a></sub>
</p>
