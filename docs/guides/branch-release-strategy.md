# EuriskoTax 分支与版本发布策略

> 最后更新：2026-09-08（v1.0）
> 配套文档：[开发工作流总览](development-workflow.md) / [CHANGELOG.md](../../CHANGELOG.md)
> 生效范围：单人/小团队 + 生产环境（Zeabur 从 main 自动部署）场景

---

## 1. 目标

让**开发 → 测试 → 上线 → 回滚**都有清晰、可复制的路径：

1. `main` 永远处于**可发布**状态（禁止在 main 上提交半成品）。
2. 所有"上线"动作只走唯一入口 `ops-publish.ps1`（本地验证门禁全绿 → 提交 → push → 线上指纹核对）。
3. 每次发布都对应一个语义化版本 + 一个 git 标签（`vX.Y.Z`），可一键回溯/回滚。
4. 历史归档使用 tag，不使用常驻 `archive/` 分支。

---

## 2. 分支模型：Trunk-based（主干开发）+ 短生命周期分支

> 现状盘点：仓库只有 `main` + 两个 `archive/*` 只读快照，历史上曾短暂存在 `develop`/`staging` 后已删除。
> 结论：**不引入常驻 develop/staging 分支**（单人维护成本高），采用"主干开发 + 按需短分支"。

### 2.1 分支命名规范

| 分支 | 命名规则 | 来源 | 何时用 | 存活期 |
|------|---------|------|--------|--------|
| 生产主干 | `main` | — | 唯一长期分支；所有发布都从此分支切出并合回 | 长期 |
| 功能分支 | `feature/<简述>` | main | 需要多步/多文件的新功能，或想先验证不污染 main | 短（完成即删） |
| 修复分支 | `fix/<简述>` | main | 非紧急缺陷修复、重构、样式调整 | 短 |
| 热修分支 | `hotfix/<简述>` | main（生产对应 tag） | 线上紧急修复，需尽快单独走一次安全发布 | 极短 |
| 文档分支 | `docs/<简述>` | main | 纯文档/文案/规范更新 | 短 |
| 存档分支 | `archive/*` | — | **只保留历史**（现存 `v1.0-static-frontend`、`v1.2-fullstack-gui`），不再新建 | 只读 |

### 2.2 该不该开分支（单人决策表）

| 场景 | 做法 |
|------|------|
| 单个小改动、< 5 个文件、改完即可自测通过 | 直接在 main 改，走 `ops-publish` 上线 |
| 新功能 / 大重构 / 涉及前后端多模块 / 想留中间快照 | 开 `feature/` 分支，合并回 main 后删除 |
| 线上出问题、需要最快速度只带最小改动上线 | 开 `hotfix/`，从**线上 tag** 附近切出更稳，改完走安全发布 |
| 纯文档 | 可直接 main 提交；量大时可开 `docs/` 分支 |

### 2.3 合并纪律

- 合回 main 前：`npm test` + `verify:local` 通过（与安全发布门禁一致）。
- 单人仓库不强制 PR（GitHub 可后续按需加保护），但**上线永远走 `ops-publish`**，禁止 GUI/命令行直接 push main。
- `feature/` 合并回 main 建议 `--no-ff`，保留分支语义；合完删除本地与远程分支。

---

## 3. 版本管理（SemVer + Keep a Changelog）

### 3.1 版本号三位语义

| 位 | 何时递增 | 示例 |
|----|---------|------|
| `x`（主版本） | 破坏性变更 / 重大里程碑 | 2.0.0 |
| `y`（次版本） | 向后兼容的新功能 | 1.7.0 |
| `z`（修订号） | Bug 修复 / 文案 / 文档 / 非功能调整 | 1.6.1 |

### 3.2 版本号的三个落点（必须同步）

1. `package.json` → `version`
2. `index.html` 关于弹窗 → `版本 X.Y.Z`
3. `CHANGELOG.md` → 顶部最新条目标题

> 历史教训：曾出现 package.json 与 CHANGELOG 不同步（如 1.5.1/1.6.0 错位），发布时按下方 checklist 强制三处同改。

### 3.3 发布前新增内容怎么写

日常开发产生的变更，**随时追加**到 `CHANGELOG.md` 顶部“未发布”暂存（按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 分组：`新增/变更/修复/安全`）。
发布时把暂存条目归档为正式版本标题（`## [X.Y.Z] - YYYY-MM-DD`），并同步版本号三落点。

---

## 4. 发布流程（每次版本发布的固定动作）

> 发布命令（推荐）：`.\tools\ops\ops-publish.ps1 -CommitMsg "chore(release): 发布 vX.Y.Z"`
> 脚本在 push 成功后会自动创建/推送 `vX.Y.Z` 标签（已存在则跳过）。

### Checklist（发布人逐项确认）

1. [ ] CHANGELOG 已按 3.3 归档本次变更（含日期）
2. [ ] `package.json`、关于弹窗版本号已改为 `X.Y.Z`
3. [ ] 本地 `npm test` + `verify:local` 全绿（ops-publish 会自动再跑一遍）
4. [ ] 执行 `ops-publish.ps1` → 等待线上指纹核对通过
5. [ ] 核对远程已出现 `vX.Y.Z` 标签：`git ls-remote --tags origin`
6. [ ] （可选）GitHub Releases 按新标签发布说明，粘贴 CHANGELOG 摘要

### 若不需要升级版本（纯补丁推进）

多次小修复共享同一版本号时：**只打一次 tag**（该版本最后一次发布后自动打），
期间其余 push 因 tag 已存在自动跳过 —— `ops-publish` 的自动打 tag 是幂等的。

---

## 5. 打 tag 规范

### 5.1 规则

- 命名：`vX.Y.Z`（前导小写 `v`），**注释标签**：`git tag -a vX.Y.Z -m "release vX.Y.Z"`
- 位置：发布提交（该版本 CHANGELOG 归档的 commit）上
- 工具：`ops-publish.ps1` 发布成功后自动创建并推送；手动示例：

```powershell
git tag -a v1.6.1 -m "release v1.6.1"
git push origin v1.6.1
```

### 5.2 历史标签回填记录（2026-09-08）

补打历史版本锚点（基于 CHANGELOG 该版本归档 commit），用于回溯与回滚：

| 标签 | 锚点 commit | 依据 |
|------|------------|------|
| v1.5.0 | `d255e7e3b5499082f91eb29636297dff9bd98e5f` | CHANGELOG [1.5.0] 归档 commit |
| v1.5.1 | `2e2c8b5aabc3b145facdc8f61ac51242ab007483` | CHANGELOG [1.5.1] 归档 commit |
| v1.5.2 | `e9b90c962c9f1468f5fa4b118d00b46ade90a4b2` | CHANGELOG [1.5.2] 归档 commit |
| v1.6.0 | `e1e9bab68fca04607df41465a6a126316c8cedf4` | CHANGELOG [1.6.0] 归档 commit |
| v1.6.1 | 本次发布 commit | 见 CHANGELOG [1.6.1] |

> 说明：v1.3.0 / v1.4.0 因历史上多次 rebase、commit 时间与 CHANGELOG 日期无法一一对应，
> 刻意**不强行补 tag**，避免误导；旧版可继续用 `archive/*` 分支查看。

---

## 6. 回滚策略

### 6.1 线上出问题时的优先顺序

1. **Revert 提交再发布**（推荐）：`git revert <坏commit>` → 冲突解决 → `ops-publish.ps1` 上线。
   保留历史，符合 trunk 模型；若坏提交后已有正常发布，只 revert 坏的那批。
2. **切回旧版本 tag 快照**：`git checkout v1.6.0` 只能本地查看，**不能直接 push 覆盖 main**
   （会丢历史）。确需整体回退时用 `git revert <tag>..main` 批量回退后走安全发布。
3. **临时下线**：Zeabur 控制台回滚到上一构建版本（不改代码的应急手段）。

### 6.2 禁止

- 禁止 `git reset --hard` 后 `push -f` 到 main（会破坏远端历史与所有人协作）。
- 禁止绕过 `ops-publish` 直接 push 线上。

---

## 7. 长期演进（何时再引入更重流程）

| 触发条件 | 演进方案 |
|----------|---------|
| 出现第 2 名开发者频繁协作 | 引入 PR 审查 + GitHub main 分支保护（require PR / status check） |
| 需要独立"预发布/灰度"环境 | 新增 `develop` 分支 + 独立 Zeabur 项目自动部署，验收后 merge main 再上线 |
| 发布频率升高、多版本并行 | 引入 `release/*` 短分支 + 语义化 release 流程 |

当前阶段（单人、频率不高、单生产环境）**不建议**提前引入以上机制。

---

## 8. 相关文档

- [开发工作流总览](development-workflow.md)：启动/验证/发布/回滚/排障全流程
- [GUI 按钮速查](gui-button-reference.md)：Git & 账号面板等 GUI 操作对应按钮
- [git 提交信息规范](../../.trae/rules/git-commit-message.md)
- [CHANGELOG.md](../../CHANGELOG.md)：版本变更记录
