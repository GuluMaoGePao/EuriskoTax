// 更新预算表
function updateBudgetTable() {
    if (Object.keys(calculationResults).length === 0) return;
    
    const workMonths = calculationResults.workMonths;
    const tbody = document.getElementById('budget-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const monthlySalary = calculationResults.incomeDetails.salary;
    const monthlyLabor = calculationResults.incomeDetails.labor / 12;
    const monthlyAuthor = calculationResults.incomeDetails.author / 12;
    const monthlyRoyalty = calculationResults.incomeDetails.royalty / 12;
    const monthlyBonus = calculationResults.incomeDetails.bonusInclude ? calculationResults.incomeDetails.bonus / workMonths : 0;
    
    const monthlyBasicDeduction = calculationResults.deductionDetails.basic;
    const monthlyInsuranceDeduction = calculationResults.deductionDetails.pensionInsurance + 
                                     calculationResults.deductionDetails.medicalInsurance + 
                                     calculationResults.deductionDetails.unemploymentInsurance + 
                                     calculationResults.deductionDetails.housingFund;
    const monthlySpecialAdditional = (calculationResults.deductionDetails.specialAdditionalTotal - calculationResults.deductionDetails.actualMedical) / workMonths;
    const monthlyMedicalDeduction = calculationResults.deductionDetails.actualMedical / workMonths;
    const monthlyOtherDeduction = calculationResults.deductionDetails.otherTotal / workMonths;
    
    let cumulativeTaxableIncome = 0;
    let cumulativeTax = 0;
    
    for (let month = 1; month <= workMonths; month++) {
        const monthlyIncome = monthlySalary + monthlyLabor + monthlyAuthor + monthlyRoyalty + monthlyBonus;
        const monthlyDeduction = monthlyBasicDeduction + monthlyInsuranceDeduction + monthlySpecialAdditional + monthlyMedicalDeduction + monthlyOtherDeduction;
        const monthlyTaxableIncome = Math.max(0, monthlyIncome - monthlyDeduction);
        
        cumulativeTaxableIncome += monthlyTaxableIncome;
        
        // 计算累计应纳税额
        let monthTax = 0;
        for (const bracket of comprehensiveTaxRates) {
            if (cumulativeTaxableIncome <= bracket.max) {
                monthTax = cumulativeTaxableIncome * bracket.rate - bracket.deduction - cumulativeTax;
                break;
            }
        }
        
        cumulativeTax += monthTax;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${month}月</td>
            <td>¥${monthlyIncome.toFixed(2)}</td>
            <td>¥${monthlyDeduction.toFixed(2)}</td>
            <td>¥${monthlyTaxableIncome.toFixed(2)}</td>
            <td>${getTaxRate(cumulativeTaxableIncome)}%</td>
            <td>¥${monthTax.toFixed(2)}</td>
            <td>¥${cumulativeTax.toFixed(2)}</td>
        `;
        
        tbody.appendChild(row);
    }
}

// 更新反向倒算预算表
function updateReverseBudgetTable() {
    if (Object.keys(reverseCalculationResults).length === 0) return;
    
    const workMonths = parseInt(document.getElementById('reverse-work-months').value) || 12;
    const tbody = document.getElementById('reverse-budget-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const monthlyIncome = reverseCalculationResults.totalIncome / workMonths;
    const monthlyDeduction = reverseCalculationResults.totalDeduction / workMonths;
    const monthlyTaxableIncome = monthlyIncome - monthlyDeduction;
    const monthlyTax = reverseCalculationResults.totalTax / workMonths;
    
    let cumulativeTaxableIncome = 0;
    let cumulativeTax = 0;
    
    for (let month = 1; month <= workMonths; month++) {
        cumulativeTaxableIncome += monthlyTaxableIncome;
        cumulativeTax += monthlyTax;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${month}月</td>
            <td>¥${monthlyIncome.toFixed(2)}</td>
            <td>¥${monthlyDeduction.toFixed(2)}</td>
            <td>¥${monthlyTaxableIncome.toFixed(2)}</td>
            <td>${getTaxRate(cumulativeTaxableIncome)}%</td>
            <td>¥${monthlyTax.toFixed(2)}</td>
            <td>¥${cumulativeTax.toFixed(2)}</td>
        `;
        
        tbody.appendChild(row);
    }
}

// 更新经营所得预算表
function updateBusinessBudgetTable() {
    if (Object.keys(calculationResults).length === 0) return;
    
    const tbody = document.getElementById('business-budget-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const rows = [
        { item: '年度经营收入总额', amount: calculationResults.incomeDetails.total, description: '包括主营业务收入和其他业务收入' },
        { item: '年度成本', amount: calculationResults.deductionDetails.cost, description: '包括原材料、商品采购等直接成本' },
        { item: '年度费用', amount: calculationResults.deductionDetails.expenses, description: '包括房租、水电费、办公费等间接费用' },
        { item: '年度税金', amount: calculationResults.deductionDetails.taxes, description: '包括增值税、城建税、教育费附加等' },
        { item: '年度损失', amount: calculationResults.deductionDetails.losses, description: '包括资产损失、坏账损失等' },
        { item: '其他支出', amount: calculationResults.deductionDetails.otherExpenses, description: '其他与经营活动相关的支出' },
        { item: '以前年度亏损弥补', amount: calculationResults.deductionDetails.previousLosses, description: '允许弥补的以前年度亏损' },
        { item: '投资者减除费用', amount: calculationResults.deductionDetails.investorDeduction, description: '固定60000元/年' },
        { item: '其他扣除', amount: calculationResults.deductionDetails.otherDeduction, description: '个人养老金、商业健康保险等' },
        { item: '年度应纳税所得额', amount: calculationResults.taxDetails.taxableIncome, description: '经营利润减去各项扣除后的余额' },
        { item: '适用税率', amount: calculationResults.taxDetails.applicableRate * 100, description: '根据应纳税所得额确定的税率' },
        { item: '速算扣除数', amount: calculationResults.taxDetails.applicableDeduction, description: '根据税率级数确定的速算扣除数' },
        { item: '年度应纳税额', amount: calculationResults.taxDetails.totalTax, description: '应纳税所得额乘以适用税率减去速算扣除数' },
        { item: '全年累计已预缴税额', amount: calculationResults.taxDetails.prepaidTax, description: '年度内已预缴的经营所得税额' },
        { item: '年度应退/应补税额', amount: calculationResults.taxDetails.refundTax, description: '应纳税额减去已预缴税额' },
        { item: '税后经营所得', amount: calculationResults.taxDetails.netIncome, description: '经营利润减去应纳税额' }
    ];
    
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.item}</td>
            <td>¥${row.amount.toFixed(2)}</td>
            <td>${row.description}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 更新分类所得预算表
function updateClassificationBudgetTable() {
    if (Object.keys(calculationResults).length === 0) return;
    
    const tbody = document.getElementById('classification-budget-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const rows = [
        { item: '所得类型', amount: calculationResults.incomeDetails.type, description: '分类所得的具体类型' },
        { item: '收入金额', amount: calculationResults.incomeDetails.income, description: '每次收入的金额' },
        { item: '扣除项目', amount: calculationResults.deductionDetails.total, description: '准予扣除的项目金额' },
        { item: '应纳税所得额', amount: calculationResults.taxDetails.taxableIncome, description: '收入减去扣除项目后的余额' },
        { item: '适用税率', amount: calculationResults.taxDetails.applicableRate * 100, description: '分类所得适用的税率' },
        { item: '应纳税额', amount: calculationResults.taxDetails.totalTax, description: '应纳税所得额乘以适用税率' }
    ];
    
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.item}</td>
            <td>${typeof row.amount === 'number' ? '¥' + row.amount.toFixed(2) : row.amount}</td>
            <td>${row.description}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 更新图表
function updateCharts() {
    // 税率分布饼图
    updateTaxRateDistributionChart();
    
    // 月度个税图表
    updateMonthlyTaxChart();
}

// 更新税率分布饼图
function updateTaxRateDistributionChart() {
    if (Object.keys(calculationResults).length === 0) return;
    
    const ctx = document.getElementById('tax-rate-distribution-chart');
    if (!ctx) return;
    
    const taxableIncome = calculationResults.taxDetails.taxableIncome;
    const taxBrackets = [
        { max: 36000, rate: 3, amount: 0 },
        { max: 144000, rate: 10, amount: 0 },
        { max: 300000, rate: 20, amount: 0 },
        { max: 420000, rate: 25, amount: 0 },
        { max: 660000, rate: 30, amount: 0 },
        { max: 960000, rate: 35, amount: 0 },
        { max: Infinity, rate: 45, amount: 0 }
    ];
    
    let remainingIncome = taxableIncome;
    for (let i = 0; i < taxBrackets.length; i++) {
        const bracket = taxBrackets[i];
        const prevMax = i > 0 ? taxBrackets[i - 1].max : 0;
        const bracketIncome = Math.min(remainingIncome, bracket.max - prevMax);
        if (bracketIncome > 0) {
            taxBrackets[i].amount = bracketIncome;
            remainingIncome -= bracketIncome;
        }
        if (remainingIncome <= 0) break;
    }
    
    const labels = taxBrackets.filter(bracket => bracket.amount > 0).map(bracket => `${bracket.rate}%`);
    const data = taxBrackets.filter(bracket => bracket.amount > 0).map(bracket => bracket.amount);
    
    if (window.taxRateChart) {
        window.taxRateChart.destroy();
    }
    
    // 如果没有数据，显示默认图表
    if (labels.length === 0) {
        window.taxRateChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['无应纳税所得额'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#e5e7eb'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    title: {
                        display: true,
                        text: '税率分布'
                    }
                }
            }
        });
    } else {
        window.taxRateChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#3b82f6',
                        '#10b981',
                        '#f59e0b',
                        '#ef4444',
                        '#8b5cf6',
                        '#ec4899',
                        '#6366f1'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    title: {
                        display: true,
                        text: '税率分布'
                    }
                }
            }
        });
    }
}

// 更新月度个税图表
function updateMonthlyTaxChart() {
    if (Object.keys(calculationResults).length === 0) return;
    
    const ctx = document.getElementById('monthly-tax-chart');
    if (!ctx) return;
    
    const workMonths = calculationResults.workMonths;
    const monthlySalary = calculationResults.incomeDetails.salary;
    const monthlyLabor = calculationResults.incomeDetails.labor / 12;
    const monthlyAuthor = calculationResults.incomeDetails.author / 12;
    const monthlyRoyalty = calculationResults.incomeDetails.royalty / 12;
    const monthlyBonus = calculationResults.incomeDetails.bonusInclude ? calculationResults.incomeDetails.bonus / workMonths : 0;
    
    const monthlyBasicDeduction = calculationResults.deductionDetails.basic;
    const monthlyInsuranceDeduction = calculationResults.deductionDetails.pensionInsurance + 
                                     calculationResults.deductionDetails.medicalInsurance + 
                                     calculationResults.deductionDetails.unemploymentInsurance + 
                                     calculationResults.deductionDetails.housingFund;
    const monthlySpecialAdditional = (calculationResults.deductionDetails.specialAdditionalTotal - calculationResults.deductionDetails.actualMedical) / workMonths;
    const monthlyMedicalDeduction = calculationResults.deductionDetails.actualMedical / workMonths;
    const monthlyOtherDeduction = calculationResults.deductionDetails.otherTotal / workMonths;
    
    const labels = [];
    const taxData = [];
    
    let cumulativeTaxableIncome = 0;
    let cumulativeTax = 0;
    
    for (let month = 1; month <= workMonths; month++) {
        labels.push(`${month}月`);
        
        const monthlyIncome = monthlySalary + monthlyLabor + monthlyAuthor + monthlyRoyalty + monthlyBonus;
        const monthlyDeduction = monthlyBasicDeduction + monthlyInsuranceDeduction + monthlySpecialAdditional + monthlyMedicalDeduction + monthlyOtherDeduction;
        const monthlyTaxableIncome = Math.max(0, monthlyIncome - monthlyDeduction);
        
        cumulativeTaxableIncome += monthlyTaxableIncome;
        
        // 计算累计应纳税额
        let monthTax = 0;
        for (const bracket of comprehensiveTaxRates) {
            if (cumulativeTaxableIncome <= bracket.max) {
                monthTax = cumulativeTaxableIncome * bracket.rate - bracket.deduction - cumulativeTax;
                break;
            }
        }
        
        cumulativeTax += monthTax;
        taxData.push(monthTax);
    }
    
    if (window.monthlyTaxChart) {
        window.monthlyTaxChart.destroy();
    }
    
    window.monthlyTaxChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '月度个税',
                data: taxData,
                backgroundColor: '#3b82f6',
                borderColor: '#1e40af',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '税额 (元)'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '月度个税明细'
                }
            }
        }
    });
}

// 更新反向倒算图表
function updateReverseCharts() {
    // 收入构成分析图表
    updateIncomeCompositionChart();
}

// 更新收入构成分析图表
function updateIncomeCompositionChart() {
    if (Object.keys(reverseCalculationResults).length === 0) return;
    
    const ctx = document.getElementById('income-composition-chart');
    if (!ctx) return;
    
    const totalIncome = reverseCalculationResults.totalIncome;
    const totalDeduction = reverseCalculationResults.totalDeduction;
    const totalTax = reverseCalculationResults.totalTax;
    const netIncome = totalIncome - totalTax;
    
    if (window.incomeCompositionChart) {
        window.incomeCompositionChart.destroy();
    }
    
    window.incomeCompositionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['税后收入', '个人所得税', '各项扣除'],
            datasets: [{
                data: [netIncome, totalTax, totalDeduction],
                backgroundColor: [
                    '#10b981',
                    '#ef4444',
                    '#3b82f6'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: '收入构成分析'
                }
            }
        }
    });
}

// 生成税收优化建议
function generateOptimizationTips() {
    if (Object.keys(calculationResults).length === 0) return;
    
    const tipsContainer = document.getElementById('optimization-tips');
    if (!tipsContainer) return;
    
    tipsContainer.innerHTML = '';
    
    const tips = [];
    
    // 检查专项附加扣除
    if (calculationResults.deductionDetails.specialAdditionalTotal === 0) {
        tips.push('您未填写任何专项附加扣除，建议检查是否有符合条件的扣除项目，如子女教育、赡养老人、住房贷款利息等。');
    }
    
    // 检查个人养老金
    if (calculationResults.deductionDetails.pension === 0) {
        tips.push('您未填写个人养老金扣除，建议考虑缴纳个人养老金，每年最高可扣除12000元。');
    }
    
    // 检查商业健康保险
    if (calculationResults.deductionDetails.insuranceOther === 0) {
        tips.push('您未填写商业健康保险扣除，建议考虑购买符合条件的商业健康保险，每年最高可扣除2400元。');
    }
    
    // 检查年终奖计税方式
    if (calculationResults.incomeDetails.bonus > 0) {
        const bonusTax = calculationResults.incomeDetails.bonusTax;
        const bonusInclude = calculationResults.incomeDetails.bonusInclude;
        
        // 计算另一种计税方式的税额
        let alternativeTax = 0;
        if (bonusInclude) {
            // 计算单独计税的税额
            const bonusTaxableIncome = calculationResults.incomeDetails.bonus;
            for (const bracket of comprehensiveTaxRates) {
                if (bonusTaxableIncome <= bracket.max) {
                    alternativeTax = bonusTaxableIncome * bracket.rate - bracket.deduction;
                    break;
                }
            }
        } else {
            // 计算并入综合所得的税额
            const totalIncome = calculationResults.incomeDetails.total - calculationResults.incomeDetails.bonus;
            const totalDeduction = calculationResults.deductionDetails.total;
            const taxableIncome = Math.max(0, totalIncome + calculationResults.incomeDetails.bonus - totalDeduction);
            for (const bracket of comprehensiveTaxRates) {
                if (taxableIncome <= bracket.max) {
                    alternativeTax = taxableIncome * bracket.rate - bracket.deduction - (calculationResults.taxDetails.totalTax - bonusTax);
                    break;
                }
            }
        }
        
        if (Math.abs(alternativeTax - bonusTax) > 100) {
            const betterMethod = alternativeTax < bonusTax ? (bonusInclude ? '单独计税' : '并入综合所得计税') : (bonusInclude ? '并入综合所得计税' : '单独计税');
            tips.push(`您的年终奖采用了${bonusInclude ? '并入综合所得计税' : '单独计税'}方式，建议考虑使用${betterMethod}方式，可能会节省税额。`);
        }
    }
    
    // 检查大病医疗
    if (calculationResults.deductionDetails.medical > 0 && calculationResults.deductionDetails.actualMedical === 0) {
        tips.push('您填写的大病医疗费用未达到扣除标准（超过15000元的部分），建议保留相关凭证，以备后续年度可能的扣除。');
    }
    
    // 检查社保缴费
    if (calculationResults.deductionDetails.pensionInsurance + 
        calculationResults.deductionDetails.medicalInsurance + 
        calculationResults.deductionDetails.unemploymentInsurance + 
        calculationResults.deductionDetails.housingFund === 0) {
        tips.push('您未填写社保缴费信息，建议根据实际情况填写，这部分支出可以在计算个税时扣除。');
    }
    
    if (tips.length === 0) {
        tips.push('您的税务规划较为合理，建议继续保持。');
    }
    
    tips.forEach((tip, index) => {
        const tipElement = document.createElement('div');
        tipElement.className = 'flex items-start p-3 bg-blue-50 rounded-lg';
        tipElement.innerHTML = `
            <i class="fa fa-lightbulb-o text-primary mt-0.5 mr-3"></i>
            <div>
                <h4 class="font-medium text-primary mb-1">优化建议 ${index + 1}</h4>
                <p class="text-sm text-gray-600">${tip}</p>
            </div>
        `;
        tipsContainer.appendChild(tipElement);
    });
}

// 获取适用税率
function getTaxRate(taxableIncome) {
    for (const bracket of comprehensiveTaxRates) {
        if (taxableIncome <= bracket.max) {
            return bracket.rate * 100;
        }
    }
    return 45;
}


