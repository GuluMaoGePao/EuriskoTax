# EuriskoTax 文档中心

> 最后更新：2026-08-10
> 维护原则：按用途分类存放，本文件为统一入口索引

---

## 目录结构

```
EuriskoTax/
├── src/                               # 前端源码（主项目）
├── server/                            # 后端源码（主项目）
├── tests/                             # 测试代码
├── scripts/                           # 运维脚本（watchdog/notify/start-dev + 通知配置）
│   └── README.md                      # 脚本目录说明
├── docs/                              # 项目文档
│   ├── README.md                      # 本文件（文档索引）
│   ├── api/                           # API 接口文档
│   ├── development/                   # 开发规划
│   ├── guides/                        # 使用与开发指南
│   ├── reports/                       # 项目报告（交付/重构/测试）
│   └── tech-reports/                  # 技术报告（规范/复盘/部署/SOP）
├── images/                            # 项目图片资源
├── cpolar/                            # cpolar 内网穿透工具
├── index.html                         # 前端入口
├── package.json                       # npm 配置
├── zeabur.json                        # 部署配置
├── README.md                          # 项目入口
└── CHANGELOG.md                       # 变更记录
```

> **职责分离原则**：主项目代码（src/、server/）与运维脚本（scripts/）分离，测试代码（tests/）独立，文档统一归档在 docs/。

---

## 文档清单

### API 接口

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [api/api-reference.md](api/api-reference.md) | 后端 REST API 接口规范（认证/计税/用户等） | 2026-08-04 |

### 开发规划

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [development/development-plan.md](development/development-plan.md) | 项目开发计划、里程碑、技术选型 | 2026-08-10 |

### 使用与开发指南

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [guides/tax-calculation-rules.md](guides/tax-calculation-rules.md) | 计税规则手册（综合所得/经营所得/反向倒算等） | 2026-08-04 |
| [guides/ui-component-reuse-guide.md](guides/ui-component-reuse-guide.md) | 前端 UI 组件复用指南（Sticky 导航/卡片渲染/事件委托等） | 2026-08-05 |

### 项目报告

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [reports/final-delivery-checklist.md](reports/final-delivery-checklist.md) | 最终交付清单（交付物总览/质量验收） | 2026-08-05 |
| [reports/refactor-summary-report.md](reports/refactor-summary-report.md) | 重构成果汇总报告（三批次+Phase 4） | 2026-08-05 |
| [reports/test-report.md](reports/test-report.md) | 测试报告（单元测试/浏览器交互测试） | 2026-08-05 |

### 技术报告

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [tech-reports/watchdog-deployment-guide.md](tech-reports/watchdog-deployment-guide.md) | Watchdog 监控与邮件通知系统部署指南 v1.0 | 2026-08-10 |
| [tech-reports/watchdog-notification-and-event-log-spec.md](tech-reports/watchdog-notification-and-event-log-spec.md) | 守护脚本邮件通知与事件日志规范 v3.0 | 2026-08-10 |
| [tech-reports/troubleshooting-sop-template.md](tech-reports/troubleshooting-sop-template.md) | 故障排查 SOP 标准模板 v1.0（复用模板） | 2026-08-10 |
| [tech-reports/health-check-report-template.md](tech-reports/health-check-report-template.md) | 部署后健康检查报告模板 v1.0（含一键检查脚本） | 2026-08-10 |
| [tech-reports/mock-client-concurrent-logging-retrospective.md](tech-reports/mock-client-concurrent-logging-retrospective.md) | MockClient 并发日志乱序问题技术复盘 | 2026-08-05 |

---

## 快速导航

### 首次部署

1. 阅读 [部署指南](tech-reports/watchdog-deployment-guide.md) 完成环境搭建
2. 参考 [开发计划](development/development-plan.md) 了解项目全貌
3. 按 [API 接口文档](api/api-reference.md) 对接前后端

### 日常开发

- 计税逻辑：[计税规则手册](guides/tax-calculation-rules.md)
- 前端复用：[UI 组件复用指南](guides/ui-component-reuse-guide.md)
- 接口联调：[API 接口文档](api/api-reference.md)

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

### 监控运维

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
| _示例_ | _SMTP 端口被防火墙拦截_ | _P1_ | _已解决_ | _troubleshooting-smtp-firewall-20260810.md_ |
| | | | | |

> 归档文档命名规范：`troubleshooting-<故障简称>-<YYYYMMDD>.md`，基于 [SOP 模板](tech-reports/troubleshooting-sop-template.md) 填写。

---

## 文档维护规范

### 新增文档

1. 确定文档类型，放入对应子目录：
   - 接口规范 → `api/`
   - 开发计划 → `development/`
   - 使用指南 → `guides/`
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
- [运维脚本目录](../scripts/README.md) — watchdog/notify/start-dev 脚本说明
- [CHANGELOG.md](../CHANGELOG.md) — 版本变更记录
- [项目 .trae/rules](../.trae/rules/) — 工程规范（Git 提交信息等）
