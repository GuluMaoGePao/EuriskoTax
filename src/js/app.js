// 页面加载完成后绑定事件
window.addEventListener('DOMContentLoaded', function() {
    // 模式选择按钮
    document.getElementById('forward-mode-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] MODE → 选择"综合所得计税"模式', 'color: #1e40af; font-weight: bold;');
        // 阶段17 17B-3（v1.49.0）：综合所得已迁到 spec 驱动的向导，旧整页（约 970 行）删掉了。
        // 按钮本身保留，理由与 business / reverse 两处一样：首页卡片（home-ui 的 cardBtnMap）
        // 与工具箱的兜底路径最后都会点到它 —— 删掉按钮，两处的点击就掉进空白。
        var W = window.EuriskoDeepWizard;
        if (W && W.open('forward')) return;
        showAlert('综合所得测算暂不可用，请刷新页面后重试。');
    });

    document.getElementById('business-mode-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] MODE → 选择"经营所得计税"模式', 'color: #1e40af; font-weight: bold;');
        // 阶段17 17B-1：经营所得已迁到 spec 驱动的向导，17B-2（v1.47.0）把旧页面整页删掉了。
        // 按钮本身保留：首页卡片（home-ui 的 cardBtnMap）与工具箱兜底都还会点它，点击即进向导。
        var W = window.EuriskoDeepWizard;
        if (W && W.open('business')) return;
        showAlert('经营所得测算暂不可用，请刷新页面后重试。');
    });

    document.getElementById('classification-mode-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] MODE → 选择"分类所得计税"模式', 'color: #1e40af; font-weight: bold;');
        // 阶段17 17B-4（v1.50.0）：分类所得也迁到了 spec 驱动的向导，旧整页删掉了。
        // 按钮本身保留：首页静态卡片的点击最终落到它身上（工具箱会先按 data-tool-id 走向导），
        // 删掉按钮反而会让两处的点击进入空白。
        var W = window.EuriskoDeepWizard;
        if (W && W.open('classification')) return;
        showAlert('分类所得测算暂不可用，请刷新页面后重试。');
    });

    document.getElementById('reverse-mode-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] MODE → 选择"反向倒算"模式', 'color: #1e40af; font-weight: bold;');
        // 阶段17 17B-2（v1.48.0）：反向倒算已迁到 spec 驱动的向导，旧整页删掉了。
        // 按钮本身保留：首页静态卡片的点击最终落到它身上（工具箱会先按 data-tool-id 走向导），
        // 删掉按钮反而会让两处的点击进入空白。
        var W = window.EuriskoDeepWizard;
        if (W && W.open('reverse')) return;
        showAlert('反向倒算测算暂不可用，请刷新页面后重试。');
    });
    // 17B-4（v1.50.0）：原先这里还绑着 `back-to-mode-selection-classification` —— 它长在被删掉的
    // 分类所得页面里。页面没了还留一句 getElementById().addEventListener，DOMContentLoaded 里
    // 会在这一行抛 TypeError，**后面所有的初始化（登录态、历史记录）全跟着不执行** ——
    // 这类「删页面留下的空指针」比少一个按钮严重得多：界面看着正常，功能静默全残。
    // 返回动作由向导自己的 dw-back 承担（工具栏那套通用返回也是同一条路）。

    // 帮助按钮
    document.getElementById('help-btn').addEventListener('click', function() {
        openModal(document.getElementById('help-modal'));
    });
    
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
