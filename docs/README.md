# EuriskoTax 文档中心

> 最后更新：2026-09-13
> 维护原则：按用途分类存放，本文件为统一入口索引

---

## 当前状态（v1.12.0 · 2026-09-13）

- **生产环境**：Zeabur（Tencent Tokyo）+ PostgreSQL + HTTPS，公网地址 `https://euriskotax.zeabur.app`（Dockerfile 构建部署）
- **主版本**：CHANGELOG 最新 **1.12.0**（阶段13 获客与转化：`Lead` 线索留资 + 管理台「线索」Tab 跟进状态机 + 一键结果分享图 + 转化漏斗埋点；上一版 1.11.1 = 管理台「税率」Tab 保存链路修复 + 缴费基数最低标准 7546 与表单默认基数对齐）。1.12.0 已上线并打标签 `v1.12.0`
- **测试**：20 套件 412 个单元测试全部通过（`npm test`，2026-09-13 复跑，含阶段12 C1 税率热更新守护 20 例 + 阶段13 线索契约 20 例 + 漏斗埋点 9 例 + 分享卡 22 例）；发布门禁 `verify:local` **100/100** 全绿；动了 schema/迁移时另跑 `verify:pg`（生产等价 PostgreSQL 演练）
- **开发阶段**：阶段 8（首批测试用户运营）、阶段 9（PWA）、阶段 10（免费/专业版 ✅ v1.7.0 已上线）、阶段 11（内容/公告中心 ✅ v1.8.0 已上线）、阶段12 A + C1 ✅ 已完成（支付体系与 B 端 API 因 ICP 备案阻塞移至阶段15）、阶段13 获客与转化 ✅ 已完成（v1.12.0）→ 当前工作：**阶段14 变现与可信度（`ProCode` 兑换码 + 线下收款 / C2 城市社保参数库 / 高商业意图 SEO 落地页）**，见 [development/development-plan.md](development/development-plan.md) 与 [development/stage13-acquisition-and-leads-plan.md](development/stage13-acquisition-and-leads-plan.md)

---

## 目录结构

```
EuriskoTax/
├── src/                               # 前端源码（主项目）
├── server/                            # 后端源码（主项目）
│   ├── prisma/                        # Prisma schema + 迁移
│   │   ├── schema.prisma              # 生产 PostgreSQL
│   │   ├── schema.dev.prisma          # 本地 SQLite（开发用）
│   │   └── migrations/               # 生产迁移 SQL
│   ├── scripts/                       # 后端脚本（生成邀请码 / 重置 dev 用户）
│   └── src/                           # Express + Prisma + 认证 + 路由
├── tests/                             # 测试代码
├── tools/                             # 辅助工具集中目录
│   ├── ops/                           # 运维脚本（ops-start-dev / ops-watchdog / ops-notify + 通知配置）
│   ├── gui/                           # GUI 开发控制台（WinForms，8 Tab / 110+ 按钮）
│   └── cpolar/                        # cpolar 内网穿透工具
├── docs/                              # 项目文档
│   ├── README.md                      # 本文件（文档索引）
│   ├── api/                           # API 接口文档
│   ├── development/                   # 开发规划
│   ├── guides/                        # 使用与开发指南
│   ├── marketing/                     # 市场推广素材
│   ├── reports/                       # 项目报告（交付/重构/测试）
│   └── tech-reports/                  # 技术报告（规范/复盘/部署/SOP）
├── images/                            # 项目图片资源
├── index.html                         # 前端入口
├── service-worker.js                  # PWA Service Worker
├── manifest.json                      # PWA Manifest
├── Dockerfile                         # Docker 镜像构建配置（Zeabur 生产部署）
├── package.json                       # npm 配置
├── README.md                          # 项目入口
└── CHANGELOG.md                       # 变更记录
```

> **职责分离原则**：主项目代码（src/、server/）与辅助工具（tools/）分离，测试代码（tests/）独立，文档统一归档在 docs/。辅助工具按类型加前缀（ops- 运维、gui- GUI）。

---

## 文档清单

### API 接口

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [api/api-reference.md](api/api-reference.md) | 后端 REST API 接口规范 v2.5（认证含邮箱验证码/邀请码、计税、历史记录、反馈、内容中心、税制参数、转化线索、管理员、运营统计） | 2026-09-12 |

### 开发规划

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [development/development-plan.md](development/development-plan.md) | 项目开发计划、里程碑、技术选型、阶段状态表 | 2026-09-12 |
| [development/file-management-policy.md](development/file-management-policy.md) | 文件管理规范（目录归属/命名/编码/变更流程） | 2026-09-07 |
| [development/stage10-free-pro-plan.md](development/stage10-free-pro-plan.md) | 阶段10 免费/专业版实施方案（已确认 · 待命执行） | 2026-09-07 |
| [development/stage12-c1-tax-rate-config-plan.md](development/stage12-c1-tax-rate-config-plan.md) | 阶段12 C1 税制参数配置化方案与实施记录 | 2026-09-12 |
| [development/stage13-acquisition-and-leads-plan.md](development/stage13-acquisition-and-leads-plan.md) | 阶段13 获客与转化（引流 → 线索）方案（13A 后端地基 ✅ / 13B 前端触点 ✅ / 13C 管理台「线索」Tab ✅ / 13D 一键结果分享图 ✅ / 13E 漏斗埋点 ✅，阶段13 已全部交付） | 2026-09-13 |

### 使用与开发指南

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [guides/tax-calculation-rules.md](guides/tax-calculation-rules.md) | 计税规则手册（综合所得/经营所得/反向倒算等） | 2026-08-04 |
| [guides/ui-component-reuse-guide.md](guides/ui-component-reuse-guide.md) | 前端 UI 组件复用指南（Sticky 导航/卡片渲染/事件委托等） | 2026-08-05 |
| [guides/responsive-rules-reference.md](guides/responsive-rules-reference.md) | 响应式规则维护手册（规则+性能数据+验证方法） | 2026-09-07 |
| [guides/development-workflow.md](guides/development-workflow.md) | 开发工作流总览（启动/验证/发布/回滚/排障，按钮命名权威定义） | 2026-09-12 |
| [guides/branch-release-strategy.md](guides/branch-release-strategy.md) | 分支与版本发布策略（主干模型/命名/版本三落点/自动打 tag/回滚） | 2026-09-08 |
| [guides/gui-button-reference.md](guides/gui-button-reference.md) | GUI 开发控制台按钮速查（110 按钮基线 + 邀请码管理增量） | 2026-08-16 |
| [guides/support-playbook.md](guides/support-playbook.md) | 客服排障手册（发布后用户问题的处理路径与话术，配套管理台「排障」Tab） | 2026-09-12 |

### 项目报告

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [reports/final-delivery-checklist.md](reports/final-delivery-checklist.md) | 最终交付清单（交付物总览/质量验收） | 2026-09-07 |
| [reports/refactor-summary-report.md](reports/refactor-summary-report.md) | 重构成果汇总报告（三批次+Phase 4） | 2026-08-05 |
| [reports/test-report.md](reports/test-report.md) | 测试报告（单元测试 203/203 全通过） | 2026-09-07 |

### 市场推广

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [marketing/cold-start-materials.md](marketing/cold-start-materials.md) | 首批测试用户冷启动素材（文案/渠道/注册指引/反馈观察） | 2026-09-07 |

### 技术报告

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [tech-reports/watchdog-deployment-guide.md](tech-reports/watchdog-deployment-guide.md) | Watchdog 监控与邮件通知系统部署指南 v1.3（本地运维） | 2026-09-07 |
| [tech-reports/watchdog-notification-and-event-log-spec.md](tech-reports/watchdog-notification-and-event-log-spec.md) | 守护脚本邮件通知与事件日志规范 v4.0（通知/日志唯一真源；§8 含 URL 邮件密集发送排查会话，OPEN） | 2026-09-07 |
| [tech-reports/troubleshooting-sop-template.md](tech-reports/troubleshooting-sop-template.md) | 故障排查 SOP 标准模板 v1.0（复用模板） | 2026-08-10 |
| [tech-reports/health-check-report-template.md](tech-reports/health-check-report-template.md) | 部署后健康检查报告模板 v1.0（含一键检查脚本） | 2026-08-10 |
| [tech-reports/mock-client-concurrent-logging-retrospective.md](tech-reports/mock-client-concurrent-logging-retrospective.md) | MockClient 并发日志乱序问题技术复盘 | 2026-08-05 |

---

## 快速导航

### 项目概览与启动

1. 阅读 [项目根 README](../README.md) 了解架构与快速启动
2. 参考 [开发计划](development/development-plan.md) 了解阶段进度
3. 按 [API 接口文档](api/api-reference.md) 对接前后端
4. 版本变更见 [CHANGELOG.md](../CHANGELOG.md)

### 日常开发

- 计税逻辑：[计税规则手册](guides/tax-calculation-rules.md)
- 前端复用：[UI 组件复用指南](guides/ui-component-reuse-guide.md)
- 响应式适配：[响应式规则维护手册](guides/responsive-rules-reference.md)
- GUI 按钮：[GUI 按钮速查](guides/gui-button-reference.md)
- 全流程：[开发工作流总览](guides/development-workflow.md)（启动/验证/发布/回滚/排障）
- 分支/版本/回滚：[分支与版本发布策略](guides/branch-release-strategy.md)
- 接口联调：[API 接口文档](api/api-reference.md)

### 部署

- **生产（Zeabur）**：推送 main 分支自动构建 `Dockerfile` → Prisma migrate deploy → 启动服务；详见 [开发计划 阶段 5/6/7](development/development-plan.md) 与 [部署健康检查模板](tech-reports/health-check-report-template.md)
- **本地开发**：`npm run dev`（SQLite + 内网穿透 + watchdog，详见 [运维脚本目录](../tools/ops/README.md)）

### 故障排查

| 场景 | 参考文档 |
|------|---------|
| 邮件发送失败 | [部署指南 8.1](tech-reports/watchdog-deployment-guide.md#八故障排查) |
| SMTP 端口被防火墙拦截 | [部署指南 8.6](tech-reports/watchdog-deployment-guide.md#86-smtp-端口被防火墙拦截) |
| watchdog 未检测到异常 | [部署指南 8.2](tech-reports/watchdog-deployment-guide.md#八故障排查) |
| 公网 URL 未检测到变更 | [部署指南 8.3](tech-reports/watchdog-deployment-guide.md#八故障排查) |
| 后端服务频繁重启 | [部署指南 8.4](tech-reports/watchdog-deployment-guide.md#八故障排查) |
| cpolar 隧道频繁断连 | [部署指南 8.5](tech-reports/watchdog-deployment-guide.md#八故障排查) |
| 通用故障排查流程 | [SOP 模板](tech-reports/troubleshooting-sop-template.md) |

### 监控运维（本地开发环境）

| 任务 | 参考文档 |
|------|---------|
| 启动 watchdog | [部署指南 第五章](tech-reports/watchdog-deployment-guide.md#五启动方式) |
| 查看日志 | [部署指南 6.1](tech-reports/watchdog-deployment-guide.md#六日志系统) |
| 修改邮件模板 | [部署指南 9.2](tech-reports/watchdog-deployment-guide.md#九维护操作) |
| 添加收件人 | [部署指南 9.3](tech-reports/watchdog-deployment-guide.md#九维护操作) |
| 通知与日志规范 | [通知与事件日志规范](tech-reports/watchdog-notification-and-event-log-spec.md) |

---

## 故障排查档案

> 每次完成故障排查后，在此表格登记一行，并在 `tech-reports/` 下归档完整 SOP 文档。

| 日期 | 故障名称 | 等级 | 状态 | 归档文档 |
|------|---------|------|------|---------|
| 2026-08-15 | 公网 URL_CREATED/URL_CHANGED 邮件密集发送 | 中 | 会话记录 OPEN（并入规范 §8） | [通知与事件日志规范 §8](tech-reports/watchdog-notification-and-event-log-spec.md#八已知问题与排查记录) |

> 归档文档命名规范：`troubleshooting-<故障简称>-<YYYYMMDD>.md`，基于 [SOP 模板](tech-reports/troubleshooting-sop-template.md) 填写。

---

## 文档维护规范

### 新增文档

1. 确定文档类型，放入对应子目录：
   - 接口规范 → `api/`
   - 开发计划 → `development/`
   - 使用指南 → `guides/`
   - 市场推广 → `marketing/`
   - 项目报告 → `reports/`
   - 技术规范/复盘/部署 → `tech-reports/`
2. 在本文件的"文档清单"对应分类下添加一行
3. 如涉及故障排查，同步更新"故障排查档案"表格

### 文档命名规范

- 使用小写字母 + 连字符（kebab-case）
- 技术报告以模块名开头：`watchdog-xxx.md`、`troubleshooting-xxx.md`
- 版本号写在文档头部，不在文件名中体现

### 文档版本管理

- 每次修改更新文档头部的"最后更新"日期
- 重大修改提升版本号（v1.0 → v1.1）
- 保留变更说明在文档末尾或 CHANGELOG.md 中

---

## 相关资源

- [项目根 README](../README.md) — 项目简介与快速启动
- [GUI 开发控制台说明](../tools/gui/README.md) — GUI 工具使用说明（含覆盖式滚动条 v3.2 技术细节）
- [运维脚本目录](../tools/ops/README.md) — watchdog/notify/start-dev 脚本说明
- [CHANGELOG.md](../CHANGELOG.md) — 版本变更记录
- [项目 .trae/rules](../.trae/rules/) — 工程规范（Git 提交信息等）
