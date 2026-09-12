# 阶段13：获客与转化（引流 → 线索）实施方案（v1.0）

> 对应 [development-plan.md](./development-plan.md)「阶段13：获客与转化」。
> 规划日期：2026-09-12 · 项目版本基线：v1.11.1（阶段12 A + C1 已交付）
> 状态：**13A 后端地基 ✅ / 13B 前端触点 ✅ / 13C 管理台「线索」Tab ✅ / 13D 一键结果分享图 ✅ / 13E 漏斗埋点 ✅ —— 阶段13 子项已全部完成**（Lead 模型 + 公开提交端点 + 管理端跟进端点；
> 结果页分流引导 + 留资弹窗双通道 + 个人中心常驻卡片；运维后台「线索」Tab：漏斗条 + 列表 + 状态机 + 分配 + CSV 导出；
> 13D：截图公共层 + 2 模板分享图（二维码归因 + 生成前预览）；13E：FunnelEvent 日聚合 + 公开埋点端点 + 转化漏斗统计 + 前端单一入口埋点；
> 门禁 `verify:local` 100/100、单测 20 套件 412 例全绿）。
> 待办输入：企业微信「联系我」活码（`window.LEAD_CONFIG.wecomQrUrl`），未配置前自动降级为仅留言通道。
> 商业前提：本公司是会计/税务申报服务公司，本工具的核心价值是**为企业服务引流获客**，
>           而非以 SaaS 订阅本身作为主要收入。

---

## 0. 结论先行（TL;DR）

产品当前存在一个**致命的商业缺口**：全站没有任何「工具 → 服务」的转化入口。
用户算完就走了，我们连他是谁都不知道。因此阶段13 的目标只有一个：

> **把流量变成线索（Lead），并让顾问接得住。**

三个设计铁律：

1. **复用优先**：转化入口复用内容中心（`ContentItem` 投放）、线索管理复用反馈（`Feedback` 落库 + 状态跟进）模式、兑换码复用邀请码（`InviteCode` 一码一用）模式。**不引入新架构、不新增前端框架。**
2. **不做推销，做"专业分流"**：入口按计算类型分流。**工资/谈薪类结果页绝不出服务引导**（受众错配，只会拉低品牌）；仅「经营所得 / 汇算清缴 / 预算表」三类出现。
3. **合规即卖点**：文案禁用"避税/节税/税筹"，统一用"申报核对/汇算清缴代办"；留资含收入相关敏感信息，必须显式同意并留痕。

**本阶段不做**：支付网关、微信小程序、迁移腾讯云（这三项均被 ICP 备案阻塞，单列阶段15）。

---

## 1. 现状盘点（基于 v1.11.1 代码）

| 能力 | 现状 | 对阶段13 的意义 |
|------|------|-----------------|
| 内容中心 | `ContentItem` 支持 `placements`（`home_banner` / `modal` / `notice_list` / `assistant_qa`）+ `audience`（all/free/pro）分层 + 时间窗 + `link_url`；端上 `content-center-ui.js` 已落地四展示位 | **服务入口可用内容中心投放，零前端改动** |
| 反馈闭环 | `Feedback` 表 + `POST/GET /api/feedback` + 管理员 `GET/PATCH /api/feedback/admin`（`X-Admin-Token`）+ 管理台跟进 Tab | **线索表与跟进端点的直接模板** |
| 邀请码 | `InviteCode` 一机一码，注册事务内原子消耗 | 阶段14 兑换码的模板 |
| 账户分层 | `User.plan` / `plan_expires_at` / `pro_granted_by`（枚举已含 `"purchase"`） | 阶段14 变现的地基已就绪 |
| 埋点 | `CalcEvent` 按日聚合，**仅记录计算类型，不含任何收入/扣除输入** | 漏斗埋点可扩展，隐私基线已确立 |
| 导出 | `jsPDF` + `html2canvas` + `autotable` 已 CDN 引入，`navigation-ui.js::exportToPDF` 有完整分页截图实现 | 阶段13 分享图是**抽公共层**，不是从零 |
| 管理台 | `admin.html` 多 Tab（权益发放 / 反馈跟进 / 数据观察 / 排障 / 税制参数 / 内容）；`requireAdmin` 共享中间件 | 新增「线索」Tab 模式一致 |

**关键缺口**（本阶段要补）：

1. 无 `Lead` 数据模型与端点 —— 无法把"访问"变成"线索"；
2. 无任何转化入口 UI —— 用户算完即流失；
3. 无分享载体 —— 无自有传播闭环，也没有带归因的落地页。

---

## 2. 决策定稿（对应产品四问）

| # | 决策 | 定稿 | 理由 |
|---|------|------|------|
| D1 | 工资/谈薪类结果页是否出服务引导 | **不出**，只出「生成分享图」 | 该受众是打工人，与企业财税服务需求错配；硬推伤害品牌 |
| D2 | 留资即时通道 | **企业微信「联系我」活码**（不同入口配不同 `state` 归因） | 扫码即进私域，顾问可直接沟通 |
| D3 | 专业版权益是否含「1 次免费顾问咨询」 | **含，且作为核心卖点** | 我们卖的是人不是软件；把订阅用户直接送进服务漏斗 |
| D4 | 正式域名 | `.com` 优先，**尽早定死** | PWA 的 `localStorage` / Cache Storage 绑定域名，越晚更换用户本地历史损失越大 |

---

## 3. 转化触点设计（13B）

### 3.1 三层触点

| 触点 | 位置 | 触发条件 | 归因 `source` |
|------|------|----------|---------------|
| **T1 结果页情境引导** | 三类结果卡片下方 | 计算完成 | `result_business` / `result_settlement` / `result_budget` |
| **T2 内容中心投放** | 首页公告条 / 启动弹窗 / 个人中心公告列表 | 运营在管理台配置 | `home_banner` / `modal` / `notice_list` |
| **T3 个人中心常驻** | 个人中心「财税服务」卡片 | 常驻 | `profile` |
| **T4 分享图落地页** | 分享图二维码指向的页面首屏 | 扫码进入 | `share` |

### 3.2 分流规则（硬约束）

| 计算结果类型 | 是否出服务引导 | 引导文案方向 |
|---|---|---|
| 经营所得（个体户/个独/合伙） | **是（强）** | 个体户经营所得汇算，还有扣除项可核实 → 免费核对一次 |
| 汇算清缴 / 分类所得 | **是（强）** | 专项附加扣除可能未填全 → 免费核对一次 |
| 12 个月预算表 | **是（中）** | 小微企业代账与申报 → 了解服务 |
| 工资薪金正向计税 | **否** | 仅「生成分享图」 |
| 税后倒推（谈薪） | **否** | 仅「生成分享图」 |

> 该规则同时是**门禁断言项**：防止后续迭代误把引导加到工资/谈薪页。

> **实施口径（2026-09-12，13B 落地）**：代码白名单 `ALLOWED_TYPES = ['forward','comprehensive','business','classification']`，
> 显式排除 `BLOCKED_TYPES = ['reverse']`（谈薪）。「综合所得」结果页同时承载工资薪金与年度汇算两种场景，
> 结果页层面无法再细分，故统一按**汇算清缴**口径出引导（文案聚焦「专项附加扣除是否填全」）；
> 若后续要严格区分工资场景，需在 `calculateTax()` 完成后暴露更细的场景标记再分流。

### 3.3 留资弹窗（`lead-modal`）—— 双通道

- **即时通道**：企业微信活码（图片 + 引导文案）
- **异步通道**：表单（姓名 / 手机号 / 微信号 / 主体类型 / 需求 / 备注 + 隐私同意勾选）
- **活码配置**：不硬编码。公司在企微后台生成「联系我」活码后，于 `index.html` 注入
  `window.LEAD_CONFIG = { wecomQrUrl: 'images/lead-wecom-qr.png' }`；未配置时弹窗自动降级为
  「仅留言通道」并打印一次控制台提示，不影响主流程与门禁。

两条通道并存：只做活码会丢掉不愿加微信的线索；只做表单会丢失即时性。

---

## 4. 数据模型（13A）

```prisma
model Lead {
  id          Int      @id @default(autoincrement())
  user_id     Int?     // ★ 可空：游客不登录也能留资
  name        String
  phone       String?
  wechat      String?
  company     String?
  entity_type String   @default("unknown") // individual / sole / small / other / unknown
  need        String   @default("")        // 代理记账 / 汇算清缴 / 申报核对 / 咨询 / other
  source      String   @default("unknown") // 触点归因（见 §3.1）
  scene       String   @default("")        // ★ 情境快照："经营所得·汇算清缴"
  note        String   @default("")
  consent     Boolean  @default(false)     // ★ 个保法显式同意留痕
  status      String   @default("new")     // new / contacted / qualified / converted / dropped
  owner       String?                      // 跟进顾问
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  user User? @relation(fields: [user_id], references: [id], onDelete: SetNull)

  @@index([status, created_at])
  @@index([source])
  @@index([phone])
}
```

三个 ★ 是设计灵魂：

1. **`user_id` 可空** —— 大部分用户不会注册。要求登录才能留资会丢掉绝大多数线索。
2. **`scene` 情境快照** —— 顾问开场可说"我看到您在算个体户经营所得，扣除项那里……"，转化率远高于通用话术。
3. **`consent` 显式同意** —— 留资涉及收入相关敏感信息，个保法要求单独同意，必须留痕。

`User` 侧新增反向关系 `leads Lead[]`（`onDelete: SetNull` 保证用户注销后线索仍可跟进）。

---

## 5. 端点契约（13A）

### 5.1 公开端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/leads` | 提交线索。**无需登录**（游客可提交） |

**请求体归一化规则**：

| 字段 | 规则 |
|------|------|
| `name` | 必填，trim 后 1–50 字符 |
| `phone` | 选填，但 `phone` 与 `wechat` **至少提供一个**；提供时须匹配 `^1[3-9]\d{9}$` |
| `wechat` | 选填，1–64 字符 |
| `company` | 选填，≤ 100 字符 |
| `entityType` | 白名单枚举，非法回落 `unknown` |
| `need` | 白名单枚举，非法回落 `other` |
| `source` | 白名单枚举，非法回落 `unknown` |
| `scene` | 选填，≤ 100 字符 |
| `note` | 选填，≤ 1000 字符 |
| `consent` | **必须为 `true`**，否则 400 |

**幂等去重**：同 `phone` 在 24 小时内已存在记录时，**不新建**，改为更新该记录的 `source` / `scene` / `note`（非空追加），并返回 200。
> 不返回 409 是刻意的：避免暴露"该号码已提交过"，同时避免脏数据堆积。

**限流**：10 次 / IP / 小时（`leadLimiter`）。公开写入端点必须限流。
> 实施口径调整：上限取 10 而非初稿的 3 —— 大陆移动网络存在运营商 NAT，大量真实用户共享出口 IP，过严会误伤正常留资；
> 真正的防刷量机制是「同手机号 24h 幂等去重」（跨 IP 生效）+ 垃圾线索的人工跟进成本。10 仍足以拦住批量脚本。

### 5.2 管理端点（`X-Admin-Token`）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/admin/leads` | 列表（`status` / `source` / `q` 过滤，默认最近 200 条，关联 `user`） |
| `PATCH` | `/api/admin/leads/:id` | 更新 `status` / `owner` / `note`（部分更新语义） |
| `GET` | `/api/admin/leads/stats` | 漏斗统计：各状态计数 + 今日新增 + 按来源分布 |
| `GET` | `/api/admin/leads/export` | CSV 导出（销售导入自有 CRM 用） |

---

## 6. 前端改动面（13B / 13C）

| 文件 | 改动 |
|------|------|
| `src/js/api/api-client.js` | 新增 `submitLead(payload)`；`apiRequest` 增加末位 `sendTokenIfPresent`（登录则带 JWT，游客匿名） |
| `src/js/lead/lead-modal.js`（新增） | 弹窗组件：双通道 + 表单校验 + 提交 + 成功态；对外 `window.LeadModal.open({ source, scene })` |
| `src/js/lead/lead-touchpoints.js`（新增） | T1 结果页分流规则（白名单 + `BLOCKED_TYPES` 双保险）+ CTA 绑定 |
| `index.html` | 引入上述脚本；新增 `#lead-modal` 模态结构（含活码/表单/成功态三段） |
| `src/js/auth/auth-ui.js` | T3 个人中心「财税服务」卡片（`PROFILE_CARDS_CONFIG` + 点击分流 → `LeadModal.open`） |
| 内容中心（无需改代码） | T2 由运营在管理台配置 `type=operation` + `placements` + `link_url=#lead` |
| `admin.html` | 13C：新增「线索」导航项（桌面 + 移动）与 `#view-leads` 视图（漏斗区 + 列表 + 分页 + 导出） |
| `src/js/admin/admin.js` | 13C：`state.leads` + `loadLeads` / `loadLeadFunnel` / `renderLeadsTable` / `updateLeadStatus` / `assignLead` / `exportLeads`；状态与来源元数据表；`data-act` 分发与筛选绑定 |

---

## 7. 埋点与北极星指标（13E）

漏斗链路：

```
visit → calc_done → share/save → lead_click → lead_submit
```

**唯一北极星指标：`lead_submit / calc_done`（线索转化率）。**

不要盯 DAU / PV —— 服务型公司没有留资的流量等于零。

---

## 8. 合规清单

| 项 | 要求 |
|---|---|
| 文案 | 禁用"避税 / 节税 / 税筹 / 保证退税"；统一"测算 / 申报核对 / 汇算清缴代办" |
| 隐私 | 留资表单必须显式勾选同意；`consent=true` 服务端强校验并落库 |
| 数据 | **禁止**后台静默收集未留资用户的收入数据并外呼（红线） |
| 免责 | 结果页与分享图固定展示"测算结果仅供参考，不构成税务建议" |
| 涉税服务 | 软件只做"测算 + 核对引导"，落地建议由公司有资质主体承接 |

---

## 9. 排期与 DoD

```
13A（后端地基，≈2 天）    Lead 模型 + 迁移 + POST /api/leads + /api/admin/leads 系列 + 限流 + 单测/门禁
13B（前端触点，≈2 天）    lead-modal + 结果页分流 + 个人中心卡片
13C（管理台，≈1.5 天）    「线索」Tab：漏斗条 + 列表 + 状态机 + 分配 + 导出 + 跟进话术
13D（分享图，≈1.5 天）    captureToCanvas 抽层 + 2 模板 + 二维码 + 生成前预览确认
13E（埋点，≈1 天）        漏斗链路打通
```

### Definition of Done（13A）

- [x] `Lead` 模型在生产（PostgreSQL）与开发（SQLite）双 schema 一致
- [x] 迁移文件生成，`prisma migrate deploy` 可自动执行（迁移 `20260912_add_leads`，DDL 经 `prisma migrate diff` 逐字段核对）
- [x] `POST /api/leads` 游客（无 JWT）可提交成功，返回 `201 { id }`
- [x] `consent=false` / 缺 name / phone 与 wechat 都空 / phone 非法 → 全部 400
- [x] 同 phone 24h 内重复提交 → 不新建记录，返回 200，库中仍为 1 条
- [x] 超过 10 次/IP/小时 → 429
- [x] `GET/PATCH /api/admin/leads` 无 `X-Admin-Token` → 401；有令牌可用
- [x] `GET /api/admin/leads/stats` 返回各状态计数与今日新增
- [x] `GET /api/admin/leads/export` 返回 CSV（含 BOM，Excel 中文不乱码；备注做公式注入防护）
- [x] 新断言入 `verify:local`（14 项）；单测入 `tests/leads.test.js`（20 例）
- [x] Swagger `/api/docs` 可见全部端点（13C 阶段补上守护：`/api/docs.json` 可解析且含线索端点的门禁断言）

### Definition of Done（13B）

- [x] 结果页情境引导只在经营所得 / 汇算清缴 / 分类所得注入；谈薪（`reverse`）永不出现（白名单 + `BLOCKED_TYPES` 双保险，门禁断言守护）
- [x] 留资弹窗双通道：企业微信活码（`window.LEAD_CONFIG.wecomQrUrl`，未配置自动降级）+ 留言表单
- [x] 表单校验：称呼必填；手机号 / 微信号二选一；手机号 `^1[3-9]\d{9}$`；`consent` 必须勾选
- [x] 提交成功显示成功态并自动关闭；失败在弹窗内提示（不打断主流程）
- [x] 个人中心「财税服务」常驻卡片 → 弹窗（`source=profile`）
- [x] 触点事件 `euriskotax:lead-click` / `euriskotax:lead-submit` 派发
- [x] 新断言入 `verify:local`（7 项前端静态指纹）

### Definition of Done（13C）

- [x] 管理台新增「线索」Tab（桌面 + 移动导航）与 `#view-leads` 视图
- [x] 漏斗条：线索总数 / 今日新增 / 待分配 / 已成交·转化率 + `new→contacted→qualified→converted` 进度条
- [x] 列表：联系人（手机号 / 微信 / 关联账号）、公司·主体、需求、来源·情境·备注、状态、跟进人、提交时间
- [x] 状态机：行内下拉即时 PATCH 保存，失败自动回滚为服务端真实值
- [x] 分配：填跟进人 → 保存（清空 = 取消分配，传 `null`）
- [x] 筛选：状态 / 来源下拉即查；关键词（姓名 / 手机号 / 公司）回车查询；分页
- [x] 导出 CSV：按当前筛选下载（Blob + `Content-Disposition` 文件名），401 走登出
- [x] 新断言入 `verify:local`（2 项 admin 静态指纹）

> 说明：13C 暂以「漏斗条 + 列表 + 状态机 + 分配 + 导出」为交付范围；「跟进话术模板一键复制」列为可选增强（未做，不阻塞）。

### Definition of Done（13D）

- [x] 截图公共层 `src/js/export/capture.js`（`captureHtml` / `downloadCanvas`）：PDF 导出与分享图共用同一套 html2canvas 配置与临时容器清理（成功/失败双路径都清理，避免残留隐形 div 撑出横向滚动条）
- [x] `navigation-ui.exportToPDF` 改用公共层，自身不再保留 html2canvas 调用（单测 + 门禁双守护，从根上消除配置漂移）
- [x] 2 个分享图模板：`income` 正向结果卡（综合所得 / 经营所得 / 分类所得）+ `negotiation` 谈薪卡，覆盖全部 4 类结果
- [x] 取数直接读结果页已渲染 DOM（对计算模块零耦合）；hero 仍为占位符 `¥0` 时拒绝出图（一张写着 ¥0 的分享图比不出图更伤品牌）
- [x] 生成前预览确认弹窗 + 保存 PNG（手机端提示长按保存）；用户可在预览阶段放弃，不强制保存
- [x] 二维码归因（T4）：指向 `?source=share`，`lead-modal` 落地读取并记为留资 `source`；二维码库加载失败降级为域名文字，不阻断出图
- [x] 合规：每张图固定展示「本测算结果仅供参考，不构成税务建议」；文案不含「避税 / 节税 / 税筹」
- [x] 谈薪页保留分享图出口（13B 硬约束下它是该页唯一的转化动作）—— 单测专门守护这一产品决策
- [x] 埋点闭环：生成成功派发 `euriskotax:share` → 13E 漏斗 `share` 步；埋点在「真的拿到图」之后触发，避免生成失败被记成一次分享
- [x] 单测 `tests/share-card.test.js` 22 例（模板分流 / 与 index.html 的 selector 契约 / 合规 / 归因与埋点闭环 / 公共层复用）；门禁新增 5 项静态断言

### Definition of Done（13E）

- [x] `FunnelEvent` 模型（`date` + `step` 复合唯一，日粒度聚合），生产 PG 与 dev SQLite 双 schema 一致；迁移 `20260913_add_funnel_events`
- [x] 公开埋点端点 `POST /api/stats/funnel`：**无需登录**、step 白名单、600 次/10 分钟/IP、日粒度 upsert 自增
- [x] 匿名全量口径：`visit` / `calc_done` 覆盖游客，修正旧口径（原只在「登录用户保存计算」时上报，分母严重偏低）
- [x] 零个人标识：不存 IP / 设备 ID / user_id，从结构上规避个保法风险，无需脱敏与清理策略
- [x] `GET /api/admin/leads/funnel?days=7`：各步累计 + 今日 + 各步转化率 + 北极星；`lead_submit` 直接 count `Lead` 表（唯一真相，不入埋点表）
- [x] 前端接线 `src/js/stats/funnel-tracking.js`：visit 会话级一次、calc_done 绑 4 个计算按钮（结果容器可见才计）、save 复用 `euriskotax:calc-saved`、share 预留 `euriskotax:share`（13D 接入）、lead_click 包装 `LeadModal.open` 唯一入口
- [x] 管理台「线索」Tab 新增「转化漏斗」区块（4 步 + 每步转化率 + 北极星徽标），与线索状态漏斗并列且语义区分
- [x] 转化率分母为 0 返回 `null`（显示「—」）而非 0%（避免被误读为「转化极差」）
- [x] 新断言入 `verify:local`（3 项：匿名上报 201 / 白名单外 step 400 / 漏斗统计结构）；单测 `tests/funnel.test.js` 9 例（含跨端步骤契约漂移守护）

---

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| 公开端点被刷（垃圾线索） | 10 次/IP/小时限流 + 同手机号 24h 幂等去重 + 字段白名单归一化 |
| 顾问跟进不及时导致线索过期 | 管理台「今日新增 / 待跟进」置顶；`created_at` 倒序；后续可加超时提醒（复用 ops-notify） |
| 误把服务引导加到工资页 | 分流规则写成白名单常量，并由 `verify:local` 断言守护 |
| 线索含敏感信息（收入相关） | 表单不采集具体收入金额，只采集联系方式 + 主体类型 + 需求；`consent` 留痕 |
| 用户注销后线索丢失 | `onDelete: SetNull`，线索保留（业务资产不随账号消失） |
| 内容中心投放误伤（服务入口投给打工人） | 用 `audience` 分层 + 运营配置审查；文案避免"企业服务"字样出现在通用位 |

---

## 11. 与后续规划的关系

- **阶段14 变现**：`ProCode` 兑换码（复用 `InviteCode` 事务模式）+ C2 城市社保参数库 + 高商业意图 SEO 落地页。
- **阶段15 迁移与合规升级**：ICP 备案通过后 → 迁腾讯云国内节点（Zeabur 保留为预发）→ 官方支付 → 微信小程序 → B 端 API。
- **与阶段12 的关系**：支付体系与 B 端 API 从阶段12 拆出后置到阶段15（被备案阻塞）；C2 移入阶段14。

---

## 决策记录

| 日期 | 决策 | 结论 |
|------|------|------|
| 2026-09-12 | D1：工资/谈薪页不出服务引导，仅出分享图 | 确认 |
| 2026-09-12 | D2：留资即时通道用企业微信活码 | 确认 |
| 2026-09-12 | D3：专业版权益含「1 次免费顾问咨询」 | 确认 |
| 2026-09-12 | D4：正式域名 `.com` 优先，尽早定死（PWA 绑定域名） | 确认 |
| 2026-09-12 | 支付体系与 B 端 API 从阶段12 拆出，后置到阶段15；新增阶段13 获客与转化 | 确认 |

---

*文档创建：2026-09-12*
