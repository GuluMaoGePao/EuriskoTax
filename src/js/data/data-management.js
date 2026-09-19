// 全局变量
let calculationHistory = JSON.parse(localStorage.getItem('taxCalculationHistory') || '[]');

// 显示保存成功提示
function showSaveSuccessMessage() {
    // 创建提示元素
    const messageElement = document.createElement('div');
    messageElement.className = 'fixed top-6 right-6 bg-green-500 text-white px-5 py-3 rounded-lg shadow-xl z-50 transform transition-all duration-500 ease-out translate-x-full opacity-0';
    messageElement.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 10px 15px -3px rgba(0, 179, 89, 0.3)';
    
    // 添加内容
    messageElement.innerHTML = `
        <div class="flex items-center space-x-3">
            <div class="flex-shrink-0">
                <i class="fa fa-check-circle text-xl"></i>
            </div>
            <div>
                <p class="font-medium">保存成功</p>
                <p class="text-sm opacity-90">计算结果已保存到历史记录</p>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(messageElement);
    
    // 触发动画
    setTimeout(() => {
        messageElement.classList.remove('translate-x-full', 'opacity-0');
        messageElement.classList.add('translate-x-0', 'opacity-100');
    }, 10);
    
    // 3秒后自动消失
    setTimeout(() => {
        messageElement.classList.remove('translate-x-0', 'opacity-100');
        messageElement.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 500);
    }, 3000);
}

// 显示保存失败提示
function showSaveErrorMessage() {
    // 创建提示元素
    const messageElement = document.createElement('div');
    messageElement.className = 'fixed top-6 right-6 bg-red-500 text-white px-5 py-3 rounded-lg shadow-xl z-50 transform transition-all duration-500 ease-out translate-x-full opacity-0';
    messageElement.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 10px 15px -3px rgba(220, 38, 38, 0.3)';
    
    // 添加内容
    messageElement.innerHTML = `
        <div class="flex items-center space-x-3">
            <div class="flex-shrink-0">
                <i class="fa fa-exclamation-circle text-xl"></i>
            </div>
            <div>
                <p class="font-medium">保存失败</p>
                <p class="text-sm opacity-90">请检查网络连接后重试</p>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(messageElement);
    
    // 触发动画
    setTimeout(() => {
        messageElement.classList.remove('translate-x-full', 'opacity-0');
        messageElement.classList.add('translate-x-0', 'opacity-100');
    }, 10);
    
    // 3秒后自动消失
    setTimeout(() => {
        messageElement.classList.remove('translate-x-0', 'opacity-100');
        messageElement.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 500);
    }, 3000);
}



// 阶段10：本地历史变更 → 通知云同步引擎（history-sync.js 监听，登录+PRO 时防抖自动上传；游客/免费不受影响）
function notifyHistoryMutated() {
    try {
        if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
            document.dispatchEvent(new CustomEvent('euriskotax:history-mutated', { detail: { at: Date.now() } }));
        }
    } catch (e) { /* 同步信号失败静默 */ }
}

// 17B-3（v1.49.0）：`saveCalculationResult`（综合所得页面的「保存计算结果」）随旧页面删掉了 ——
// 它的调用点只有 app.js 那颗现已删除的按钮。此后正向历史的写入由向导自己的保存承担
// （deep-wizard-ui 的 execSave），走的还是同一份 localStorage + notifyHistoryMutated 通道，
// 所以「已保存的 forward 记录怎么读」这件事没变 —— loadHistoryRecords / loadRecordToForm
// 里那条 forward 分支必须留着，否则云同步拉回来的老记录就成了读不回来的死数据。

// 辅助函数：安全获取收入值
function getIncomeValue(item) {
    try {
        if (item.type === 'business') {
            // 17B-1 起经营所得有两种历史结构：旧页面版散在 incomeDetails/taxDetails 里，
            // spec 驱动的向导存的是 { values, primary, rows } —— 两种都要读得出来。
            if (item.results && item.results.incomeDetails) {
                return item.results.incomeDetails.businessIncome || 0;
            }
            return Number(item.results?.values?.income) || 0;
        } else if (item.type === 'classification') {
            return item.results?.totalIncome || 0;
        } else if (item.type === 'reverse') {
            // 兼容新旧数据结构
            return item.results?.incomeDetails?.total || item.results?.totalIncome || 0;
        } else {
            return item.results?.incomeDetails?.total || 0;
        }
    } catch (e) {
        return 0;
    }
}

// 辅助函数：安全获取税额值
function getTaxValue(item) {
    try {
        return item.results?.taxDetails?.totalTax || item.results?.totalTax || 0;
    } catch (e) {
        return 0;
    }
}

// 辅助函数：安全获取税后收入值
function getNetIncomeValue(item) {
    try {
        if (item.type === 'business') {
            if (item.results && item.results.taxDetails) {
                return item.results.taxDetails.netIncome || 0;
            }
            // 向导版：税后经营所得在结果行里（rows 是 [{label, value}]）
            const row = (item.results?.rows || []).find(function (r) { return r.label === '税后经营所得'; });
            return Number(row?.value) || 0;
        } else if (item.type === 'classification') {
            const totalIncome = item.results?.totalIncome || 0;
            const totalTax = item.results?.taxDetails?.totalTax || item.results?.totalTax || 0;
            return Math.max(0, totalIncome - totalTax);
        } else {
            // 兼容新旧数据结构
            return item.results?.taxDetails?.netIncome || item.results?.netIncome || 0;
        }
    } catch (e) {
        return 0;
    }
}

// 从 localStorage 刷新内存镜像：
// 个人中心（auth-ui.js 为独立 ES module，无法直接读写本文件的全局数组）等入口直接写 localStorage，
// 主页渲染前先调用此函数同步镜像，避免双份缓存导致展示不一致
function syncCalculationHistoryFromStorage() {
    try {
        calculationHistory = JSON.parse(localStorage.getItem('taxCalculationHistory') || '[]');
    } catch (e) {
        calculationHistory = [];
    }
    return calculationHistory;
}

// 加载历史记录
function loadHistoryRecords() {
    // 渲染前统一从 localStorage 刷新，保证与个人中心删除/主页新增等操作后的一致
    syncCalculationHistoryFromStorage();

    const historyList = document.getElementById('history-list');
    if (!historyList) return;
    
    // 清空历史记录列表
    historyList.innerHTML = '';
    
    if (calculationHistory.length === 0) {
        historyList.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fa fa-history text-4xl mb-2"></i>
                <p>暂无保存的计算记录</p>
            </div>
        `;
        return;
    }
    
    // 生成历史记录列表
    calculationHistory.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'card';
        
        const date = new Date(item.date);
        const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        
        // 安全获取值
        const incomeValue = getIncomeValue(item);
        const taxValue = getTaxValue(item);
        const netIncomeValue = getNetIncomeValue(item);
        
        historyItem.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-medium text-gray-800">${item.title}</h4>
                    <p class="text-sm text-gray-500 mt-1">${formattedDate}</p>
                </div>
                <div class="flex space-x-2">
                    <button class="btn bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm px-2 py-1" onclick="viewHistoryRecord('${item.id}')">
                        <i class="fa fa-eye mr-1"></i> 查看
                    </button>
                    <button class="btn bg-danger text-white hover:bg-danger/90 text-sm px-2 py-1" onclick="deleteHistoryRecord('${item.id}')">
                        <i class="fa fa-trash mr-1"></i> 删除
                    </button>
                </div>
            </div>
            <div class="mt-3 pt-3 border-t border-gray-100">
                <div class="grid grid-cols-3 gap-2 text-sm">
                    <div>
                        <span class="text-gray-500">收入：</span>
                        <span class="font-medium">¥${incomeValue.toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">应纳税额：</span>
                        <span class="font-medium text-danger">¥${taxValue.toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">税后收入：</span>
                        <span class="font-medium text-primary">¥${netIncomeValue.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
        
        historyList.appendChild(historyItem);
    });
}

// 查看历史记录
function viewHistoryRecord(id) {
    const record = calculationHistory.find(item => item.id === id);
    if (!record) return;
    
    // 根据记录类型切换到相应页面
    if (record.type === 'business') {
        // 阶段17 17B-1（v1.47.0）：经营所得已迁到 spec 驱动的向导，旧页面整页删掉了 ——
        // 不再回填那 23 个 DOM。打开向导即可续算（向导自带草稿，会接着上次的输入继续）。
        var W = window.EuriskoDeepWizard;
        if (W && W.open('business')) {
            showAlert('已打开经营所得测算；向导会接着上次的输入继续。');
            return;
        }
        showAlert('经营所得测算暂不可用，请刷新页面后重试。');
        return;
    } else if (record.type === 'classification') {
        // 阶段17 17B-4（v1.50.0）：分类所得也迁到了 spec 驱动的向导，旧页面整页删掉了 ——
        // 原先这里回填的是那一份 DOM（条目列表、结果区、计税表、类型分布饼图），
        // 现在与 business / reverse / forward 同为一套处理：打开向导续算，草稿会接着上次的输入。
        // 历史里的旧记录仍然能读：**「看得见列表」和「能续着算」是两件事**，后者靠向导草稿，不靠回填。
        var W = window.EuriskoDeepWizard;
        if (W && W.open('classification')) {
            showAlert('已打开分类所得测算；向导会接着上次的输入继续。');
            return;
        }
        showAlert('分类所得测算暂不可用，请刷新页面后重试。');
        return;
    } else if (record.type === 'reverse') {
        // 阶段17 17B-2（v1.48.0）：与 business 同款处理 —— 旧页面整页删掉了，
        // 不再回填那一屏 DOM（数量比 business 还多：反算目标、三种口径、两级扣除勾选）。
        // 打开向导即可续算：向导自带草稿，会接着上次的输入继续。
        var W = window.EuriskoDeepWizard;
        if (W && W.open('reverse')) {
            showAlert('已打开反向倒算测算；向导会接着上次的输入继续。');
            return;
        }
        showAlert('反向倒算测算暂不可用，请刷新页面后重试。');
        return;
    } else if (record.type === 'forward' || record.type === 'comprehensive') {
        // 阶段17 17B-3（v1.49.0）：与 business / reverse 同款处理 —— 综合所得整页删掉了，
        // 不再回填那二十来个 DOM（逐年参数的 DOM 比经营所得还碎）。打开向导即可续算：
        // 向导自带草稿，会接着上次的输入继续。comprehensive 是云同步协议里的同一个类型
        // （history-sync 上行时把 forward 映射成它），拉回来的云端记录必须能走同一条路。
        W = window.EuriskoDeepWizard;
        if (W && W.open('forward')) {
            showAlert('已打开综合所得测算；向导会接着上次的输入继续。');
            return;
        }
        showAlert('综合所得测算暂不可用，请刷新页面后重试。');
        return;
    } else {
        // 未知类型：宁可说清楚也不猜 —— 猜错会把人扔到一个不相关的页面里。
        showAlert('这条记录没有对应的测算入口，可能来自更新的版本。');
    }
}

// 删除历史记录
function deleteHistoryRecord(id) {
    showConfirm('确定要删除这条记录吗？', function() {
        calculationHistory = calculationHistory.filter(item => item.id !== id);
        localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));
        // 阶段10：已同步过的记录删除 → 云端墓碑广播（未同步过则忽略）；再通知引擎上传
        try {
            if (window.EuriskoSync && typeof window.EuriskoSync.recordLocalDelete === 'function') {
                window.EuriskoSync.recordLocalDelete(id);
            }
        } catch (e) { /* 墓碑记录失败静默 */ }
        notifyHistoryMutated();
        loadHistoryRecords();
    });
}
