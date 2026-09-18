# 站点结构图：UI 框架 · 内容结构 · 页面清单 · 功能入口

> **本文性质**：子文档 + **现状测绘（as-is）** —— 不是设计方案（to-be），方案一律以
> [`ui-design-spec.md`](ui-design-spec.md)（唯一权威，第 3–17 行声明）为准。
> **测绘基准**：2026-09-18（v1.41.0）· 每条结论都附 `code:line`，可回查核对。
> **本次回刷**：2026-09-18 第二次（阶段17 17C-1 / 17C-4 交付后）—— 深度流程 4 → **6 个**
> （新增 spec 驱动 2 个），页面 14 → **15 个**（新增 P15 `#deep-wizard-page`）。
> **本文会过期，且理应过期**：它是快照不是蓝图 —— 阶段17 每交付一个税种（17C-* / 17D-*）须回刷本图并更新日期。
> 若你手上的日期明显早于 `CHANGELOG.md` 的版本时间，请把它当历史切片，别拿它判断现状。
> **用途**：回答「有多少个页面 / 每个页面有什么 / 用户怎么走 / 功能入口在哪」。

---

## 0. 先解开一个歧义：站里的「页面」是 5 种不同东西

混在一起数就会对不上号，先钉清楚：

| # | 类别 | 数量 | 切换方式 | 说明 |
|---|---|---|---|---|
| A | **App 内视图** | **14** | `showPage(pageId)` | 主 SPA `index.html` 内的顶层页面，**本文主体** |
| B | **页内步骤**（step-pane） | 12 | 仅切 `hidden`，**不经 showPage** | 4 个深度页里的 4+3+3+2 步，**不是页面** |
| C | **SEO 落地页** | 21（1 目录 + 20 落地） | 真 URL 跳转 | `seo/*.html`，与 20 个工具一一对应 |
| D | **独立 HTML** | 2 | 真 URL 跳转 | `admin.html`（管理台）、`clean-cache.html` |
| E | **浮层**（弹窗/抽屉/Toast/条） | 20 | 叠加显示 | 见 §5 |

> 对外 **HTML 文件总数 = 24**（`index.html` + 21 个 SEO + `admin.html` + `clean-cache.html`）。
> 「App 里能看到的顶层页面」= **14**。

---

## 1. UI 结构图（Shell 层）

### 1.1 两端对比（呼应双端设计：桌面不是放大的手机）

```
【手机端 <768px】                        【桌面端 ≥768px】
┌────────────────────────┐              ┌──────────────────────────────────────┐
│ 全局顶栏 56px          │              │ 全局顶栏 56px                        │
│ Logo 安装 主题 帮助 …  │              │ Logo 安装 主题 帮助 权益 用户 退出 … │
├────────────────────────┤              ├──────────────────────────────────────┤
│                        │              │ Tab 行 44px：首页 · 工具 · 我的       │
│      内容区            │              ├──────────────────────────────────────┤
│      （单列全宽）       │              │ 内容区 ← 1024px 限宽（多列网格）      │
│                        │              │                                      │
│                        │              │                                      │
├────────────────────────┤              │                                      │
│ 底栏 52px              │              │                                      │
│ 首页 · 工具 · 我的      │              │                                      │
└────────────────────────┘              └──────────────────────────────────────┘
   + FAB 悬浮助手球                        + 助手 ≥1280px 推开式侧栏（不覆盖内容）
```

- **Tab 只有 3 个**：`TAB_PAGES = [mode-selection-page, tools-page, profile-page]`（`toolbox-ui.js:29-33`）
- **两端同一份状态**：`syncNav()`（`toolbox-ui.js:540`）同时驱动 `#top-tabbar`（`index.html:407`）与 `#bottom-tabbar`；靠 **MutationObserver**（`toolbox-ui.js:601-606`）保证永不同步失效 —— 新增导航项**只改一处**
- Tab 元素位置：桌面 `index.html:409-411`；手机 `index.html:5431/5434/5437`
- 助手**故意不占 Tab 位**：手机是 `#tax-assistant-fab`（`index.html:5443`），桌面是推开式侧栏

### 1.2 全局固定层（不属于任何页面，常驻）

| 层 | id | 位置 | 说明 |
|---|---|---|---|
| 离线提示条 | `#offline-banner` | `index.html:125` | 断网自动出现 |
| SW 更新条 | `#sw-update-banner` | `index.html:130` | 有新版本时提示刷新 |
| 顶栏 | — | `index.html:355-399` | Logo / 安装 / 主题 / 帮助 / 权益 pill / 用户菜单 |
| 用户下拉 | `#user-dropdown` | `index.html:387` | 含个人中心、退出登录 |
| 助手 FAB + 抽屉 | `#tax-assistant-fab` / `#tax-assistant-drawer` | `index.html:5443/5451` | 全文百科 + 跳转分发 |
| 保存成功 Toast | `#save-success-toast` | `index.html:4797` | 全局反馈 |

---

## 2. 内容结构图（IA）

```
EuriskoTax
├── 计算能力：24 个入口
│   ├── 【速算器】20 个 ── status:native，共用 1 个 quick-calculator-page
│   │   ├── salary 工资与到手 ....... 5（月薪个税/税后倒算/年终奖/专项附加/年度汇算）
│   │   ├── special 一次性与特殊所得 . 5（劳务报酬/股权激励/离职补偿/提前退休/外籍津补贴）
│   │   ├── prefer 税优与养老 ....... 3（个人养老金/税优健康险/企业年金）
│   │   ├── social 社保与用工 ....... 3（社保公积金/企业用工成本/残保金）
│   │   └── corp 企业与经营 ......... 4（增值税/企业所得税/附加税印花/个体经营所得）
│   └── 【完整测算】6 个 ── status:deep
│       ├── 页面式 4 个（各有独立页 + 私有分步逻辑，17B 待反向迁移）
│       │   ├── forward        综合所得计税（①基本参数 ②收入明细 ③扣除明细 ④结果）
│       │   ├── business       经营所得计税（①收入成本 ②扣除明细 ③结果）
│       │   ├── classification 分类所得计税（①所得信息 ②结果）
│       │   └── reverse        反向倒算   （①基本参数 ②扣除明细 ③结果）
│       └── spec 驱动 2 个（阶段17 新增：无独立页，共用 P15 `#deep-wizard-page`）
│           ├── vat-deep          增值税      （①纳税人身份 ②本期数据 ③结果）
│           └── surtax-stamp-deep 附加税印花税（①税种选择 ②计税依据 ③结果）
├── 横向分发：5 张身份卡 → 按人找工具（employee/freelance/owner/finance/executive）
├── 政策依据库：27 条 / 6 类（iit 15、vat 2、cit 2、附加+印花 3、社保 2、规费 3）
└── SEO 落地层：21 个 HTML（每个工具 1 页，源自同一份 tool-registry）
```

**要点**

- `tool-registry.js`：GROUPS `31-37`（5 组）／TOOLS `119-1161`（20 个）／SCENARIOS `90-116`（5 张身份卡）／DEEP `49-85`（6 个：4 页面式 + 2 spec 驱动）
- `X-deep` 自动复用 `X` 的 `fields` / `compute`（**同一对象引用**，`tool-registry.js:1219-1237`）；
  由 `tests/tool-registry.test.js` 断言守护 —— 这是「同一个税种不会算出两个数」的机器保证
- `tax-registry.js`：27 条政策依据 —— 这是**政策库**，与 20 个工具**不是同一份东西**，画图时勿混
- 注意：`index.html:5413` 的注释写「15 个落地页」是**过期的**，实际 **20 个**

---

## 3. 用户使用流程（主路径）

### 3.1 三条主路径

```
【路径 A｜速算：最快拿到一个数】  ← 承接最多流量
首页 → 搜工具 / 选身份卡 → 工具页（已按身份筛选）→ 点工具卡
     → 通用速算器页（填表 → 出结果）→ 保存 / 导出 PDF / 看相关工具
     → 返回工具页（明确不回首页）

【路径 B｜完整测算：值钱的深任务】
工具页 → 「完整测算」组 → 6 个入口之一
                          ├ 页面式 4 张 mode-card → 各自深度页（①…④，底部常驻预览条）
                          └ spec 驱动 2 张卡 → P15 通用向导（共用 1 个容器，内容按 spec 渲染）
       → 深度页多步向导（①…④，底部常驻实时预览条）
       → 结果区（推导链 / 明细 / 预算表 / 优化建议）
       → 保存 · 导出 PDF/Word · 留资引导（reverse 被硬排除）

【路径 C｜回到台账】
我的 → 9 张卡 → 计算历史 / 税务档案 / 数据管理 / 税务日历
              → 或弹窗：财税服务(留资) / 公告 / 反馈 / 帮助 / 关于
```

### 3.2 首次进入（未登录）

```
打开 index.html
  ├─ login-page（整屏插页，index.html:137）— 登录 / 注册 / 重置密码
  └─ 跳过 → 游客会话（#guest-login-btn，index.html:374）
        → 首页 → …（路径 A / B 照旧，登录入口始终可见但永不阻塞）
```

### 3.3 助手（横向旁路，任意页面可达）

```
任意页 → FAB 悬浮球 → 抽屉：搜索联想 / 快捷入口 / 热门 / 分类 / 问答列表
       → 跳转分发 goToRelatedPage()：年终奖工具 · 工具页 · 计算历史
       → 或打开税率表速查 #rate-table-modal（运行时动态创建）
```

---

## 4. 页面清单：15 个（逐个结构图 + 功能入口）

> 图例：`→` 表示功能入口及其跳转目标。★ 标记枢纽页。

### P1 `login-page` — 登录 / 注册（`index.html:137`）

```
┌─ login-page（无 .page 类，整屏独立层；是否出现由 guest-session 决定）─┐
│  品牌标识                                                            │
│  [登录] [注册] Tab            #login-tab:150 / #register-tab:153     │
│  ├── #login-form 159                                                 │
│  ├── #register-form 188（默认 hidden）                               │
│  └── #reset-password-form 275（默认 hidden）                          │
│  用户协议 #4400 · 隐私政策 #4449 · 清理缓存 clean-cache.html:346     │
└─────────────────────────────────────────────────────────────────────┘
```

| 入口 | 目标 |
|---|---|
| `#login-tab` / `#register-tab` | 切换表单 |
| 协议链接 `262 / 340` | `#user-agreement-modal` / `#privacy-policy-modal` |
| 清理缓存 `346` | `clean-cache.html` |
| 游客登录 `#guest-login-btn`（全局顶栏 `374`） | 免登录进首页 |

---

### P2 ★ `mode-selection-page` — 首页 / 工作台（`index.html:418`，默认页）

```
┌─ mode-selection-page ─────────────────────────────────────────────┐
│ ① 欢迎 + 今日税感        #home-greeting 430 / #home-tax-feel 435  │
│ ② 搜索入口卡片           #toolbox-search-entry 449 「24 个 ›」    │
│ ③ 我是谁（5 张身份卡）    #home-scenarios 464                      │
│ ④ 最近使用               #home-recent-tools-card 470（默认隐藏）   │
│ ⑤ 最近计算               #home-recent-list 490 「全部 ›」488       │
│ ⑥ 税务提醒               #home-calendar-list 504                   │
│ ⑦ 税务小贴士             #home-tip-content 518 「换一条」516       │
│ ⑧ 关于本站（20 速算 + 4 完整 = 24 入口说明）524                    │
│ ＋ #content-home-banner 424（公告注入）／分享落地横幅（动态）      │
└──────────────────────────────────────────────────────────────────┘
```

| 功能入口 | → 去向 | 实现 |
|---|---|---|
| `#toolbox-search-entry` | 工具页 + 聚焦搜索框 | `toolbox-ui.js:617-627` |
| 身份卡 ×5 | 工具页（按身份筛选） | `openScenario()` `toolbox-ui.js:284` |
| `#home-recent-tools-clear` | 清空 localStorage | `toolbox-ui.js:630` |
| `#home-view-all-history` | 我的 → 自动进计算历史 | `home-ui.js:554-567` |
| `#home-next-tip` | 换一条贴士 | `home-ui.js:545` |
| 品牌 Logo `#brand-home-link` | 回首页 | `home-ui.js:570-577` |

---

### P3 ★ `tools-page` — 工具（`index.html:540`）

```
┌─ tools-page ──────────────────────────────────────────────────────┐
│ 搜索框 #toolbox-search 550（150ms 防抖）                          │
│ 身份筛选 chip #toolbox-scenario-chip 552（清除 ›）                 │
│ ─ #toolbox-groups 553 ← renderToolbox() 动态注入 ─────────────── │
│   · 最近使用（有则显示）                                           │
│   · 5 个场景组（salary/special/prefer/social/corp）→ 20 张工具卡    │
│ ─ #toolbox-deep 558「完整测算」静态 4 张 mode-card ──────────────── │
│   · forward 566 │ business 578 │ classification 590 │ reverse 602   │
│ ─ #toolbox-deep-extra 613 ← 阶段17 spec 驱动入口（现 2 张：vat / surtax）│
└──────────────────────────────────────────────────────────────────┘
```

| 功能入口 | → 去向 | 实现 |
|---|---|---|
| 工具卡 `.tool-entry` | `openTool(id)` → **通用速算器页** | `toolbox-ui.js:291-310` |
| 4 张 mode-card | 触发隐藏 `${id}-mode-btn` → 深度页 + `goToStep(1)` | `home-ui.js:511-540`、`app.js:4-33` |
| `.mode-card-info-btn` | `showModeInfo()`（**不导航**） | `home-ui.js:533-539` |
| 搜索框 | 重渲染分组；有命中时收起 deep 组 | `toolbox-ui.js:639` / `277` |

---

### P4 `quick-calculator-page` — 通用速算器页（`index.html:619`）

注意： **20 个工具共用这一页**，表单由 registry schema 渲染 —— 画流程图时它不是 20 个页面。

```
┌─ quick-calculator-page ──────────────────────────────────────────┐
│ ← 返回  标题 #quick-title 627 / 副标题 628 / 政策时效徽标 630     │
│ ┌ 填写参数 #quick-form 642（schema 渲染，支持联动显隐 when）┐     │
│ ┌ 测算结果 #quick-result 653 ＋ 免责声明 657 ──────────────┐     │
│ ┌ 易错口径 #quick-pitfalls 661 ────────────────────────────┐     │
│ ┌ 政策依据 #quick-policy-basis 667（details）＋ 复制文号 677 ┐    │
│ ┌ 算完还能干什么 #quick-next 682（动态推荐相关工具）────────┐     │
│ 外链 #quick-seo-link 685 → /seo/index.html                        │
└──────────────────────────────────────────────────────────────────┘
```

| 功能入口 | → 去向 | 实现 |
|---|---|---|
| `#quick-back-btn` | **回工具页**（明确不回首页） | `toolbox-ui.js:649-655` |
| `.tool-next-item` 相关工具 | 同页刷新成另一个工具 | `toolbox-ui.js:427-442` |
| `#quick-save-history` | 写入 `taxCalculationHistory` | `toolbox-ui.js:435/444` |
| `#quick-export-pdf` | `EuriskoQuickReport.exportQuickResult()` | `toolbox-ui.js:453-466` |
| `#quick-basis-copy` | 复制政策文号 | `toolbox-ui.js:109/126` |

---

### P5 `forward-calculation-page` — 综合所得计税（`index.html:691`）

```
┌─ 顶栏 693 ─────────────────────────────────────────────────────┐
│ ← 返回 697 │ 保存 #forward-save-btn 706 │ 重置 709             │
├─ 步骤条 715 ───────────────────────────────────────────────────┤
│ ① 基本参数 742 → ② 收入明细 796 → ③ 扣除明细 917 → ④ 结果 1379 │
├─ 结果区 ───────────────────────────────────────────────────────┤
│ 推导链 #formula-steps-panel 1416 │ 税率分布 1478                │
│ 月度个税明细 1486 │ 年度个税预算表 1495 │ 优化建议 1523          │
│ 导出 PDF 1467 / Word 1470 │ 留资引导 #lead-result-guide         │
├─ 底部实时预览条 #forward-preview-bar 1639 ──────────────────────┤
│ 收入合计 │ 扣除合计 │ 预估税额                                  │
└────────────────────────────────────────────────────────────────┘
```

---

### P6 `reverse-calculation-page` — 反向倒算（`index.html:1660`）

```
┌ ← 返回 1666 │ 保存 1675 │ 重置 1678 ──────────────────────────┐
│ 步骤条 1684：① 基本参数 1706 → ② 扣除明细 2013 → ③ 结果 2470 │
│ 结果：倒算结果 2476 │ 三模式对比 2512 │ 收入构成分析 2575      │
│       预算表 2584 │ 保守/均衡/进取 2616/2638/2660              │
│       推导链 #formula-steps-panel-reverse 2548                 │
│ 导出 PDF 2564 / Word 2567                                      │
│ 禁 永不出服务引导（BLOCKED_TYPES，lead-touchpoints.js:19-21）   │
│ 预览条 #reverse-preview-bar 2693                                │
└───────────────────────────────────────────────────────────────┘
```

---

### P7 `business-calculation-page` — 经营所得计税（`index.html:2714`）

```
┌ ← 返回 │ 保存 2729 │ 重置 2732 ──────────────────────────────┐
│ 步骤条 2738：① 经营收入与成本 2760 → ② 扣除明细 2868          │
│             → ③ 结果 3340                                     │
│ 结果：扣除项明细 3228 │ 推导链 3487 │ 年度预算表 3515          │
│ 导出 PDF 3502 / Word 3505 │ 留资引导 ✓                         │
│ 预览条 #business-preview-bar 3546                              │
└───────────────────────────────────────────────────────────────┘
```

---

### P8 `classification-calculation-page` — 分类所得计税（`index.html:3567`）

```
┌ ← 返回 3573 │ 保存 3582 │ 重置 3585 ──────────────────────────┐
│ 步骤条 3591：① 所得信息 3608 → ② 结果 3736                     │
│ 含：偶然所得提示 3647 │ 已添加所得条目 3713 │ 计税表 3814       │
│ 推导链 3786 │ 导出 PDF 3801 / Word 3804 │ 留资引导 ✓           │
│ 预览条 #classification-preview-bar 3845                         │
└───────────────────────────────────────────────────────────────┘
```

> **P5–P8 四个深度页共享同一套骨架**：返回/保存/重置 → 步骤条 → step-pane → 结果 → 导出 → 预览条。
> 这正是 `deep-wizard-ui-spec.md` 要把它抽成**通用渲染器**的原因（现状是 4 份手写复制）。
>
> **2026-09-18 回刷：通用渲染器已落地** —— `src/js/ui/deep-wizard-ui.js` 按注册表的 `steps` / `fields`
> 渲染任意税种的向导，P15 `#deep-wizard-page` 承接。现状因此变成「两套并存」：
> P5–P8 仍是手写页（17B 待迁移），**新增税种一律走 P15，不再写新页面**。

---

### P9 ★ `profile-page` — 个人中心（`index.html:5026`）

> **纯发射台**：自身不是列表页，9 张卡全部通往别处。

```
┌─ profile-page ─────────────────────────────────────────────────┐
│ ← 返回 5030 │ 个人中心                                          │
│ 用户信息卡 5038：昵称 5046 / 版本徽标 5047 / 邮箱 5049           │
│   → 版本与权益 5053 │ 账户设置 5056                              │
│ 数据概览 #profile-stats-grid 5065（JS 动态）                     │
│ ─ #profile-cards-grid 5072（9 张卡，2 组）───────────────────── │
│  【常用功能】计算历史 · 税务档案 · 数据管理 · 税务日历           │
│  【服务与支持】财税服务 · 公告更新 · 意见反馈 · 使用帮助 · 关于  │
│ 退出登录 5080                                                   │
└────────────────────────────────────────────────────────────────┘
```

| 卡片 id | → 去向 |
|---|---|
| `profile-card-history` | `profile-history-page` |
| `profile-card-tax` | `profile-tax-page` |
| `profile-card-data` | `profile-data-page` |
| `profile-card-calendar` | `profile-calendar-page` |
| `profile-card-lead` | `#lead-modal`（留资，标签「在线客服」） |
| `profile-card-notices` | `#content-notice-modal` |
| `profile-card-feedback` | `#feedback-modal` |
| `profile-card-help` | `#help-modal` |
| `profile-card-about` | `#about-modal` |

配置源 `auth-ui.js:2135-2162`；渲染 `auth-ui.js:764-854`。

---

### P10 `profile-settings-page` — 账户设置（`index.html:5089`）

```
账号信息 5101（用户名/邮箱/手机 + 保存 5133）→ 账号安全 5134
（验证码 → 新密码 → 确认 → 提交 5178）→ 危险区域 5184（注销账号 5200）
```

返回由 `[id^=back-from-]` 选择器批量绑定（`auth-ui.js:2022-2034`）。

### P11 `profile-tax-page` — 税务档案（`index.html:5211`）

```
默认社保公积金基数 5231 → 默认专项附加扣除(元/月) 5248 → 其他默认参数 5281
操作：重置 5301 / 保存 5304
```

> 这里的默认值会**预填进** 4 个深度页的表单，是「降输入成本」的关键一环。

### P12 `profile-data-page` — 数据管理（`index.html:5311`）

```
云同步 5323（状态 5330 / CTA 5334 / 立即同步 5336）
数据管理 5343（导出 JSON 5354 / 导出 CSV 5357）
```

### P13 `profile-calendar-page` — 税务日历（`index.html:5366`）

```
单卡 + #tax-calendar-list 5379（申报期提醒；与首页⑥「税务提醒」同源）
```

### P14 `profile-history-page` — 计算历史（`index.html:5387`）

```
#profile-history-list 5397 + 空态 5398
（入口：首页⑤「全部 ›」、我的卡片、助手 goHistory）
```

---

### P15 `deep-wizard-page` — 通用多步向导容器（`index.html:627`）

> **阶段17 新增**：这是全站唯一「内容由数据决定」的页面 —— 它自身没有固定表单，
> 渲染什么完全取决于 `tool-registry.js` 里那条 spec 的 `steps` / `fields`。

```
┌ #deep-wizard-page 627 ──────────────────────────────────────┐
│ .calc-sticky-header（由 deep-wizard-ui.js 注入）              │
│ ├ 返回工具箱 #dw-back · 标题 · 重置 #dw-reset                │
│ └ .step-indicator ← 步数 = spec.steps + 1（结果步自动追加）   │
│ .step-pane ← 只渲染当前步：标题 + step.why + 本步字段          │
│ └ #dw-prev / #dw-next → 末步即结果区（主结果 + rows + note）  │
└──────────────────────────────────────────────────────────────┘
```

| 项 | 值 |
|---|---|
| 承接税种 | 现 2 个：`vat-deep`（`tool-registry.js:74`）、`surtax-stamp-deep`（`:81`） |
| 入口 | 工具页 `#toolbox-deep-extra` —— 按 `status:'deep' && !pageId` 自动出卡，不必改 HTML |
| 复用 | `fieldHtml` / `readValues` / `visibleFields` / `fmtValue` 均来自 `toolbox-ui.js`，**未复制一份** |
| 草稿 | `localStorage` `euriskoDeepDraft:<id>`（含步号），支持断点续算 |
| 与 P5–P8 | 骨架同源于它们（同一套 class），但 P5–P8 是**手写常量 DOM**，P15 是**按 spec 渲染** |

> **新增一个完整测算只需两步**：① 在 `DEEP` 里加一条 `{ id: 'X-deep', … }`；② 给 `X` 的字段标好 `step` 归属。
> `fields` / `compute` 的共享由 `-deep` 后缀自动配对完成（`tool-registry.js:1219-1237`），无需写渲染代码。

---

## 5. 浮层清单：20 个

| # | id | 位置 | 触发入口 |
|---|---|---|---|
| 1 | `#offline-banner` | `125` | 离线自动 |
| 2 | `#sw-update-banner` | `130` | 检测到新版本 |
| 3 | `#user-dropdown` | `387` | `#user-btn` |
| 4 | `#help-modal` | `3869` | 顶栏帮助 / 我的卡片 / 助手（4 个 tab） |
| 5 | `#feedback-modal` | `4087` | `profile-card-feedback` |
| 6 | `#upgrade-modal` | `4149` | 权益 pill `#topbar-plan-badge` / `#profile-nav-upgrade` |
| 7 | `#alert-modal` | `4258` | `window.showAlert()` |
| 8 | `#confirm-modal` | `4283` | `window.showConfirm()` |
| 9 | `#user-agreement-modal` | `4400` | 登录 / 注册 / 关于 |
| 10 | `#privacy-policy-modal` | `4449` | 同上 + 留资同意行 |
| 11 | `#about-modal` | `4497` | `profile-card-about` |
| 12 | `#content-notice-modal` | `4557` | `profile-card-notices` |
| 13 | `#lead-modal` | `4583` | 财税服务卡 / 结果页引导 / 报告解锁 / 续费 |
| 14 | `#save-success-toast` | `4797` | 保存成功 |
| 15 | `#tax-assistant-overlay` | `5449` | 打开抽屉 |
| 16 | `#tax-assistant-drawer` | `5451` | FAB / hotzone |
| 17 | `#rate-table-modal` | 动态 `tax-assistant-ui.js:588` | 助手内「税率表速查」 |
| 18 | `#share-landing-banner` | 动态 `share-landing.js:80` | `?source=share` 落地 |
| 19 | `#lead-result-guide` | 动态 `lead-touchpoints.js:72` | 结果页情境引导（**排除 reverse**） |
| 20 | `#assistant-policy-banner` | 动态 `tax-assistant-ui.js:208` | 助手内政策横幅 |

---

## 6. 功能入口总表（按目标归类）

| 目标 | 有哪些入口能到 |
|---|---|
| **首页** | 品牌 Logo、Tab「首页」、返回兜底（`auth-ui.js:2567`） |
| **工具页** | Tab「工具」、首页搜索卡片、身份卡、助手 `goTools`、速算页返回键 |
| **我的** | Tab「我的」、顶栏 `#profile-link`、首页「全部 ›」 |
| **5 个 profile 子页** | `profile-page` 的 9 张卡发射 |
| **通用速算器页** | 20 张工具卡（唯一入口 `toolbox-ui.js:309`） |
| **4 个深度页** | 工具页 `#toolbox-deep` 的 4 张 mode-card、助手 `goBonusCalc`、数据管理恢复草稿 |
| **9 个弹窗** | 见 §5 |
| **站外** | SEO 落地页（页脚 `5416` / 速算页 `#quick-seo-link` / SEO 目录页） |

---

## 7. 维护本文

- 本文件是 **as-is 测绘**：页面内涵小改无需更新；只有**页面增删或入口重定向**才需回来改。
- `index.html` 行数会漂移，§4 的行号只作**当时的锚点**；失效时以 `id` 为准搜索。
- 影响全局 IA 的决策**不在这里做**，回到 `ui-design-spec.md`。

---

## 相关文档

| 文档 | 关系 |
|---|---|
| [`ui-design-spec.md`](ui-design-spec.md) | **唯一权威**（含 §8 页型、§9 结果页八段、§12 落地顺序） |
| [`ui-ux-master-plan.md`](ui-ux-master-plan.md) | 论证底稿：§2 竞品拆解、§3.3 两端定义、§4.3 两端形态硬边界 |
| [`deep-wizard-ui-spec.md`](deep-wizard-ui-spec.md) | 子文档：多步向导的排版与区块规格（§6.0 继承双端硬边界） |
| [`responsive-rules-reference.md`](responsive-rules-reference.md) | 响应式断点数值明细 |
