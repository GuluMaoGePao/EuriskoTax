# main 分支拆分记录（2026-09-18）

> 记录日期：2026-09-18
> 性质：仓库维护操作（不是功能版本发布，**不动版本号五处落点，不改 CHANGELOG**）
> 一句话：**main 退回 2026-09-14 的锚点 `4f381e8`，v1.25.0 ~ v1.37.11 与当时未入库的开发内容全部迁到 `feature/stage15-17-wip`，等开发完再合回 main。**

---

## 1. 为什么要拆

阶段 15（多税种落地页）开工后，30 个提交（v1.25.0 落地页开局 → v1.37.11 合规措辞）连同 98 个未入库文件直接堆在 `main` 上，且本地 `main` 与 `origin/main` 完全一致 —— 也就是说**半成品已经推到了主干，公网看到的也是半成品**。

主干的状态与「可以对外展示的稳定版」不再是一回事，继续在 `main` 上开发会让下面两件事没法做：

1. 想发一个稳定版时，无法从主干直接发（主干里混着未完成的阶段 15–17 内容）；
2. 想回退时只能靠 `revert` 逐个撤销，历史里留一串来回。

所以把主干**复位到最后一个「干净锚点」**，新开发内容整体挪到特性分支，主干只承担「对外展示」这一件事。

## 2. 锚点与拆分范围

| 项 | 值 |
|---|---|
| 锚点提交 | `4f381e8a48cda9d476864fd762cfecd4d820e747` |
| 锚点标题 | `feat(gui): 快捷入口新增文档导出功能`（2026-09-14 22:38） |
| 迁出的已提交内容 | 30 个提交（v1.25.0 ~ v1.37.11），原 `main` / `origin/main` 头 `38a4a41` |
| 迁出的未入库内容 | 66 个已修改文件 + 32 个未跟踪新文件（含 `src/js/calculation/solver.js`、`src/js/ui/deep-wizard-ui.js`、`src/js/data/draft-store.js`、`docs/guides/ui-design-spec.md`、`deploy/lighthouse/`、`tools/ops/deploy-lighthouse.ps1` 及多个新测试），落成 `feature` 分支上的 wip 提交 `2793895` |
| 锚点对应版本 | **v1.17.0**（`version.json` / `package.json` / `index.html` 五处落点均未改动） |

## 3. 操作顺序（关键：先落盘再复位，全程零丢失）

```powershell
# ① 先建保护点（同一 HEAD 的分支 + 标签）
git branch backup/main-before-split-20260918
git tag    backup/main-38a4a41-before-split-20260918
git branch feature/stage15-17-wip            # 指向 38a4a41

# ② 把未入库的 98 个文件先提交进新分支（此时 main 还没动，不可能丢东西）
git switch feature/stage15-17-wip
git add -A
git commit -m "wip: 拆分前工作区快照（阶段15-17 新内容…）"   # → 2793895

# ③ 复位 main（指针回退，不删对象；内容已在 ② 落盘）
git switch -C main 4f381e8a48cda9d476864fd762cfecd4d820e747

# ④ 远端副本 + 远端 main 回退
git push -u origin feature/stage15-17-wip
git push origin backup/main-before-split-20260918
git push --force-with-lease=main:38a4a41 origin main
```

**顺序不可颠倒**：所有内容在进入 `main` 被丢弃之前，就已经是 `feature` 分支上的一个提交；`backup` 分支是第二份副本。因此第 ③ ④ 步无论怎么失败都不会丢内容。

## 4. 拆分后的引用位置

| 引用 | 提交 | 说明 |
|---|---|---|
| `main`（本地 + 远端） | `4f381e8` | 对外展示的稳定版，版本 v1.17.0 |
| `feature/stage15-17-wip`（本地 + 远端） | `2793895` | 继续开发的分支：30 个提交 + 1 个 wip 提交 |
| `backup/main-before-split-20260918`（本地 + 远端） | `38a4a41` | 拆分前原状，保底 |
| `backup/main-38a4a41-before-split-20260918`（本地标签） | `38a4a41` | 同上，标签形式，不会被分支清理误删 |

## 5. 对公网的影响（重要）

远端 `main` 收到 push 后由 Zeabur 自动构建 `Dockerfile` → `prisma migrate deploy` → 重启服务，因此**公网会回到 v1.17.0**：

- 阶段 15 的 SEO 落地页（`/seo/vat.html`、`/seo/corporate-income-tax.html`、`/seo/surtax-stamp-duty.html`、`/seo/social-base.html`、`/seo/net-salary.html`、`/seo/employer-cost.html`、`/seo/disability-fund.html`、`/seo/business-income.html`）**从线上消失**；
- v1.35 ~ v1.37 的企业微信活码、留资合规措辞、速算器 PDF 导出**同样回退**；
- 数据库是**正向迁移**，本次回退不需要回滚迁移 —— 线上 `Lead` 表多出的 `city` / `province` 列留着无害，代码不写即可；
- 老用户浏览器里的旧 Service Worker 会由 `index.html` 的版本哨兵 `StaleGuard` 处理：发现 `/version.json` 与页面 `__APP_VERSION__` 不一致会自动清缓存重载。版本号五处未改（仍是 1.17.0），与锚点一致，不会触发误清。

若用户反馈「页面回到旧版」，这是预期结果，不是故障。

## 6. 如何合回

```powershell
git switch main
git merge --no-ff feature/stage15-17-wip   # 快进合并即可，无需强推
git push origin main
```

合回前建议先把 wip 提交 `2793895` 拆成若干语义提交（`git reset --soft HEAD~1` 后分批提交），避免 98 个文件挤在一个提交里。

合回时按 `docs/guides/development-workflow.md` 走「安全发布」入口（`tools\ops\ops-publish.ps1`），别绕过门禁。

## 7. 遗留提醒

- **远端 `main` 已强推**：任何基于 `38a4a41` 拉过代码的机器，需 `git fetch && git reset --hard origin/main`（本地改动先 stash），否则历史分叉。
- **阶段 15 ~ 17 的计划文档**（`docs/development/stage15-multi-tax-plan.md` 等）在锚点版本里仍标注「待开始」，实际进度以 `feature/stage15-17-wip` 分支上的文档为准。
- 本次未改动 `CHANGELOG.md`：它首个 `## ` 小节被 `tools/ops/release-metrics.js` 的口径守护扫描（套件/用例数、门禁项数、指纹数），插入新小节会让该文件的声明脱离扫描范围，进而触发 `tests/docs-metrics.test.js` 的「至少覆盖 5 处」断言。日后若要在 CHANGELOG 记录本次回退，把内容写进既有小节或同步补齐数字声明。
