# EuriskoTax 响应式规则维护手册

**版本**: 1.2.0
**创建**: 2026-08-10
**更新**: 2026-08-11
**适用**: 主页、个人中心、税务助手三大模块的响应式布局维护与扩展

---

## 目录

1. [断点规范](#1-断点规范)
2. [主页响应式规则（10 项）](#2-主页响应式规则10-项)
3. [个人中心响应式规则（6 项）](#3-个人中心响应式规则6-项)
4. [税务助手响应式规则（13 项）](#4-税务助手响应式规则13-项)
5. [性能优化关联说明](#5-性能优化关联说明)
6. [维护检查清单](#6-维护检查清单)
7. [移动端验证方法](#7-移动端验证方法)

---

## 1. 断点规范

本项目使用 Tailwind CSS 默认断点，所有自定义媒体查询与之对齐：

| 断点前缀 | 最小宽度 | 对应 `@media` | 用途 |
|----------|---------|--------------|------|
| (默认) | 0px | `max-width: 640px` | 移动端优先样式 |
| `sm:` | 640px | `min-width: 640px` | 大手机/小平板 |
| `md:` | 768px | `min-width: 768px` | 平板 |
| `lg:` | 1024px | `min-width: 1024px` | 桌面 |
| `xl:` | 1280px | `min-width: 1280px` | 大桌面 |

**核心原则**：移动端优先编写，通过 `sm:`/`md:`/`lg:` 逐步增强。

---

## 2. 主页响应式规则（10 项）

> 涉及文件：`index.html`
> 页面 ID：`#mode-selection-page`

### 规则 2.1 — 首页卡片内边距

| 项目 | 值 |
|------|---|
| 选择器 | `.home-card` |
| 位置 | [index.html#L394-L396](../../index.html#L394-L396) |
| 移动端 | `px-4 py-3 mb-3`（16px / 12px / 12px） |
| 桌面端 | `sm:px-5 sm:py-4 sm:mb-4`（20px / 16px / 16px） |

### 规则 2.2 — 模式卡片内边距

| 项目 | 值 |
|------|---|
| 选择器 | `.mode-card` |
| 位置 | [index.html#L405-L414](../../index.html#L405-L414) |
| 移动端 | `padding: 0.875rem 0.75rem 0.75rem`（14px 12px 12px） |
| 桌面端 | `padding: 1.25rem 1rem 1rem`（20px 16px 16px） |
| 断点 | `@media (min-width: 640px)` |

### 规则 2.3 — 模式卡片图标尺寸

| 项目 | 值 |
|------|---|
| 选择器 | `.mode-card-icon` |
| 位置 | [index.html#L452-L456](../../index.html#L452-L456) |
| 移动端 | `w-12 h-12 text-xl`（48px / 1.25rem） |
| 桌面端 | `sm:w-14 sm:h-14 sm:text-2xl`（56px / 1.5rem） |

### 规则 2.4 — 最近计算卡片宽度

| 项目 | 值 |
|------|---|
| 选择器 | `.recent-card` |
| 位置 | [index.html#L492-L499](../../index.html#L492-L499) |
| 移动端 | `flex: 0 0 160px` |
| 桌面端 | `flex-basis: 180px` |
| 断点 | `@media (min-width: 640px)` |

### 规则 2.5 — 移动端触摸区优化

| 项目 | 值 |
|------|---|
| 选择器 | `.input-field`, `.step-number`, `.calc-back-btn`, `.calc-action-btn` |
| 位置 | [index.html#L656-L685](../../index.html#L656-L685) |
| 断点 | `@media (max-width: 640px)` |
| 说明 | 输入框 `min-height: 40px`，按钮 `w-9 h-9`，预览数值加粗 |

### 规则 2.6 — 移动端卡片圆角缩小

| 项目 | 值 |
|------|---|
| 选择器 | `.home-card`, `.mode-card` |
| 位置 | [index.html#L678-L685](../../index.html#L678-L685) |
| 断点 | `@media (max-width: 640px)` |
| 说明 | 从 `rounded-xl`（12px）降为 `rounded-lg`（8px），更紧凑 |

### 规则 2.7 — 深色模式移动端阴影

| 项目 | 值 |
|------|---|
| 选择器 | `.dark .home-card`, `.dark .mode-card`, `.dark .calc-sticky-header`, `.dark .calc-preview-bar` |
| 位置 | [index.html#L826-L839](../../index.html#L826-L839) |
| 断点 | `@media (max-width: 640px)` |
| 说明 | 阴影从 `0 1px 4px` 降为 `0 1px 2px`，减少视觉噪音 |

### 规则 2.8 — 欢迎标题字号

| 项目 | 值 |
|------|---|
| 选择器 | `#home-greeting` |
| 位置 | [index.html#L1688](../../index.html#L1688) |
| 移动端 | `text-lg`（18px） |
| 桌面端 | `sm:text-xl`（20px） |

### 规则 2.9 — 欢迎区 Logo 显示

| 项目 | 值 |
|------|---|
| 选择器 | `#mode-selection-page img[src="images/logo.png"]` |
| 位置 | [index.html#L1691](../../index.html#L1691) |
| 移动端 | `hidden`（隐藏，节省空间） |
| 桌面端 | `sm:block`（显示） |

### 规则 2.10 — 模式卡片网格列数

| 项目 | 值 |
|------|---|
| 选择器 | 模式卡片网格容器 |
| 位置 | [index.html#L1715](../../index.html#L1715) |
| 移动端 | `grid-cols-2`（2 列） |
| 桌面端 | `lg:grid-cols-4`（4 列） |
| 间距 | `gap-3`（12px） |

---

## 3. 个人中心响应式规则（6 项）

> 涉及文件：`index.html`、`src/js/auth/auth-ui.js`
> 页面 ID：`#profile-page` 及子页面

### 规则 3.1 — 子导航栏（顶栏）

| 项目 | 值 |
|------|---|
| 选择器 | `.profile-sub-nav` |
| 位置 | [index.html#L311-L314](../../index.html#L311-L314) |
| 说明 | `sticky top-14 z-30`，已移除负边距避免小屏水平溢出 |
| 内边距 | `padding: 0.625rem 1rem`（10px 16px） |

### 规则 3.2 — 用户信息卡片布局切换

| 项目 | 值 |
|------|---|
| 选择器 | `.profile-user-card` 及子元素 |
| 位置 | [index.html#L336-L367](../../index.html#L336-L367) |
| 移动端 | `flex-col items-center text-center`，按钮全宽 `w-full` |
| 桌面端 | `flex-row items-center text-left`，按钮自适应 `w-auto ml-auto` |
| 断点 | `@media (min-width: 640px)` |

**关键细节**：

| 元素 | 移动端 | 桌面端 |
|------|--------|--------|
| 头像 | `mr-0`（无右边距） | `mr-6`（24px 右边距） |
| 信息区 | `w-full`（全宽） | `w-auto flex-1 min-w-0`（弹性填充） |
| 操作区 | `w-full`（全宽） | `w-auto ml-auto`（右对齐） |
| 按钮 | `w-full`（全宽） | `w-auto`（自适应） |

### 规则 3.3 — 子页面容器内边距

| 项目 | 值 |
|------|---|
| 选择器 | 所有 `#profile-*-page` 的直接子容器 |
| 位置 | [index.html#L5402](../../index.html#L5402) 等共 6 处 |
| 说明 | 统一添加 `px-4`（16px 水平内边距），防止内容贴边 |

涉及页面：`profile-page`、`profile-settings-page`、`profile-tax-page`、`profile-data-page`、`profile-calendar-page`、`profile-history-page`

### 规则 3.4 — 统计卡片网格

| 项目 | 值 |
|------|---|
| 选择器 | `#profile-stats-grid` |
| 位置 | [index.html#L5431](../../index.html#L5431) |
| 移动端 | `grid-cols-2`（2 列） |
| 桌面端 | `md:grid-cols-4`（4 列） |
| 间距 | `gap-4`（16px） |

### 规则 3.5 — 功能模块卡片网格

| 项目 | 值 |
|------|---|
| 选择器 | `#profile-cards-grid` |
| 位置 | [index.html#L5434](../../index.html#L5434) |
| 移动端 | `grid-cols-1`（1 列） |
| 平板 | `md:grid-cols-2`（2 列） |
| 桌面端 | `lg:grid-cols-3`（3 列） |
| 间距 | `gap-6`（24px） |

### 规则 3.6 — 税务档案标题换行

| 项目 | 值 |
|------|---|
| 选择器 | 税务档案页面标题区 |
| 位置 | [index.html#L5558](../../index.html#L5558) |
| 移动端 | `flex-col gap-2`（标题与说明垂直排列） |
| 桌面端 | `sm:flex-row sm:items-center sm:justify-between`（水平排列） |

---

## 4. 税务助手响应式规则（13 项）

> 涉及文件：`index.html`
> 组件类名前缀：`.assistant-*`

### 规则 4.1 — 抽屉宽度

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-drawer` |
| 位置 | [index.html#L1479-L1482](../../index.html#L1479-L1482) |
| 桌面端 | `width: 480px`（固定宽度侧边栏） |
| 移动端 | `width: 100%`（全屏覆盖） |
| 断点 | `@media (max-width: 640px)` |
| 备注 | 始终带 `max-width: 100%` 防止超出视口 |

### 规则 4.2 — 头部内边距

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-header` |
| 位置 | [index.html#L1483-L1485](../../index.html#L1483-L1485) |
| 桌面端 | `padding: 16px 20px` |
| 移动端 | `padding: 12px 16px` |
| 断点 | `@media (max-width: 640px)` |

### 规则 4.3 — 标题字号

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-title` |
| 位置 | [index.html#L1486-L1488](../../index.html#L1486-L1488) |
| 桌面端 | `font-size: 18px` |
| 移动端 | `font-size: 16px` |
| 断点 | `@media (max-width: 640px)` |

### 规则 4.4 — 主体内边距

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-body` |
| 位置 | [index.html#L1489-L1491](../../index.html#L1489-L1491) |
| 桌面端 | `padding: 16px 20px` |
| 移动端 | `padding: 12px 16px` |
| 断点 | `@media (max-width: 640px)` |

### 规则 4.5 — 搜索建议定位与高度

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-suggest` |
| 位置 | [index.html#L1492-L1496](../../index.html#L1492-L1496) |
| 桌面端 | `left: 20px; right: 20px; max-height: 260px` |
| 移动端 | `left: 16px; right: 16px; max-height: 200px` |
| 断点 | `@media (max-width: 640px)` |
| 说明 | 与主体内边距对齐；移动端屏幕小，max-height 从 260px 降至 200px 防止占比过大 |
| 状态 | ✅ 已修复（v1.1.0 新增 max-height 适配） |

### 规则 4.6 — 快捷操作网格

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-shortcuts` |
| 位置 | [index.html#L1497-L1499](../../index.html#L1497-L1499) |
| 桌面端 | `grid-template-columns: repeat(4, 1fr)` |
| 移动端 | `grid-template-columns: repeat(4, 1fr)`（保持 4 列） |
| 断点 | `@media (max-width: 640px)` |
| 说明 | 移动端显式声明 4 列，防止继承被覆盖 |

### 规则 4.7 — 搜索输入框字号 ✅ 已修复

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-search` |
| 位置 | [index.html#L1500-L1503](../../index.html#L1500-L1503) |
| 桌面端 | `font-size: 14px` |
| 移动端 | `font-size: 16px` |
| 断点 | `@media (max-width: 640px)` |
| 说明 | **iOS Safari 已知行为**：input 的 font-size < 16px 时，聚焦会自动缩放整个页面导致布局错乱。移动端必须设为 16px |
| 状态 | ✅ 已修复（v1.1.0） |

### 规则 4.8 — 快捷功能文字字号 ✅ 已修复

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-shortcut` |
| 位置 | [index.html#L1504-L1507](../../index.html#L1504-L1507) |
| 桌面端 | `font-size: 11px` |
| 移动端 | `font-size: 12px` |
| 断点 | `@media (max-width: 640px)` |
| 说明 | 11px 在移动端难以辨认，提升至 12px |
| 状态 | ✅ 已修复（v1.1.0） |

### 规则 4.9 — 分类标签触摸区 ✅ 已修复

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-cat` |
| 位置 | [index.html#L1508-L1511](../../index.html#L1508-L1511) |
| 桌面端 | `padding: 5px 12px`（高约 30px） |
| 移动端 | `padding: 8px 14px`（高约 36px） |
| 断点 | `@media (max-width: 640px)` |
| 说明 | Apple HIG 建议触摸区 ≥ 44px，增大 padding 提升可点击性 |
| 状态 | ✅ 已修复（v1.1.0） |

### 规则 4.10 — 热门问题标签触摸区 ✅ 已修复

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-hot-chip` |
| 位置 | [index.html#L1512-L1514](../../index.html#L1512-L1514) |
| 桌面端 | `padding: 5px 11px`（高约 30px） |
| 移动端 | `padding: 8px 13px`（高约 36px） |
| 断点 | `@media (max-width: 640px)` |
| 说明 | 同规则 4.9，增大触摸区 |
| 状态 | ✅ 已修复（v1.1.0） |

### 规则 4.11 — 收藏按钮触摸区 ✅ 已修复

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-fav-btn` |
| 位置 | [index.html#L1515-L1517](../../index.html#L1515-L1517) |
| 桌面端 | `padding: 4px 10px`（高约 28px） |
| 移动端 | `padding: 6px 12px`（高约 32px） |
| 断点 | `@media (max-width: 640px)` |
| 说明 | 收藏按钮触摸区过小，增大 padding |
| 状态 | ✅ 已修复（v1.1.0） |

### 规则 4.12 — 反馈按钮触摸区 ✅ 已修复

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-fb-btn` |
| 位置 | [index.html#L1518-L1520](../../index.html#L1518-L1520) |
| 桌面端 | `padding: 4px 10px`（高约 28px） |
| 移动端 | `padding: 6px 12px`（高约 32px） |
| 断点 | `@media (max-width: 640px)` |
| 说明 | 同规则 4.11，反馈按钮触摸区过小 |
| 状态 | ✅ 已修复（v1.1.0） |

### 规则 4.13 — 关联跳转按钮触摸区 ✅ 已修复

| 项目 | 值 |
|------|---|
| 选择器 | `.assistant-related-btn` |
| 位置 | [index.html#L1521-L1523](../../index.html#L1521-L1523) |
| 桌面端 | `padding: 5px 12px`（高约 30px） |
| 移动端 | `padding: 7px 14px`（高约 34px） |
| 断点 | `@media (max-width: 640px)` |
| 说明 | 答案底部"去XX测算"关联跳转按钮，增大触摸区 |
| 状态 | ✅ 已修复（v1.1.0） |

---

## 5. 性能优化关联说明

### 5.1 渲染性能数据（2026-08-10 实测）

通过 `ProfilePerf` 日志工具在 `loadProfile` 和 `showPage` 中记录的实测数据：

**loadProfile 总耗时分解：**

| 阶段 | 耗时 | 占比 | 说明 |
|------|------|------|------|
| API 获取用户信息 | 322.60ms | 97.1% | 网络请求，前端不可控 |
| 同步更新顶栏（5 字段） | 0.10ms | 0.03% | `document.getElementById` + `value`/`textContent` 赋值 |
| rAF 等待延迟 | 5.10ms | 1.53% | 主线程未阻塞，浏览器快速触发回调 |
| 渲染（5 子步骤） | 3.30ms | 0.99% | 见下表 |
| **总计** | **332.20ms** | 100% | — |

**渲染子步骤明细：**

| 子步骤 | 耗时 |
|--------|------|
| 渲染统计卡片（`renderProfileStats`） | 0.60ms |
| 更新统计数据（`updateProfileStats`） | 0.20ms |
| 渲染模块卡片（`renderProfileCards`） | 0.60ms |
| 加载税务档案（`loadTaxProfile`） | 0.30ms |
| 渲染税务日历（`renderTaxCalendar`） | 0.50ms |

**showPage 性能：**

| 场景 | 总耗时 | 说明 |
|------|--------|------|
| 初始导航（首次进入） | 0.90ms | 无过渡动画，直接显示 |
| 常规导航（页面间跳转） | 206.10ms | 含 200ms 淡出动画延迟，JS 执行仅 ~0.60ms |

### 5.2 优化手段与效果

| 优化手段 | 实现位置 | 效果 |
|----------|---------|------|
| 静态 Tailwind 类名 | `PROFILE_STATS_CONFIG` / `PROFILE_CARDS_CONFIG` | 消除动态类名拼接触发 CDN JIT 重扫，渲染降至 3.30ms |
| rAF 延迟渲染 | `loadProfile` 阶段 3 | 非关键 DOM 操作延迟到下一帧，不阻塞页面切换动画 |
| showPage 优先执行 | `profile-link` click 事件 | 页面切换动画立即开始，数据加载异步进行 |
| 渲染幂等守卫 | `renderProfileStats` / `renderProfileCards` | `grid.children.length > 0` 时跳过，避免重复渲染 |

### 5.3 功能逻辑影响评估

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 卡片 ID 匹配 | ✅ 通过 | 6 个卡片 ID 与 `profileCardConfigs` 事件绑定完全对应 |
| 统计 ID 匹配 | ✅ 通过 | 4 个统计 ID 与 `updateProfileStats()` 中 `getElementById` 完全对应 |
| 事件委托 | ✅ 通过 | `profileCardsGrid` 上的 click 事件委托正常工作 |
| localStorage 操作 | ✅ 通过 | CSS 修改不影响数据读写 |
| rAF 竞态安全 | ✅ 通过 | 幂等守卫防止重复渲染；元素隐藏时仍在 DOM 中，更新安全 |
| 页面切换逻辑 | ✅ 通过 | `showPage` 的历史栈、过渡动画、初始导航分支均未改变 |

---

## 6. 维护检查清单

新增或修改响应式规则时，逐项检查：

- [ ] **断点一致**：新规则使用的断点与第 1 节规范一致（640/768/1024/1280）
- [ ] **移动端优先**：默认样式为移动端，通过 `sm:`/`md:` 逐步增强
- [ ] **无水平溢出**：在 375px 宽度下 `document.body.scrollWidth <= document.body.clientWidth`
- [ ] **触摸区达标**：可点击元素最小 44×44px（或 `min-height: 40px`）
- [ ] **静态类名**：JS 生成的 HTML 中 Tailwind 类名为完整静态字符串，不使用 `${variable}` 拼接
- [ ] **深色模式**：新增样式同时编写 `.dark` 前缀的深色模式覆盖
- [ ] **ID 匹配**：JS 动态生成的元素 ID 与事件绑定/数据更新代码一致
- [ ] **幂等守卫**：`innerHTML` 渲染函数包含 `children.length > 0` 跳过逻辑
- [ ] **日志验证**：通过 `ProfilePerf.log` 确认渲染耗时 < 5ms

---

## 7. 移动端验证方法

### 7.1 Chrome DevTools 设备模拟（推荐）

1. 按 `F12` 打开开发者工具
2. `Ctrl+Shift+M` 切换到设备工具栏
3. 选择 `iPhone 12 Pro`（390×844）或自定义 375×812
4. 刷新页面，检查各模块布局

### 7.2 媒体查询覆盖模拟（脚本方式）

当无法使用 DevTools 设备模拟时，可通过浏览器控制台执行以下脚本，强制启用移动端媒体查询：

```javascript
// 启用所有 max-width: 640px 媒体查询，禁用 min-width 媒体查询
const sheet = document.styleSheets[1]; // Tailwind CDN 样式表
for (const rule of sheet.cssRules) {
    if (rule instanceof CSSMediaRule) {
        const cond = rule.conditionText || rule.media.mediaText;
        if (cond.includes('max-width: 640px')) {
            rule.media.mediaText = 'all';           // 启用移动端
        } else if (cond.includes('min-width:')) {
            rule.media.mediaText = 'not all';       // 禁用桌面端
        }
    }
}
document.body.style.width = '375px';
document.body.style.overflowX = 'hidden';
```

> **注意**：此方法为模拟，`position: fixed` 元素仍以实际视口宽度为准。测试完毕后刷新页面恢复。

### 7.3 验证检查点

| 检查点 | 预期值 | 验证方式 |
|--------|--------|---------|
| body 宽度 | 375px | `document.body.offsetWidth` |
| 水平溢出 | 无 | `document.body.scrollWidth <= 375` |
| 模式卡片列数 | 2 | `getComputedStyle(grid).gridTemplateColumns` 含 2 值 |
| 模式卡片 padding | `14px 12px 12px` | `getComputedStyle(.mode-card).padding` |
| 欢迎标题字号 | 18px | `getComputedStyle(#home-greeting).fontSize` |
| Logo 显示 | `none` | `getComputedStyle(img).display` |
| 助手头部 padding | `12px 16px` | `getComputedStyle(.assistant-header).padding` |
| 助手标题字号 | 16px | `getComputedStyle(.assistant-title).fontSize` |

---

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-08-10 | 1.0.0 | 初始版本，收录 22 项响应式规则 + 性能实测数据 |
| 2026-08-11 | 1.1.0 | 税务助手新增 7 项移动端适配（规则 4.7-4.13），含 iOS Safari 搜索框缩放修复、5 个触摸区增大；规则 4.5 新增 max-height 适配。总计 29 项规则 |
| 2026-08-11 | 1.2.0 | 修复税务助手 3 个快捷功能 Bug（非响应式规则变更，但影响移动端交互可用性）：<br>**Bug1 — showHelpModal 未定义**：在 `tax-assistant-ui.js#L456-L461` 新增 `showHelpModal()` 函数，调用 `window.openModal(document.getElementById('help-modal'))`，并暴露到 `window.showHelpModal`。修复前"税率表速查"和"使用帮助"点击后静默失败。<br>**Bug2 — goToStep 参数类型错误**：`handleShortcutAction` 的 `goBonusCalc` 分支从 `goToStep('forward')` 改为 `showPage('forward-calculation-page') + goToStep(1)`。`goToStep` 期望数字参数（1/2/3/4），原字符串 `'forward'` 导致所有步骤被隐藏但无一步显示。<br>**Bug3 — 税率表速查无 UI**：在 `tax-assistant-ui.js#L464-L571` 新增 `buildRateTableModalHTML()` 和 `showRateTable()` 函数，动态生成含综合所得(7级)、年终奖(7级)、经营所得(5级)三张税率表 + 分类所得 20% 比例税率说明的模态框。模态框动态创建到 body，含关闭按钮和遮罩点击关闭。税率表数据与 `tax-calculator.js#L7-L43` 保持同步。 |
