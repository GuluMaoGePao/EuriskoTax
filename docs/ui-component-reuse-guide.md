# EuriskoTax UI 组件复用指南

**版本**: 1.0.0
**适用**: 本项目前端开发，新增页面或功能时参考本指南复用已有组件和模式

---

## 目录

1. [Sticky 子导航栏](#1-sticky-子导航栏)
2. [配置驱动卡片渲染](#2-配置驱动卡片渲染)
3. [事件委托模式](#3-事件委托模式)
4. [通用函数模板](#4-通用函数模板)
5. [性能日志工具](#5-性能日志工具)
6. [深色模式适配](#6-深色模式适配)
7. [响应式布局](#7-响应式布局)
8. [新增页面检查清单](#8-新增页面检查清单)

---

## 1. Sticky 子导航栏

### 适用场景

任何需要"返回"操作的子页面（如设置页、详情页、表单页）。

### CSS 类名

| 类名 | 用途 | 关键属性 |
|------|------|---------|
| `.profile-sub-nav` | 容器 | `sticky top-14 z-30 backdrop-blur-sm border-b` |
| `.profile-sub-nav-inner` | 内部布局 | `flex items-center max-w-4xl mx-auto` |
| `.profile-sub-nav-back` | 返回按钮 | `text-primary hover:bg-primary/5 active:scale-95` |
| `.profile-sub-nav-title` | 页面标题 | `pointer-events-none`（居中不干扰点击） |

### HTML 模板

```html
<div id="your-page" class="page hidden">
    <div class="max-w-4xl mx-auto">
        <div class="profile-sub-nav">
            <div class="profile-sub-nav-inner">
                <button id="back-from-your-page" class="profile-sub-nav-back">
                    <i class="fa fa-arrow-left"></i><span>返回</span>
                </button>
                <span class="profile-sub-nav-title">页面标题</span>
            </div>
        </div>
        <!-- 页面内容 -->
    </div>
</div>
```

### JS 绑定（自动）

返回按钮无需手动绑定，`auth-ui.js` 中的通用绑定自动匹配所有 `id^="back-from-"` 的按钮：

```javascript
// auth-ui.js — 已存在，无需修改
document.querySelectorAll('[id^="back-from-"]').forEach(btn => {
    btn.addEventListener('click', () => goBack());
});
```

### 设计规范

- **返回箭头**: FontAwesome `fa-arrow-left`
- **标题**: 居中，`pointer-events-none` 避免干扰按钮点击
- **背景**: 浅色模式 `bg-white/95`，深色模式 `bg-gray-800/95`
- **动画**: `active:scale-95` 按压反馈
- **位置**: `sticky top-14`（紧贴顶部导航栏下方）

---

## 2. 配置驱动卡片渲染

### 适用场景

页面中有多个结构相同但数据不同的卡片（统计卡片、功能入口卡片等）。

### 模式说明

将卡片数据抽取为配置数组，通过统一的渲染函数生成 DOM，避免 HTML 重复。

### 配置定义

```javascript
// auth-ui.js 中的配置示例
const PROFILE_STATS_CONFIG = [
    { id: 'calc-count', icon: 'fa-calculator', label: '计算次数', value: '0', color: 'blue' },
    { id: 'profile-count', icon: 'fa-folder', label: '档案数量', value: '0', color: 'green' },
    { id: 'history-count', icon: 'fa-history', label: '历史记录', value: '0', color: 'purple' },
    { id: 'reminder-count', icon: 'fa-bell', label: '本月提醒', value: '0', color: 'orange' }
];

const PROFILE_CARDS_CONFIG = [
    { cardId: 'profile-card-history', icon: 'fa-history', title: '计算历史',
      desc: '查看所有计算记录', pageId: 'profile-history-page', loadFn: loadProfileHistory },
    { cardId: 'profile-card-data', icon: 'fa-database', title: '数据管理',
      desc: '导入/导出数据', pageId: 'profile-data-page', loadFn: loadProfileData },
    // ...
];
```

### 渲染函数

```javascript
function renderProfileStats() {
    const grid = document.getElementById('profile-stats-grid');
    if (!grid) return;
    grid.innerHTML = PROFILE_STATS_CONFIG.map(s => `
        <div class="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-${s.color}-100 flex items-center justify-center">
                    <i class="fa ${s.icon} text-${s.color}-600 text-lg"></i>
                </div>
                <div>
                    <div class="text-2xl font-bold text-gray-800" id="${s.id}">${s.value}</div>
                    <div class="text-xs text-gray-500">${s.label}</div>
                </div>
            </div>
        </div>
    `).join('');
}
```

### 复用要点

1. **配置数组**: 每个卡片一个对象，包含 id/icon/title/desc/pageId 等字段
2. **渲染函数**: 使用 `map().join('')` 生成 HTML 字符串
3. **扩展**: 新增卡片只需在配置数组中添加一项，无需修改渲染函数
4. **Tailwind 动态类名**: 使用模板字符串 `${color}` 拼接，Tailwind Play CDN 的 MutationObserver 会自动编译

---

## 3. 事件委托模式

### 适用场景

多个同类型元素需要绑定相同的事件处理逻辑（卡片点击、列表项点击等）。

### 模式说明

在父容器上绑定一个事件监听器，通过 `e.target.closest()` 判断点击来源，替代给每个子元素单独绑定。

### 实现代码

```javascript
// auth-ui.js — 卡片点击事件委托
const profileCardsGrid = document.getElementById('profile-cards-grid');
if (profileCardsGrid) {
    profileCardsGrid.addEventListener('click', (e) => {
        const card = e.target.closest('[id^="profile-card-"]');
        if (!card) return;
        const config = profileCardConfigs.find(c => c.cardId === card.id);
        if (!config) return;

        const start = performance.now();
        if (config.specialFn) { config.specialFn(); }
        else {
            if (config.loadFn) config.loadFn();
            if (config.pageId) showPage(config.pageId);
        }
        ProfilePerf.log('卡片点击', performance.now() - start, { cardId: card.id });
    });
}
```

### 复用要点

1. **父容器绑定**: 在_grid/列表容器上绑定一个 `click` 监听器
2. **closest 匹配**: `e.target.closest('[id^="prefix-"]')` 向上查找目标元素
3. **配置查找**: 通过 `find()` 从配置数组中匹配对应项
4. **优势**: 动态添加的子元素自动支持，无需重新绑定

---

## 4. 通用函数模板

### 4.1 步骤导航 — showStepByPanes

**文件**: `src/js/ui/navigation-ui.js`
**适用**: 任何多步骤页面（计算流程、向导流程等）

```javascript
// 通用步骤面板切换
function showStepByPanes(pageId, step, paneIds) {
    paneIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const currentPane = document.getElementById(paneIds[step - 1]);
    if (currentPane) currentPane.classList.remove('hidden');
    updateStepIndicator(pageId, step);
}

// 使用示例 — 新增计税模式只需定义面板 ID 数组
function showYourStep(step) {
    showStepByPanes('your-page', step, [
        'your-step-1', 'your-step-2', 'your-step-3'
    ]);
}
```

### 4.2 保存历史 — saveToHistory

**文件**: `src/js/calculation/tax-calculator.js`
**适用**: 任何需要保存到历史记录的计算结果

```javascript
// 通用保存到历史记录
function saveToHistory(results, type, titlePrefix) {
    if (!results || Object.keys(results).length === 0) {
        showAlert('请先完成计算后再保存');
        return false;
    }
    try {
        const savedData = {
            id: Date.now().toString(),
            type: type,
            title: titlePrefix + ' - ' + new Date().toLocaleDateString(),
            results: results,
            date: new Date().toISOString()
        };
        calculationHistory.unshift(savedData);
        if (calculationHistory.length > 50) {
            calculationHistory = calculationHistory.slice(0, 50);
        }
        localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));
        showSaveSuccessMessage();
        return true;
    } catch (error) {
        console.error('保存计算结果失败:', error);
        showSaveErrorMessage();
        return false;
    }
}

// 使用示例
function saveYourCalculation() {
    saveToHistory(yourCalculationResults, 'your-type', '你的计税模式');
}
```

### 4.3 按钮绑定 — bindCalcActionBtns

**文件**: `src/js/app.js`
**适用**: 计算页面的顶栏"保存"和"重置"按钮

```javascript
// 通用计算操作按钮绑定
function bindCalcActionBtns(config) {
    const { modeName, saveBtnId, resetBtnId, saveFn, resetFn, stepFn } = config;
    const saveBtn = document.getElementById(saveBtnId);
    if (saveBtn) saveBtn.addEventListener('click', () => {
        console.log(`%c[EuriskoTax] ACTION → 顶栏保存按钮（${modeName}）`, 'color: #1e40af; font-weight: bold;');
        saveFn();
    });
    const resetBtn = document.getElementById(resetBtnId);
    if (resetBtn) resetBtn.addEventListener('click', () => {
        console.log(`%c[EuriskoTax] ACTION → 顶栏重置按钮（${modeName}）`, 'color: #f59e0b; font-weight: bold;');
        resetFn();
        if (stepFn) stepFn(1);
    });
}

// 使用示例
bindCalcActionBtns({
    modeName: '你的模式',
    saveBtnId: 'your-save-btn',
    resetBtnId: 'your-reset-btn',
    saveFn: saveYourCalculation,
    resetFn: resetYourCalculation,
    stepFn: showYourStep
});
```

### 4.4 历史加载 — loadHistoryToList

**文件**: `src/js/auth/auth-ui.js`
**适用**: 任何需要加载历史记录到列表的场景

```javascript
// 通用历史记录加载
function loadHistoryToList(listId, emptyId) {
    const list = document.getElementById(listId);
    const empty = document.getElementById(emptyId);
    if (!list) return;

    if (calculationHistory.length === 0) {
        list.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }

    if (empty) empty.classList.add('hidden');
    list.innerHTML = calculationHistory.map(item => `
        <div class="bg-white rounded-lg p-4 shadow-sm mb-3">
            <div class="flex justify-between items-center">
                <div>
                    <div class="font-medium text-gray-800">${item.title}</div>
                    <div class="text-sm text-gray-500">${new Date(item.date).toLocaleString()}</div>
                </div>
                <span class="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">${item.type}</span>
            </div>
        </div>
    `).join('');
}
```

---

## 5. 性能日志工具

### 5.1 ProfilePerf（个人中心专用）

**文件**: `src/js/auth/auth-ui.js`

```javascript
const ProfilePerf = {
    log(action, durationMs, extra = {}) {
        const time = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(
            `%c[EuriskoTax Profile ${time}]`,
            'color: #7c3aed; font-weight: bold;',
            `${action} → ${durationMs.toFixed(2)}ms`,
            extra
        );
    },
    measure(action, fn, extra = {}) {
        const start = performance.now();
        const result = fn();
        this.log(action, performance.now() - start, extra);
        return result;
    },
    async measureAsync(action, fn, extra = {}) {
        const start = performance.now();
        const result = await fn();
        this.log(action, performance.now() - start, extra);
        return result;
    }
};

// 使用示例
ProfilePerf.measure('渲染卡片', renderProfileCards);
await ProfilePerf.measureAsync('获取用户信息', () => apiClient.getProfile());
```

### 5.2 InteractionLog（通用导航日志）

**文件**: `src/js/ui/navigation-ui.js`

```javascript
const InteractionLog = {
    enabled: true,
    log(type, action, details = {}) { /* ... */ },
    step(pageId, step, totalSteps) { /* ... */ },
    preview(pageId, values) { /* ... */ },
    calc(action, input, output) { /* ... */ },
    save(action, data) { /* ... */ },
    error(action, error) { /* ... */ }
};

// 使用示例
InteractionLog.step('your-page', 2, 4);
InteractionLog.calc('your-calc', { income: 10000 }, { tax: 300 });
```

### 新模块性能日志模板

为新模块创建性能日志工具时，复制 `ProfilePerf` 并修改颜色标识：

```javascript
const YourPerf = {
    log(action, durationMs, extra = {}) {
        const time = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(
            `%c[EuriskoTax YourModule ${time}]`,
            'color: #你的颜色; font-weight: bold;',
            `${action} → ${durationMs.toFixed(2)}ms`,
            extra
        );
    },
    measure(action, fn, extra = {}) { /* 同 ProfilePerf */ },
    async measureAsync(action, fn, extra = {}) { /* 同 ProfilePerf */ }
};
```

---

## 6. 深色模式适配

### 适配规则

1. **CSS 自定义类**: 在 `@layer components` 中定义，使用 `@apply` 组合 Tailwind 类
2. **深色覆盖**: 使用 `.dark .your-class` 选择器覆盖深色模式样式
3. **颜色对比**: 确保文字与背景有足够对比度

### 模板

```css
@layer components {
    .your-component {
        @apply bg-white border-gray-200 text-gray-800;
    }
    .dark .your-component {
        @apply bg-gray-800 border-gray-700 text-gray-200;
    }
}
```

### 已适配的组件清单

| 组件 | 浅色模式 | 深色模式 |
|------|---------|---------|
| `.profile-sub-nav` | `bg-white/95 border-gray-200` | `bg-gray-800/95 border-gray-700` |
| `.profile-sub-nav-title` | `text-gray-700` | `text-gray-200` |
| 卡片容器 | `bg-white border-gray-200` | `bg-gray-800 border-gray-700` |
| 统计卡片文字 | `text-gray-800` | `text-gray-200` |
| 主题切换按钮 | `fa-moon text-gray-600` | `fa-sun text-yellow-400` |

---

## 7. 响应式布局

### 断点策略

| 断点 | 宽度 | 布局调整 |
|------|------|---------|
| 默认（移动端） | < 640px | 单列布局，统计卡片 2 列 |
| sm | ≥ 640px | — |
| md | ≥ 768px | — |
| lg | ≥ 1024px | 多列布局，统计卡片 4 列 |

### 卡片网格响应式模板

```html
<!-- 统计卡片：移动端2列，桌面端4列 -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- 卡片内容 -->
</div>

<!-- 功能模块卡片：移动端1列，桌面端2列 -->
<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- 卡片内容 -->
</div>
```

### 顶部导航栏适配

- 主导航栏 `sticky top-0 z-40`，子导航栏 `sticky top-14 z-30`
- 移动端导航菜单折叠为汉堡按钮
- 步骤指示器移动端显示 "1/4" 进度文字

---

## 8. 新增页面检查清单

新增页面时按以下清单逐项检查：

### HTML 结构

- [ ] 页面容器使用 `<div id="your-page" class="page hidden">`
- [ ] 内容区使用 `<div class="max-w-4xl mx-auto">` 限制宽度
- [ ] 返回按钮使用 `.profile-sub-nav` 子导航栏模板
- [ ] 返回按钮 ID 以 `back-from-` 开头（自动绑定 goBack）
- [ ] 卡片使用 `grid` 布局并配响应式断点

### CSS 样式

- [ ] 自定义类名在 `@layer components` 中定义
- [ ] 添加 `.dark .your-class` 深色模式覆盖
- [ ] 使用 `@apply` 组合 Tailwind 工具类

### JavaScript

- [ ] 步骤导航使用 `showStepByPanes` 通用函数
- [ ] 保存功能使用 `saveToHistory` 通用函数
- [ ] 按钮绑定使用 `bindCalcActionBtns` 通用函数
- [ ] 卡片点击使用事件委托模式
- [ ] 关键交互节点添加 `ProfilePerf` 或 `InteractionLog` 日志
- [ ] 数值输入使用 `parseFloat(...) || 0` 防 NaN

### 测试

- [ ] 核心计算函数添加单元测试
- [ ] 浏览器测试浅色/深色/移动端 375px
- [ ] 性能日志确认耗时 < 200ms

---

## 附录：组件源码位置索引

| 组件/模式 | 源码文件 | 行号范围 |
|----------|---------|---------|
| `.profile-sub-nav` CSS | index.html | @layer components |
| `PROFILE_STATS_CONFIG` | src/js/auth/auth-ui.js | 顶部配置区 |
| `PROFILE_CARDS_CONFIG` | src/js/auth/auth-ui.js | 顶部配置区 |
| `renderProfileStats()` | src/js/auth/auth-ui.js | 渲染函数区 |
| `renderProfileCards()` | src/js/auth/auth-ui.js | 渲染函数区 |
| `ProfilePerf` | src/js/auth/auth-ui.js | loadProfile 上方 |
| `InteractionLog` | src/js/ui/navigation-ui.js | 文件顶部 |
| `showStepByPanes()` | src/js/ui/navigation-ui.js | 步骤导航区 |
| `saveToHistory()` | src/js/calculation/tax-calculator.js | L2452-L2477 |
| `bindCalcActionBtns()` | src/js/app.js | 按钮绑定区 |
| `loadHistoryToList()` | src/js/auth/auth-ui.js | 历史加载区 |
| 返回按钮通用绑定 | src/js/auth/auth-ui.js | DOMContentLoaded 内 |
