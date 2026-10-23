# 改了东西之后：该说什么、我会跑什么

> 面向「我改完了，接下来呢」。配套的 8 步发布清单见
> [development-workflow.md](development-workflow.md) 的「标准发布清单（8 步）」。

## 一、一句话指令 → 我实际执行的命令

你说一句，我按对应档位跑完并汇报结果（不用你把命令背下来）：

| 你说 | 我执行 |
|---|---|
| 「跑一遍门禁」 | `npm test` + `npm run verify:local`（266 项） |
| 「看看现在发到哪了」 | `npm run status:release` |
| 「发预发」（或「发 beta 我看效果」） | `ops-deploy-beta.ps1` → `ops-check-beta.ps1`（37 项） |
| 「跑冒烟」 | 开 SSH 隧道 → `npm run smoke:beta`（7 步，登录后的链路） |
| 「发正式」 | `ops-deploy.ps1` → `ops-check-prod.ps1`（37 项）→ 台账 `--write` + `git tag` |
| 「发版」（= 走完整个流程） | 升版本五处 + CHANGELOG → 门禁 → 自检 → push → 发 beta → 发正式 → 台账 + 标签 |
| 「回滚」 | `ops-deploy.ps1 -Rollback`（软链指回上一版，约 1 分钟） |
| 「看 41 个工具还出不出数」 | `npm run smoke:ui`（真机逐个算一遍，**不写留痕**，跑完还原 localStorage） |
| 「拍个视觉对比」 | `node tools/ops/ui-screenshot-baseline.js`（浅色 + 深色各 12 张） |
| 「本地起服务」 | `powershell -File tools/ops/ops-start-dev.ps1`（`:3000`，可加 `-Share` 出公网地址给朋友看） |

## 二、按改动分三档：走哪条路由改动性质决定

判断标准只有一条：**这个改动错了，用户会看到什么？**

| 档 | 包含 | 必须过 beta 吗 |
|---|---|---|
| **A 档** | 排版、文案、样式、单模块小修 | **不用**（可直接发正式） |
| **B 档** | 工具的计算逻辑、结果展示、新增/改工具 | **要**（算错是核心风险） |
| **C 档** | `schema.prisma`/迁移、认证、兑换码、留资、邮件、大范围 UI 重构 | **必须**，且加 `verify:pg` |

C 档为什么强制：迁移的**首次执行不能发生在生产库上**，而正式站是软链一指的全量瞬切、没有灰度。

---

## 三、A 档：改了 UI 排版，想看效果

### 1. 看效果（两条路）

| 方式 | 命令 | 适合 |
|---|---|---|
| 本地看 | `powershell -File tools/ops/ops-start-dev.ps1` → 浏览器开 `http://localhost:3000` | 快速迭代，改一行刷一次 |
| 公网看（手机/朋友） | 发 beta：`ops-deploy-beta.ps1` → 开 `https://beta.euriskotax.com`（Basic Auth 见本机凭证档） | 真机、不同屏幕、给别人看 |

本地起服务时 `-Share` 会出 cpolar 公网地址（临时分享用），`-Watchdog` 防中断。

### 2. 改样式有两个坑，踩了就白改

- **必须 `npm run build:css`**：`src/css/tailwind.css` 是**入库的编译产物**，
  改了 `tailwind.src.css` 或新增 class 不重新编译，**线上不会有任何变化**（本地预览也一样）。
- **深色模式是另一套值**：`tokens.css` 的 `.dark` 段里阴影靠"更黑"不靠"更灰"，
  透明度是 .30/.40/.50 —— **浅色看着对，证明不了深色没问题**。改样式两个主题都要看。

### 3. 发之前顺手跑的三件事

```powershell
npm run check:cascade                        # 级联守卫（样式串味）
node tools/ops/ui-contrast-audit.js          # 对比度审计（改了颜色必跑）
node tools/ops/ui-screenshot-baseline.js     # 视觉基线对比（结构性排版改动建议跑）
```

### 4. 发

A 档可直接发正式：`ops-deploy.ps1`（先 `-DryRun` 预览）→ `ops-check-prod.ps1`（37 项）。
版本号照升（`Z` 位），CHANGELOG 写一行，台账 `--write` + 打标签。

---

## 四、B 档：改了工具的功能和展示

工具是产品核心（41 个），这类改动的风险是**算错而没人发现**——页面上照样有数字。

### 1. 改计算逻辑

```powershell
npm test                 # 单测（130 套件）
npm run smoke:ui         # 真机把 41 个工具各算一遍：出不出数、抛不抛错、深侧徽标在不在
npm run verify:local     # 266 项端到端
```

`smoke:ui` 只报不修、不写留痕（跑前快照 localStorage、跑后整份还原），
这一点很重要：**41 次测算灌进历史的话，"我算过什么"就被污染了**，后面的截图基线也会跟着脏。

### 2. 改展示（结果卡、徽标、列表）

`npm run smoke:ui` + 视觉基线；涉及颜色加对比度审计。

### 3. 走 beta（B 档必须）

```powershell
ops-deploy-beta.ps1      # 发预发
ops-check-beta.ps1       # 37 项指纹
npm run smoke:beta       # 7 步：登录 → 算一笔 → 云端同步 → 内容 → 留资
```

### 4. 发正式

`ops-deploy.ps1` → `ops-check-prod.ps1` → 台账 `--write` + 标签。

---

## 五、我替你做的固定动作（不用你提）

每次发版我会按 8 步清单走完，其中这几步**不会跳过**：

1. **版本五处同步**（`package.json` / `version.json` / `index.html` ×2 / `CHANGELOG.md`）——
   漏改会让用户每次新会话清一次缓存；
2. `npm run verify:release`——版本一致 + 文档口径与实测一致；
3. `npm run status:release`——确认当前发到哪了（预发落后于正式会报警）；
4. 发完更新台账并打标签（部署脚本不打标签）。

改动落库后 **push 即触发 CI**（`.github/workflows/ci.yml`）：`npm test` + `verify:local` + `verify:release`。
它证明的是"仓库绿"，**不碰线上**。
