# EuriskoTax 文件管理规范（2026-08-16 v1.0 · 2026-09-06 v1.1 · 2026-09-07 v1.2 · 2026-09-07 v1.3 · 2026-09-14 v1.4 · **2026-09-20 v1.7**）

> 本规范覆盖 EuriskoTax 项目**所有文件**的存放位置、命名规则、编码要求、修改流程、验证步骤。**任何文件新增 / 移动 / 删除 / 重命名 / 格式调整，必须先查阅本规范并严格按流程执行**。

---

## 一、目录结构总览（批准的固定结构）

```
EuriskoTax/
├─ README.md                          ← 项目主说明（仅根目录保留一份 README.md）
├─ CHANGELOG.md                       ← 版本变更记录（仅根目录保留）
├─ index.html                         ← 前端入口
├─ package.json / package-lock.json   ← 依赖清单（含测试脚本）
├─ Dockerfile                         ← Zeabur 生产部署入口（启动前 prisma migrate deploy）
├─ manifest.json / service-worker.js  ← PWA 应用清单与离线缓存（v1.4.0）
├─ .gitignore                         ← Git 忽略规则（路径变更必须同步改）
│
├─ docs/                              ← 📚 全部 .md 文档（本规范核心目录）
│   ├─ README.md                      ← 文档入口索引（目录内 README 惯例）
│   │
│   ├─ api/                           ← API 参考类
│   │   └─ api-reference.md
│   │
│   ├─ guides/                        ← 🟢 使用指南 / 操作手册 / 参考手册（13 份）
│   │   ├─ ui-design-spec.md          ← ★ **UI 唯一权威**（开发唯一执行依据，2026-09-17 定稿）
│   │   ├─ deep-wizard-ui-spec.md     ← 子文档：多步测算向导排版细则（阶段17 已落地）
│   │   ├─ site-structure-map.md      ← 子文档：站点现状测绘 as-is（全附代码行号）
│   │   ├─ ui-ux-master-plan.md       ← 🔵 论证过程稿（90KB，结论已并入权威，日常不必读）
│   │   ├─ dual-end-ui-plan.md        ← 🔵 Phase 0 实施记录（S0–S8 已完成，只回查）
│   │   ├─ tax-calculation-rules.md   ← 计税规则权威
│   │   ├─ coding-rules-reference.md  ← 编码约定速查（每条标注出处）
│   │   ├─ development-workflow.md    ← 开发工作流 / 按钮命名权威定义
│   │   ├─ branch-release-strategy.md ← 分支与版本发布策略
│   │   ├─ responsive-rules-reference.md
│   │   ├─ ui-component-reuse-guide.md
│   │   ├─ gui-button-reference.md    ← GUI 110 按钮功能参考（2026-08-16 审计基线）
│   │   └─ support-playbook.md
│   │
│   ├─ development/                   ← 🟡 开发规范 / 计划 / 工程决策（11 份）
│   │   ├─ development-plan.md        ← **总进度与里程碑（阶段状态表唯一真源）**
│   │   ├─ file-management-policy.md  ← ⭐ 本文档（你正在看的这个）
│   │   ├─ stage19-ui-redesign-plan.md   ← 🚧 进行中（19-0 ~ 19-3 已交付）
│   │   ├─ stage17-full-tax-coverage-plan.md ← 核心卖点，✅ 已收官（只回查）
│   │   ├─ stage18-spec-driven-followup.md   ← 🟢 大部分完成，剩两项待定（2026-09-20 首次建档）
│   │   ├─ stage16-migration-and-compliance-plan.md ← ⏳ 阻塞于 ICP 备案
│   │   ├─ stage15-multi-tax-plan.md / seo-landing-plan.md   ← ✅ 已关闭（只回查）
│   │   └─ stage10 / stage12-core-enhancement / stage12-c1 / stage13  ← ✅ 已关闭（只回查）
│   │
│   ├─ marketing/                     ← 🟢 推广运营素材 / 商业企划
│   │   ├─ cold-start-materials.md    ← 冷启动多渠道文案（注册引导随版本同步）
│   │   ├─ business-plan-for-partners.md ← 合伙人版商业企划（战略 / 盈利模式 / 路线图 / 财务假设，2026-09-14 新增）
│   │   ├─ gtm-execution-plan.md      ← 商业模式落地执行手册（Go/No-Go · 90 天节奏 · 指标看板 · 线索 SOP，2026-09-14 新增）
│   │   ├─ wecom-channel-playbook.md  ← 企业微信按入口分码操作手册（2026-09-16 新增）
│   │   ├─ business-plan-for-partners.docx ← 合伙人版 Word 发送版（**导出件、非真源**）
│   │   └─ gtm-execution-plan.docx    ← 手册 Word 发送版（同上，由 `tools/ops/ops-md2docx.py` 导出；改内容改 `.md` 后重新导出，勿在 Word 里直接改）
│   │
│   ├─ reports/                       ← 测试报告 / 交付清单 / 性能（**均为 🟡 历史快照，数字已过期**）
│   │   ├─ test-report.md
│   │   ├─ refactor-summary-report.md
│   │   ├─ performance-optimization-report.md
│   │   └─ final-delivery-checklist.md
│   │
│   ├─ tech-reports/                  ← 🔵 专题技术报告 / 排查报告 / SOP
│   │   ├─ mock-client-concurrent-logging-retrospective.md  ← 🟡 历史复盘
│   │   ├─ troubleshooting-sop-template.md
│   │   ├─ lighthouse-deployment-guide.md  ← 腾讯云轻量部署与迁移手册（2026-09-16 新增）
│   │   ├─ watchdog-deployment-guide.md
│   │   └─ watchdog-notification-and-event-log-spec.md   ← 通知/日志规范（含 URL 邮件密集去重排查 §8）
│   │
│   └─ admin/                         ← 🔴 敏感文档（含密码/密钥，必须 .gitignore）
│       └─ account-credentials.md     ← 所有账号密码统一管理
│
├─ logs/                              ← 📋 约定的标准日志目录（**已存在**，自带 `README.md` 且已入仓；脚本写的日志仍在 `tools/ops/`，见 §3 迁移落点清单）
│
├─ server/                            ← 后端（Express + Prisma；生产 PostgreSQL、本地 SQLite）
├─ src/                               ← 前端源码
│   ├─ js/                            ← 模块化按功能分子目录（ui/ calculation/ auth/ …）
│   └─ css/                           ← 9 份：`tokens.css`（**设计令牌真源**）/ `tailwind.src.css` → `tailwind.css`（构建产物）
│                                        / `admin.src.css` → `admin.css` / `toolbox.css` / `ui-redesign.css`（阶段19 样式沙箱层）
│                                        / `print.css` / `runtime-env.css`
├─ tests/                             ← Jest 测试（performance/ helpers/ 子目录）
├─ seo/                               ← 21 个 SEO 落地页（`.html`）+ 共用 `landing.css`
├─ images/                            ← 图片 / 图标 / ICO + 构建辅助 PS1
│
└─ tools/                             ← 🔧 辅助工具（带分类前缀）
    ├─ cpolar/                        ← cpolar 二进制
    ├─ gui/                           ← gui-* 前缀：GUI 工具
    │   ├─ gui-dev-console.ps1        ← GUI 主脚本
    │   ├─ _create_shortcut.ps1       ← 内部辅助（下划线前缀）
    │   ├─ EuriskoTax-Console.bat
    │   ├─ EuriskoTax-创建桌面快捷方式.bat
    │   ├─ README.md                  ← 工具内 README 惯例（目录级说明）
    │   ├─ tests/                     ← GUI 相关测试
    │   └─ gui-dev-console.ps1.bak    ← 备份（临时保留，定期清理）
    │
    └─ ops/                           ← ops-* 前缀：运维脚本
        ├─ ops-start-dev.ps1 / ops-watchdog.ps1 / ops-deploy.ps1 / ops-notify.ps1
        ├─ get-token.ps1 / debug-swagger.ps1 / __test-mail-spam-harness.ps1
        ├─ ops-md2docx.py             ← Markdown → Word 发送版导出（Python，依赖 python-docx；真源是 .md）
        ├─ ui-screenshot-baseline.js  ← 视觉回归截图基线（阶段19-0；6 页 × 375/1280 = 12 张入 `screenshots/baseline/`）
        ├─ release-metrics.js         ← 文档口径守护（套件/用例/门禁/指纹项数的唯一统计口径）
        ├─ preflight-release.js       ← 发版前自检（版本号五处 + 文档口径 vs 实测）
        ├─ screenshots/               ← 截图基线产物（`.png` + `manifest.json`，**入仓**）
        ├─ README.md                  ← 工具内 README
        ├─ ops-deploy.config.example.json / ops-notify-templates.json / ops-notify-reason-map.json
        └─ *.log                      ← **当前事实位置**：`watchdog.log` / `events.log` / `notify.log` / `ops-start-share-test.log`（均被 `.gitignore` 的 `*.log` 忽略；迁 `logs/` 的计划与落点清单见 §3.2）
```

---

## 二、文档 (.md) 管理规范

### 2.1 文档分类归属（**必须放到对的二级子目录，不得堆在 docs/ 根目录**）

| 文档类型 | 归属目录 | 命名要求 | 示例 |
|---------|---------|---------|------|
| API 参考 | `docs/api/` | `<对象>-reference.md` | `api-reference.md` |
| 操作指南 / 手册 / 参考 | `docs/guides/` | `<主题>-guide.md` / `<主题>-reference.md` / `<主题>-rules.md` | `gui-button-reference.md` |
| 开发计划 / 规范 / 工程决策 | `docs/development/` | `<主题>-plan.md` / `<主题>-policy.md` | `file-management-policy.md` |
| 测试 / 交付 / 性能**报告** | `docs/reports/` | `<主题>-report.md` / `<主题>-checklist.md` | `test-report.md`、`final-delivery-checklist.md` |
| 技术专题 / 排查记录 / SOP | `docs/tech-reports/` | `<主题>-guide.md` / `<主题>-spec.md` / `debug-<主题>.md` | `watchdog-deployment-guide.md`、`watchdog-notification-and-event-log-spec.md` |
| 商业企划 / 推广运营 | `docs/marketing/` | `<主题>-plan.md` / `<主题>-materials.md` | `business-plan-for-partners.md`、`gtm-execution-plan.md`、`cold-start-materials.md` |
| 账号密码 / 密钥 / 部署凭证 | `docs/admin/` | `<主题>-credentials.md` | `account-credentials.md` |

### 2.2 允许的例外（.md 不在 docs/ 下的白名单）

| 路径 | 原因 |
|------|------|
| `/README.md` | 项目根主说明（GitHub/GitLab 默认显示首页）|
| `/CHANGELOG.md` | 项目根版本日志（IDE 默认识别位置）|
| `/tools/gui/README.md` | 子工具目录级 README（打开目录时第一屏看到）|
| `/tools/ops/README.md` | 子工具目录级 README |
| `/logs/README.md` | **待建**（随 `logs/` 目录一起建；当前日志说明在本文 §3，含标准文件名表 §3.3。要入库需在 `.gitignore` 追加 `!logs/README.md`，见 §6） |
| `/.trae/rules/git-commit-message.md` | IDE 规则，保留在 `.trae/` |

### 2.3 禁止

- ❌ 不在白名单的**散落在项目根目录的 .md**（例如 `debug-mail-spam.md` 原本就在根，违规）
- ❌ 堆在 `docs/` 根下的 .md（例如 `account-credentials.md` 原本就在 docs/ 根，违规；现迁到 `docs/admin/`）
- ❌ 一份文档两个副本（必须决定唯一真源，其余改跳链）
- ❌ 进度/口径在多份文档里各写一份（唯一真源见 §2.4）

### 2.4 文档新鲜度标记（2026-09-20 新增）

文档会过期，「哪份还能信」必须一眼看出，所以：

- **索引侧**：`docs/README.md` 的清单里每份文档带一个标记 —— 🟢 活文档（随代码同步）/ 🔵 过程稿（结论已并入权威）/ 🟡 历史快照（数字已过期，只回查）。
- **文件侧**：被判为 🟡 / 🔵 的文档，要在**文件头部**加一行同名标记块，指回唯一真源（当前进度 → `development-plan.md` 阶段状态表；现状口径 → `CHANGELOG.md` / `docs/README.md`「当前状态」）。
- **阶段收口时**：把该阶段方案从 🟢 改标 🟡，并同步一次 `docs/README.md`「当前状态」的阶段进度。**进度只在 `development-plan.md` 的阶段状态表维护一份** —— 各阶段方案里再写一份进度，正是「状态满天飞、谁都不准」的根因。

---

## 三、日志 (.log) 管理规范

### 3.1 统一输出目录

- **约定目标**：`$ProjectRoot/logs/`（目录**已存在**且自带 `README.md`；`.gitignore` 忽略其中的运行时内容）
- **当前实际**：脚本写的日志在 `tools/ops/`（`watchdog` / `events` / `notify` / `ops-start-share-test` 四个）；
  `logs/` 里目前只有手工重定向留下的 `dev-server.log` / `dev-server.err.log`（脚本里搜不到写它们的命令，属遗留）
- **文件名**：见 §3.3 标准文件名表

### 3.2 为什么不现在迁（2026-09-20 复核）

日志现在**并不散** —— 全在 `tools/ops/` 一处，v1.0 时"根目录散落 .log"的病已经好了。迁到 `logs/`
只剩"位置美观"，代价是动 6+ 处硬编码（含 GUI 控制台那个 110 按钮的脚本），风险明显大于收益。
所以维持 v1.0 的决定：**下次因为别的原因改 ops 脚本时顺手迁**。

**迁移落点清单**（2026-09-20 核实，**行号会漂移，动手前先 grep 确认**）：

```powershell
# 先搜全部落点（不要凭记忆改）
rg -n '\.log' tools --glob '*.{ps1,js,md,json}'
```

| 落点 | 位置 | 要改什么 |
|---|---|---|
| 日志路径变量（3 处） | `tools/gui/gui-dev-console.ps1`「查看看门狗/事件/通知日志」三个按钮 | `Join-Path $OpsDir "xxx.log"` → `Join-Path $LogsDir "xxx.log"` |
| 清空日志列表 | 同上「清空所有日志文件」按钮 | 文件名字面量数组（现在是 `watchdog/events/notify`） |
| 提示文案（4+ 处） | 同上：邮件失败提示、测试邮件结果提示 | 文案里写死的 `tools/ops/notify.log` |
| 子标题文案 | 同上「日志位置：tools/ops/*.log」 | 同步 |
| harness 脚本 | `tools/ops/__test-mail-spam-harness.ps1` | `Join-Path $OpsDir "notify.log"` |
| 工具说明 | `tools/gui/README.md`「日志查看」小节（3 个按钮 + 清空） | 文案里的路径 |

**必须删除的重复日志**：项目根目录下 `watchdog.log` / `notify.log` / `events.log`
（2026-08-16 已清理，是 GUI 异常工作目录产生的冗余副本；以后再出现直接删）。

### 3.3 标准日志文件名表

| 文件 | 谁写的 | 内容 |
|---|---|---|
| `watchdog.log` | `ops-watchdog.ps1` | 守护脚本每次健康检查的结果 |
| `events.log` | `ops-watchdog.ps1` / `ops-start-dev.ps1` | 关键事件（启动 / 停止 / 崩溃 / 重启 / URL 变更） |
| `notify.log` | `ops-notify.ps1` | 每封通知邮件的发送结果（含 `DEDUP-BLOCKED` 去重记录） |
| `ops-start-share-test.log` | `ops-start-dev.ps1` | 本地启动与分享链路的调试输出 |

---

## 四、辅助脚本（.ps1 / .bat）管理规范

### 4.1 位置（Hard Constraints 已固化）

| 分类 | 目录 | 前缀 | 示例 |
|------|------|------|------|
| GUI 相关 | `tools/gui/` | `gui-` | `gui-dev-console.ps1` |
| 运维相关 | `tools/ops/` | `ops-` | `ops-start-dev.ps1` |
| 内部辅助 | 同一工具目录 | 下划线前缀 `_` | `_create_shortcut.ps1` |
| 临时诊断脚本 | 任意相关目录 | `diag-` 或 `__test-` | `images/diag-scrollbar.ps1`、`ops/__test-mail-spam-harness.ps1` |
| 批处理入口 | `tools/gui/` / 根分发点 | 中文语义名，前缀 `EuriskoTax-` | `EuriskoTax-Console.bat`、`EuriskoTax-创建桌面快捷方式.bat` |
| 图片构建脚本 | `images/` | `build-` / `diag-` | `images/build-zoomed-logo.ps1` |
| 文档导出脚本 | `tools/ops/` | `ops-md2docx.py`（Python，非主项目依赖） | `ops-md2docx.py`（Markdown → Word 发送版） |

### 4.2 编码（Hard Constraints）

| 文件类型 | **强制编码** | 原因 |
|---------|-------------|------|
| `.ps1` (PowerShell) | **UTF-8 with BOM**（首 3 字节 `EF BB BF`） | PowerShell 5.1 无 BOM → 中文字符解码乱码 |
| `.bat` / `.cmd` | **GBK**（ANSI/OEM，CP936） | Windows cmd.exe 默认 GBK 解析 |
| `.json` | UTF-8 (无 BOM) | JSON 标准 |
| `.md` / `.js` / `.html` / `.css` / `.py` | UTF-8 (无 BOM) | 跨平台通用 |

### 4.3 Edit 工具丢失 BOM 陷阱（⚠ 高优先级经验）

每次用 IDE 的 Edit / Write 工具链修改 `.ps1` 文件后：**必须立即重验证文件首 3 字节并修复 BOM**（当前 Edit 实现会剥离 BOM）。可靠修复方式（**禁止用文本重保存方式**，避免中文二次漂移）：

```powershell
$f = "path\to\script.ps1"
$b = [IO.File]::ReadAllBytes($f)
$hasBom = ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF)
if (-not $hasBom) {
    $bom = [byte[]](0xEF, 0xBB, 0xBF)
    $nb = New-Object byte[] ($b.Length + 3)
    [Buffer]::BlockCopy($bom, 0, $nb, 0, 3)
    [Buffer]::BlockCopy($b, 0, $nb, 3, $b.Length)
    [IO.File]::WriteAllBytes($f, $nb)
}
```

已两次受害：`ops-start-dev.ps1`、`_create_shortcut.ps1`

v1.37.0 后又复发两次：`ops-verify-pg.ps1`（**真炸** —— 演练脚本整段无法解析，`npm run verify:pg` 直接消失）、`gui-dev-console.ps1`（同样无 BOM，只是被启动 bat 里的「BOM 自检」兜住才没炸）。所以本节的「记得手动重存」已升级为**测试强制**（见 §4.4）。

### 4.4 验证：每次修改 .ps1 后的语法检查

```powershell
$tokens=$null; $errors=$null
[System.Management.Automation.Language.Parser]::ParseFile(
  "tools/gui/gui-dev-console.ps1", [ref]$tokens, [ref]$errors
)
# $errors.Count 必须 = 0
```

这条纪律已由单测自动守门：`tests/ps1-encoding-guard.test.js`（随 `npm test` 跑）扫描仓库内所有 `.ps1` —— 含中文却无 BOM、正文出现重复 `U+FEFF`、或不是合法 UTF-8，都会红灯并**直接点名文件**，不再依赖「记得手动 ParseFile」。

---

## 五、GUI 启动链 & 文件引用约定

### 5.1 单窗口启动（Hard Constraints 新增强制）

| 启动方式 | Target / 命令 | 必须参数 | 禁止 |
|---------|--------------|---------|------|
| bat 双击 (`EuriskoTax-Console.bat`) | `start "EuriskoTax" powershell.exe ...` | `-WindowStyle Hidden -STA -File "<abs>\gui-dev-console.ps1"` | 禁止用同步 `powershell.exe -File`（cmd 窗口残留直到 GUI 关闭）|
| 桌面快捷方式 .lnk | `powershell.exe`（直接）| `-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "<abs>\gui-dev-console.ps1"` | 禁止 TargetPath 指向 `cmd.exe` / `%ComSpec%`；禁止用 `-Command`（会破坏 `$PSScriptRoot` 解析）|

### 5.2 GUI 按钮 → 文档路径引用

GUI 中所有 `Start-Process (Join-Path $ProjectRoot "docs\...")` 必须与 §2 目录结构保持一致。2026-08-16 已验证 3 处（L3155/3156/3563）改为 `docs/admin/account-credentials.md`。

**每次移动文档后，必须全局搜索路径引用：**
```powershell
Select-String -Pattern "docs[\\/]account-credentials" -Path . -Recurse -Include *.ps1,*.md,*.js
```

---

## 六、.gitignore 同步规则

**任何文件移动（特别是敏感文件 / 日志）必须同步修改 `.gitignore`。**

2026-08-16 已确认的路径：
```gitignore
# 敏感文档（账号密码）
docs/admin/account-credentials.md

# 通知 / 部署配置（含 SMTP/SSH 凭据）
tools/ops/notify.config.json
tools/ops/ops-deploy.config.json

# 日志目录 & 所有 .log 文件
# ⚠ 必须写 `logs/*` 而不是 `logs/`：后者会让下面 `!` 例外失效（git 不进入被忽略的目录）
logs/*
!logs/README.md
*.log
```

已按此改写（2026-09-20）：此前写的是 `logs/` + 注释掉的 `!logs/README.md`，结果 `logs/README.md`
一直**没能入库**（目录被整体忽略），别的机器看不到日志规范。改完后 README 正常入库、`.log` 仍不入库。

---

## 七、文件变动标准流程（Checklist）

### 7.1 新增文档 / 日志 / 脚本

- [ ] 决定新文件的**准确归属目录**（查 §1 结构图 + §2/§3/§4 分类表）
- [ ] 命名符合规范（语义化 + 合适的前缀/后缀）
- [ ] 编码符合 §4.2（特别注意 .ps1 要有 BOM、.bat 要是 GBK）
- [ ] 是敏感文件？ 加到 `.gitignore`（§6）
- [ ] 新增 GUI 按钮引用它？ 路径写对并全局搜旧路径
- [ ] 如果是日志：更新 §3.3 标准日志文件名表

### 7.2 移动 / 重命名现有文件

- [ ] 全局路径引用搜索（GUI .ps1 + 其他 .md + README + .js + .bat + .gitignore）：
  - `docs/<old>` → 所有引用都要改
  - `.log` 路径 → 检查 `Join-Path $PSScriptRoot` / `$OpsDir` / `$ProjectRoot` 三处写死
- [ ] `.gitignore` 同步更新（特别是敏感文件）
- [ ] GUI 按钮 `.Desc` 中涉及路径的**文字描述**一起改（这是最容易漏的！）
- [ ] 文档中的「相关链接」章节加一条重定向说明（旧文档放个「已迁移」说明，保留 1 个版本后再删）

### 7.3 删除文件

- [ ] 确认无其他文件引用（§7.2 同款搜索）
- [ ] 是目录级 README？ 除非目录删除，否则不要删
- [ ] 是敏感文件？ 确认 `.gitignore` 未把它漏出去

### 7.4 修改 .ps1 脚本编码相关

- [ ] 改完后立刻重检 BOM（§4.3）
- [ ] 语法校验 `[Parser]::ParseFile` 无错误（§4.4）
- [ ] 修改了日志路径？ GUI 查看日志按钮 + 清空日志按钮 + 所有说明文字一致（30+ 处检查点见 §3.2）

---

## 八、变更历史

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-08-16 | 1.0 | 首次发布。固化目录结构；修复 4 份零散文件位置（`account-credentials.md → docs/admin/`、`debug-mail-spam.md → docs/tech-reports/`、清理根目录冗余 3 个 .log、建立 `logs/` 目录说明）；新增 `.ps1` BOM 验证 SOP；新增 GUI 按钮路径联动清单 |
| 2026-09-06 | 1.1 | 目录树同步 v1.4.0 事实：~~`zeabur.json`~~ → `Dockerfile`（Zeabur 部署入口）、新增 `manifest.json` / `service-worker.js`（PWA）、新增 `docs/marketing/`、后端描述 Koa → Express |
| 2026-09-07 | 1.2 | 目录树登记新文件：`docs/development/stage10-free-pro-plan.md`（阶段10 方案，属 `development/` 规划类）、`docs/guides/development-workflow.md`（guides 漏登记的历史遗漏一并补录）；`index.html` / `service-worker.js` 注释由"v1.4.0 PWA"更新为 v1.5.2+ 网络优先瘦缓存策略 |
| 2026-09-07 | 1.3 | 文档去重合并：`debug-mail-spam.md` 内容并入 `docs/tech-reports/watchdog-notification-and-event-log-spec.md` §8（已知问题与排查，会话 OPEN），原文件删除；目录树与 §2.1 分类表示例同步；`watchdog-notification-and-event-log-spec.md` 升 v4.0、`watchdog-deployment-guide.md` 升 v1.3（通知策略与规范对齐为 URL_CREATED + URL_CHANGED 双事件） |
| 2026-09-14 | 1.4 | 登记导出工具 `tools/ops/ops-md2docx.py`（Markdown → Word 发送版，Python + python-docx）与两份 `.docx` 导出件（`business-plan-for-partners.docx` / `gtm-execution-plan.docx`，均为**非真源**）；§4.1/§4.2 补充 `.py` 脚本归属与编码规范；登记营销侧新增 `business-plan-for-partners.md` / `gtm-execution-plan.md`；§2.1 分类表补 `docs/marketing/` 一行；目录树同步（v1.4 原有两条记录此处合并为一行） |
| 2026-09-20 | **1.7** | **修正上一版的事实错误 + 清理散落**：上一版写「`logs/` 尚未建立」是错的 —— 它被 `.gitignore` 的 `logs/` 忽略，所以 `git status` 看不见，目录其实一直在（还自带一份 `README.md`）。**真坑在这里**：写 `logs/` 会把整个目录排除掉，后面那行 `!logs/README.md` 例外**永远不生效**（git 不进入被忽略的目录），导致日志规范一直没能入库 —— 已改 `logs/*` + `!logs/README.md`，README 现在正常入仓、`.log` 仍不入库（§6 记了这个坑）。同步：删掉从未使用过的 `docs/tech-reports/health-check-report-template.md`（线上自检以 `ops-check-prod.ps1` 37 项指纹为准），目录树与 `docs/README.md` 相应去掉；`tools/clean-browser-cache.bat` 归位到 `tools/ops/`（此前散在 `tools/` 根目录，与「辅助脚本按类型进子目录」矛盾）；§3.1 修正日志实际分布（脚本写的在 `tools/ops/`，`logs/` 里那两个 `dev-server*.log` 是手工重定向遗留，脚本里搜不到写它们的命令）。**散落产物已删**：根目录 `server-dev.log`、空目录 `backup/`、`coverage/`、`.playwright-cli/`（87 张临时截图）、零引用的 `tools/dup_reg_alert.png` |
| 2026-09-20 | **1.6** | ① **首次建档阶段18** —— `docs/development/stage18-spec-driven-followup.md`（此前无独立方案文件，只在 CHANGELOG 散记）；目录树与 `development-plan.md` 阶段表同步挂链接。② **§3 日志规范按事实重写**：明确「约定目标 `logs/`、当前实际 `tools/ops/`」，迁移落点清单核实后重写为一张「先 grep 再改」的表（原清单的行号已漂移，照着改会改错地方），新增 §3.3 标准日志文件名表（原先指向一个不存在的 `logs/README.md`）。§2.2 / §7.1 相应改为引用 §3.3 | **目录树按当前事实重写**（此前停在 2026-09-14，`docs/` 里 20+ 份文档从未登记过）：`guides/` 补 13 份并标出 UI 权威与两份 🔵 过程稿、`development/` 补 11 份并标出阶段状态、`marketing/` 补 `wecom-channel-playbook.md`、`tech-reports/` 补 `lighthouse-deployment-guide.md`；`src/css/` 9 份标出 `tokens.css` 为令牌真源与 Tailwind 构建产物对；`tools/ops/` 补 `ui-screenshot-baseline.js` + `screenshots/`（阶段19-0 视觉回归基线）与 `release-metrics.js` / `preflight-release.js`；新增 `seo/` 21 个落地页。**如实标注 `logs/` 目录尚未建立**（规范里写了、磁盘上没有，日志仍在 `tools/ops/*.log`）。新增 §2.4 文档新鲜度标记（🟢/🔵/🟡 + 阶段收口改标 + 进度唯一真源），§2.3 禁止项补「进度口径不要多处各写一份」。变更历史表按时间重排并合并重复的 1.4 行 |
