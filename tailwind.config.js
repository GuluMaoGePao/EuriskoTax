/**
 * Tailwind 构建配置（唯一真源）。
 *
 * 为什么从 Play CDN 换成离线编译：
 *   cdn.tailwindcss.com 是「浏览器里现算」的运行时，它把 config 交给编译器的那一步
 *   在本项目里实测失效（`window.tailwind.config` 恒为 `{}`），于是 `@apply shadow-card`
 *   解析不到主题扩展而抛 CssSyntaxError；Play CDN 遇到一次 @apply 失败会**整份样式表不注入**，
 *   表现为「整页裸奔」而不是「少几条样式」。这类故障不报错给用户、只在控制台留一行，排查成本极高。
 *   改为构建期产出 src/css/tailwind.css 后，config 与 CSS 在同一进程内解析，不存在「读不到」的可能。
 *
 * 色值 / 字号 / 间距的主体仍与 src/css/tokens.css 同值镜像，但有一处例外，见下方 textColor。
 *
 * 为什么只有「文字」类的品牌色接了 CSS 变量（19-1 验收查出的问题，不是预先设计）：
 *   深色模式对比度审计（tools/ops/ui-contrast-audit.js）查出：`.dark` 下所有 `text-primary`
 *   渲染为 rgb(30,64,175) —— 深蓝压在深色底上只有 **1.68:1**（AA 要求 4.5:1），
 *   全站 35 处文字不可读。根因是该 hex 写死在本文件，吃不到 tokens.css 里 `.dark` 作用域的换色。
 *   修法选择说明：
 *     · 改 tokens.css 无用 —— 工具类根本不读它；
 *     · 逐个工具类写 `.dark .text-primary{…}` 覆盖 —— 要枚举 /70 /80 等全部透明度变体，易漏；
 *     · colors.primary 整体变量化 —— 会把 bg- / border- / from- 一并变浅蓝，
 *       而那些块上的文字是白色的，反而制造出一串新的不达标。**收益不抵风险，不做**。
 *   最终取「按 utility 维度拆分」：Tailwind 的 textColor 与 backgroundColor 是两个独立主题键，
 *   在 `extend.textColor` 里覆盖同名 primary，只会替换 **文字** 类工具（含 /70 /80 透明度修饰符）的取值，
 *   bg / border / gradient 仍走 colors.* 的字面量 —— 正好是 AA 要的那一条边界。
 *   于是 `.dark` 下文字自动取 tokens.css 的浅蓝三元组（5.8:1），浅色档取值未变（零视觉变化）。
 *
 * 为什么带 fallback：admin.html **不加载** tokens.css，只引 src/css/admin.css；
 *   该产物同样由本 config 编译。带上兜底三元组后，即使将来重建 admin.css，
 *   缺失变量时也会退回品牌蓝而不是变成无效色。
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
    darkMode: 'class',
    // 扫描范围＝所有会用到 Tailwind 类名的源文件。
    // src/lib 必须排除：里面是第三方压缩产物，会被当成「类名候选」扫出海量垃圾规则，白白撑大产物。
    content: [
        './index.html',
        './admin.html',
        './clean-cache.html',
        './src/**/*.js',
        '!./src/lib/**'
    ],
    theme: {
        extend: {
            colors: {
                primary: '#1e40af',
                // secondary 原为 blue-500(#3b82f6)：白字压在上面只有 3.68:1，不达 AA。
                // 它的唯一实质消费方是 .btn-secondary（背景 + 白字），故整体降到 blue-600（5.15:1）。
                // tokens.css 无同义令牌，副色仍是本文件的职责，改这里即可。
                secondary: '#2563eb',
                accent: '#60a5fa',
                success: '#10b981',
                warning: '#f59e0b',
                danger: '#ef4444',
                light: '#f3f4f6',
                dark: '#1f2937'
            },
            // 见文件头注释：只有文字类走变量，且带兜底三元组（admin.html 不加载 tokens.css）。
            //
            // 为什么是 rgba(...) 而不是 rgb(... / <alpha-value>)（踩过，实测）：
            //   tokens.css 里 --c-brand-rgb 存的是**逗号分隔**的三元组（"30, 64, 175"，
            //   因为它同时要喂给 rgba(var(--c-brand-rgb), .35) 这类旧式调用）。
            //   把它塞进现代语法 rgb(var(...)/<alpha-value>) 后，替换结果是
            //   `rgb(30, 64, 175/1)` —— 逗号码与斜杠透明度**不允许混写**，整条声明被判无效，
            //   浏览器退回继承色（实测 light 下算出 rgb(0,0,0)、dark 下算出 inherited gray）。
            //   最阴的是它不报错：深色档恰好因为继承到浅灰而"看起来通过了审计"。
            //   故这里用旧式 rgba 四参数，替换结果是 rgba(30, 64, 175, 1)，各浏览器都认。
            textColor: {
                primary: 'rgba(var(--c-brand-rgb, 30, 64, 175), <alpha-value>)'
            },
            // Inter 从未真正加载过（全站无 @font-face / 无 Google Fonts 引用），
            // 实际一直在走后面的兜底。这里把真实生效的栈写全，去掉误导性的 Inter。
            fontFamily: {
                sans: ['PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
                    '-apple-system', 'BlinkMacSystemFont', 'Segoe UI',
                    'Helvetica Neue', 'Arial', 'sans-serif']
            },
            boxShadow: {
                'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
            }
        }
    },
    plugins: []
};
