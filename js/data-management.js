// 全局变量
let calculationHistory = JSON.parse(localStorage.getItem('taxCalculationHistory') || '[]');

// 保存计算结果
function saveCalculationResult() {
    if (Object.keys(calculationResults).length === 0) {
        alert('请先进行计算，再保存结果');
        return;
    }
    
    // 生成唯一ID
    const id = Date.now().toString();
    
    // 构建保存的数据对象
    const savedData = {
        id: id,
        type: 'forward',
        title: `综合所得计税 - ${new Date().toLocaleDateString()}`,
        results: calculationResults,
        date: new Date().toISOString()
    };
    
    // 添加到历史记录
    calculationHistory.unshift(savedData);
    
    // 限制历史记录数量
    if (calculationHistory.length > 50) {
        calculationHistory = calculationHistory.slice(0, 50);
    }
    
    // 保存到本地存储
    localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));
    
    // 显示保存成功提示
    const toast = document.getElementById('save-success-toast');
    if (toast) {
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
}

// 加载历史记录
function loadHistoryRecords() {
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
                        <span class="font-medium">¥${item.results.incomeDetails.total.toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">应纳税额：</span>
                        <span class="font-medium text-danger">¥${item.results.taxDetails.totalTax.toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">税后收入：</span>
                        <span class="font-medium text-primary">¥${item.results.taxDetails.netIncome.toFixed(2)}</span>
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
    
    // 切换到正向计税页面
    showPage('forward-calculation-page');
    
    // 填充数据到表单
    const results = record.results;
    
    // 基本参数
    document.getElementById('work-months').value = results.workMonths;
    document.getElementById('prepaid-tax').value = results.taxDetails.prepaidTax;
    
    // 收入明细
    document.getElementById('salary-income').value = results.incomeDetails.salary;
    document.getElementById('labor-income').value = results.incomeDetails.labor;
    document.getElementById('author-income').value = results.incomeDetails.author;
    document.getElementById('royalty-income').value = results.incomeDetails.royalty;
    document.getElementById('bonus-income').value = results.incomeDetails.bonus;
    document.getElementById('bonus-include').checked = results.incomeDetails.bonusInclude;
    
    // 扣除项明细
    document.getElementById('basic-deduction').value = results.deductionDetails.basic;
    
    // 专项扣除
    document.getElementById('social-security-base').value = results.deductionDetails.socialSecurityBase || 0;
    document.getElementById('pension-insurance').value = results.deductionDetails.pensionInsurance;
    document.getElementById('medical-insurance').value = results.deductionDetails.medicalInsurance;
    document.getElementById('unemployment-insurance').value = results.deductionDetails.unemploymentInsurance;
    document.getElementById('housing-fund').value = results.deductionDetails.housingFund;
    
    // 专项附加扣除
    document.getElementById('elderly-deduction').value = results.deductionDetails.elderly;
    document.getElementById('children-infant-deduction').value = results.deductionDetails.childrenInfant;
    
    // 住房类型
    const housingType = results.deductionDetails.housing > 1200 ? 'rent' : 'loan';
    document.getElementById('housing-type').value = housingType;
    if (housingType === 'rent') {
        document.getElementById('rent-fields').classList.remove('hidden');
        document.getElementById('loan-fields').classList.add('hidden');
        document.getElementById('rent-deduction').value = results.deductionDetails.housing;
    } else {
        document.getElementById('loan-fields').classList.remove('hidden');
        document.getElementById('rent-fields').classList.add('hidden');
        document.getElementById('housing-loan-deduction').value = results.deductionDetails.housing;
    }
    
    document.getElementById('education-deduction').value = results.deductionDetails.education;
    document.getElementById('medical-deduction').value = results.deductionDetails.medical;
    
    // 其他扣除
    document.getElementById('pension-deduction').value = results.deductionDetails.pension;
    document.getElementById('insurance-other-deduction').value = results.deductionDetails.insuranceOther;
    
    // 触发计算
    updateIncomeCalculation();
    updateDeductionCalculation();
    calculateTax();
    goToStep(4);
    updateBudgetTable();
    updateCharts();
    generateOptimizationTips();
}

// 删除历史记录
function deleteHistoryRecord(id) {
    if (confirm('确定要删除这条记录吗？')) {
        calculationHistory = calculationHistory.filter(item => item.id !== id);
        localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));
        loadHistoryRecords();
    }
}


