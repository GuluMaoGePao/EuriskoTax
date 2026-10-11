// 页面加载完成后绑定事件
window.addEventListener('DOMContentLoaded', function() {
    // 17B-4（v1.50.0）：原先这里绑着 forward / business / classification / reverse 四颗
    // `${id}-mode-btn`（那 4 张 mode-card 里的隐藏按钮）。旧整页删掉之后按钮只是转发到向导，
    // v1.142.0 连卡一起删了：工具箱的完整测算组与其它组一样由注册表渲染。
    // 同步这里必须删除绑定 —— 留一句 getElementById(...).addEventListener 会在 DOMContentLoaded
    // 里抛 TypeError，后面的登录态 / 历史记录初始化静默全残（17B-4 与 R2 两处已经踩过两次）。

    // R2（阶段20 P0）：顶栏 #help-btn 已随 DOM 一起删除，绑定必须同步删 ——
    // 留一句 getElementById('help-btn').addEventListener 会在 DOMContentLoaded 里抛 TypeError，
    // 后面所有初始化（登录态、历史记录）静默全残。使用帮助仍在「我的 → 使用帮助」卡与助手 FAB 两处。

    // 关闭模态框按钮
    document.getElementById('close-help-modal').addEventListener('click', function() {
        closeModal(document.getElementById('help-modal'));
    });
    
    // 帮助模态框标签页切换
    document.querySelectorAll('.help-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.help-tab-btn').forEach(b => {
                b.classList.remove('active', 'text-primary', 'bg-primary/10');
                b.classList.add('text-gray-600', 'hover:text-gray-800', 'hover:bg-gray-100');
            });
            this.classList.remove('text-gray-600', 'hover:text-gray-800', 'hover:bg-gray-100');
            this.classList.add('active', 'text-primary', 'bg-primary/10');
            
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.help-tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            document.getElementById('help-tab-' + tabId).classList.remove('hidden');
        });
    });
   // 关闭关于模态框
    document.getElementById('close-about-modal').addEventListener('click', function() {
        closeModal(document.getElementById('about-modal'));
    });

    // 主题切换按钮
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn.querySelector('i');
    // 初始化图标显示（使用 classList 避免覆盖定位样式）
    function setThemeIcon(isDark) {
        themeIcon.classList.remove('fa-moon-o', 'fa-sun-o');
        themeIcon.classList.add(isDark ? 'fa-sun-o' : 'fa-moon-o');
    }
    const isDarkMode = document.documentElement.classList.contains('dark');
    setThemeIcon(isDarkMode);
    themeToggleBtn.addEventListener('click', function() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        setThemeIcon(isDark);
    });

    // 17B-4（v1.50.0）：分类所得的页面式按钮（保存 / 重置 / 新增 / 导出 PDF / Word）随旧页面删除。
    // 保存与导出改由向导自己承担（deep-wizard-ui 的 execSave、结果卡上的导出），
    // 顶栏那套 bindCalcActionBtns 通用绑定的最后一个调用者也随之消失 ——
    // 页面式 deep 已经归零，它是为「每个页面各自有 save/reset/stepFn」准备的，留着只会误导下一个人。

    import('/src/js/auth/auth-ui.js').then(({ initAuth }) => {
        initAuth();
    });
    
    // 初始化
    loadHistoryRecords();

    // 17B-4：原先这里还有一句「初始化分类所得页面」的 resetClassificationCalculation() ——
    // 它是给页面里的空 list 与空结果区做初始化的，页面删了，这行就只是 throw ReferenceError 的机会。
});
