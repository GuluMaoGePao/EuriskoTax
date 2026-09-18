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
 * 色值 / 字号 / 间距仍与 src/css/tokens.css 同值镜像（改色需同步改两处），原因见 index.html 原注释：
 * 全站大量使用透明度修饰符（bg-primary/90、focus:ring-primary/50），变量化后一旦编译器不支持
 * `<alpha-value>` 会静默失效。
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
                secondary: '#3b82f6',
                accent: '#60a5fa',
                success: '#10b981',
                warning: '#f59e0b',
                danger: '#ef4444',
                light: '#f3f4f6',
                dark: '#1f2937'
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
