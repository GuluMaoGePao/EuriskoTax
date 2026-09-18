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

// 保存计算结果
function saveCalculationResult() {
    console.log('%c[EuriskoTax] SAVE → 开始保存计算结果', 'color: #1e40af; font-weight: bold;');
    if (Object.keys(calculationResults).length === 0) {
        console.warn('[EuriskoTax] SAVE → 计算结果为空，无法保存');
        showAlert('请先进行计算，再保存结果');
        return;
    }

    try {
        // 生成唯一ID
        const id = Date.now().toString();

        // 构建保存的数据对象
        const savedData = {
            id: id,
            type: 'forward',
            title: `综合所得计税 - ${new Date().toLocaleDateString()}`,
            results: calculationResults,
            date: new Date().toISOString(),
            updatedAt: new Date().toISOString()  // 阶段10：云同步冲突判定时间戳（旧数据缺省时回退 date）
        };

        console.log('[EuriskoTax] SAVE → 保存数据:', {
            id: id,
            type: savedData.type,
            title: savedData.title,
            income: calculationResults?.incomeDetails?.total,
            tax: calculationResults?.taxDetails?.totalTax
        });

        // 添加到历史记录
        calculationHistory.unshift(savedData);

        // 限制历史记录数量
        if (calculationHistory.length > 50) {
            calculationHistory = calculationHistory.slice(0, 50);
        }

        // 保存到本地存储
        localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));

        // 阶段8：匿名埋点信号（综合所得），由 index.html 监听器统一上报
        try {
            if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
                document.dispatchEvent(new CustomEvent('euriskotax:calc-saved', { detail: { type: 'forward' } }));
            }
        } catch (e) { /* 埋点失败静默 */ }

        // 阶段10：通知云同步引擎（登录+PRO 时自动上传本端增量）
        notifyHistoryMutated();

        console.log('%c[EuriskoTax] SAVE → 保存成功，历史记录共 ' + calculationHistory.length + ' 条', 'color: #16a34a; font-weight: bold;');

        // 显示保存成功提示
        showSaveSuccessMessage();

    } catch (error) {
        console.error('[EuriskoTax] SAVE → 保存失败:', error);
        showSaveErrorMessage();
    }
}

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
        // 切换到分类所得页面
        showPage('classification-calculation-page');
        
        // 填充分类所得数据
        const results = record.results;
        
        // 恢复数据
        classificationCalculationResults = results;
        if (results.items) {
            classificationItems = [...results.items];
        }
        
        // 重新计算和显示
        updateClassificationItemsList();
        updateClassificationResultDisplay();
        updateClassificationBudgetTable();
        updateClassificationCharts();
        
        // 更新日期
        const dateElement = document.getElementById('classification-budget-table-date');
        if (dateElement && results.calculationDate) {
            dateElement.textContent = new Date(results.calculationDate).toLocaleDateString();
        }
        
        showClassificationStep(2);
    } else if (record.type === 'reverse') {
        // 切换到反向倒算页面
        showPage('reverse-calculation-page');
        
        // 填充反向倒算数据
        const results = record.results;
        
        // 基本参数
        document.getElementById('reverse-type').value = results?.reverseType || 'rate';
        document.getElementById('reverse-work-months').value = results?.workMonths || 12;
        
        // 扣除项
        document.getElementById('reverse-basic-deduction').value = results?.deductionDetails?.basic || 0;
        document.getElementById('reverse-social-security-base').value = results?.deductionDetails?.socialSecurityBase || 0;
        document.getElementById('reverse-pension-insurance').value = results?.deductionDetails?.pensionInsurance || 0;
        document.getElementById('reverse-medical-insurance').value = results?.deductionDetails?.medicalInsurance || 0;
        document.getElementById('reverse-unemployment-insurance').value = results?.deductionDetails?.unemploymentInsurance || 0;
        document.getElementById('reverse-housing-fund').value = results?.deductionDetails?.housingFund || 0;
        document.getElementById('reverse-elderly-deduction').value = results?.deductionDetails?.elderly || 0;
        document.getElementById('reverse-children-infant-deduction').value = results?.deductionDetails?.childrenInfant || 0;
        document.getElementById('reverse-housing-deduction').value = results?.deductionDetails?.housing || 0;
        document.getElementById('reverse-education-deduction').value = results?.deductionDetails?.education || 0;
        document.getElementById('reverse-medical-deduction').value = results?.deductionDetails?.medical || 0;
        document.getElementById('reverse-other-deduction').value = results?.deductionDetails?.other || 0;
        
        // 重新计算
        calculateReverseTax();
        showReverseStep(3);
        updateReverseBudgetTable();
        updateReverseCharts();
    } else {
        // 切换到正向计税页面
        showPage('forward-calculation-page');
        
        // 填充数据到表单
        const results = record.results;
        
        // 基本参数
        document.getElementById('work-months').value = results?.workMonths || 12;
        document.getElementById('prepaid-tax').value = '';
        
        // 收入明细
        document.getElementById('salary-income').value = results?.incomeDetails?.salary || 0;
        document.getElementById('labor-income').value = results?.incomeDetails?.labor || 0;
        document.getElementById('author-income').value = results?.incomeDetails?.author || 0;
        document.getElementById('royalty-income').value = results?.incomeDetails?.royalty || 0;
        document.getElementById('bonus-income').value = results?.incomeDetails?.bonus || 0;
        document.getElementById('bonus-include').checked = results?.incomeDetails?.bonusInclude ?? false;
        
        // 扣除项明细
        document.getElementById('basic-deduction').value = results?.deductionDetails?.basic || 5000;
        
        // 专项扣除
        document.getElementById('social-security-base').value = results?.deductionDetails?.socialSecurityBase || 0;
        document.getElementById('pension-insurance').value = results?.deductionDetails?.pensionInsurance || 0;
        document.getElementById('medical-insurance').value = results?.deductionDetails?.medicalInsurance || 0;
        document.getElementById('unemployment-insurance').value = results?.deductionDetails?.unemploymentInsurance || 0;
        document.getElementById('housing-fund').value = results?.deductionDetails?.housingFund || 0;
        
        // 专项附加扣除
        document.getElementById('elderly-deduction').value = results?.deductionDetails?.elderly || 0;
        document.getElementById('children-infant-deduction').value = results?.deductionDetails?.childrenInfant || 0;
        
        // 住房类型
        const housingType = (results?.deductionDetails?.housing || 0) > 1200 ? 'rent' : 'loan';
        document.getElementById('housing-type').value = housingType;
        
        // 住房贷款/租金扣除
        document.getElementById('housing-deduction').value = results?.deductionDetails?.housing || 0;
        
        // 继续教育扣除
        document.getElementById('education-deduction').value = results?.deductionDetails?.education || 0;
        
        // 大病医疗扣除
        document.getElementById('medical-deduction').value = results?.deductionDetails?.medical || 0;
        
        // 其他扣除
        document.getElementById('other-deduction').value = results?.deductionDetails?.other || 0;
        
        // 重新计算
        calculateTax();
        goToStep(3);
        updateBudgetTable();
        updateCharts();
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
