// 计算不含年终奖的收入
function calculateRegularIncome(totalIncome, bonusIncome, bonusInclude) {
    if (bonusIncome > 0 && !bonusInclude) {
        return totalIncome - bonusIncome;
    }
    return totalIncome;
}

// 更新预算表
function updateBudgetTable() {
    if (Object.keys(calculationResults).length === 0) return;
    
    const workMonths = calculationResults.workMonths;
    const tbody = document.getElementById('budget-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const monthlySalary = calculationResults.incomeDetails.salary;
    const monthlyBonus = calculationResults.incomeDetails.bonusInclude ? calculationResults.incomeDetails.bonus / workMonths : 0;
    
    const monthlyBasicDeduction = calculationResults.deductionDetails.basic;
    const monthlyInsuranceDeduction = calculationResults.deductionDetails.pensionInsurance + 
                                     calculationResults.deductionDetails.medicalInsurance + 
                                     calculationResults.deductionDetails.unemploymentInsurance + 
                                     calculationResults.deductionDetails.housingFund;
    const monthlySpecialAdditional = calculationResults.deductionDetails.elderly + 
                                     calculationResults.deductionDetails.childrenInfant + 
                                     calculationResults.deductionDetails.housing + 
                                     (calculationResults.deductionDetails.educationDegree || 0);
    const monthlyOtherDeduction = (calculationResults.deductionDetails.otherTotal - calculationResults.deductionDetails.charitableDonation) / workMonths;
    
    let cumulativeTaxableIncome = 0;
    let cumulativeTax = 0;
    
    const bonusTax = calculationResults.incomeDetails.bonusTax || 0;
    const bonusIncome = calculationResults.incomeDetails.bonus || 0;
    const bonusInclude = calculationResults.incomeDetails.bonusInclude || false;
    
    // 1. 生成月度数据表格
    for (let month = 1; month <= workMonths; month++) {
        const monthlyIncome = monthlySalary;
        const monthlyDeduction = monthlyBasicDeduction + monthlyInsuranceDeduction + monthlySpecialAdditional + monthlyOtherDeduction;
        const monthlyTaxableIncome = Math.max(0, monthlyIncome - monthlyDeduction);
        
        cumulativeTaxableIncome += monthlyTaxableIncome;
        
        let currentCumulativeTax = 0;
        let applicableRate = 0;
        
        for (const bracket of comprehensiveTaxRates) {
            if (cumulativeTaxableIncome <= bracket.max) {
                currentCumulativeTax = cumulativeTaxableIncome * bracket.rate - bracket.deduction;
                applicableRate = bracket.rate;
                break;
            }
        }
        
        let monthTax = currentCumulativeTax - cumulativeTax;
        cumulativeTax = currentCumulativeTax;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${month}月</td>
            <td>${monthlyIncome.toFixed(2)}</td>
            <td>${monthlyDeduction.toFixed(2)}</td>
            <td>${monthlyTaxableIncome.toFixed(2)}</td>
            <td>${(applicableRate * 100).toFixed(0)}%</td>
            <td>${Math.max(0, monthTax).toFixed(2)}</td>
            <td>${(monthlyIncome - Math.max(0, monthTax)).toFixed(2)}</td>
            <td>${(monthlyIncome * month).toFixed(2)}</td>
            <td>${cumulativeTax.toFixed(2)}</td>
        `;
        
        tbody.appendChild(row);
    }
    
    // 2. 添加劳务所得、稿酬所得、特许权使用费和年底一次性奖金表格
    const laborIncome = calculationResults.incomeDetails.labor || 0;
    const laborTaxableIncome = calculationResults.incomeDetails.laborCalculated || 0;
    const laborTax = calculationResults.incomeDetails.laborTax || 0;
    const laborDeduction = laborIncome > 4000 ? laborIncome * 0.2 : 800;
    
    const authorIncome = calculationResults.incomeDetails.author || 0;
    const authorTaxableIncome = calculationResults.incomeDetails.authorCalculated || 0;
    const authorTax = calculationResults.incomeDetails.authorTax || 0;
    const authorDeduction = authorIncome > 4000 ? authorIncome * 0.2 : 800;
    
    const royaltyIncome = calculationResults.incomeDetails.royalty || 0;
    const royaltyTaxableIncome = calculationResults.incomeDetails.royaltyCalculated || 0;
    const royaltyTax = calculationResults.incomeDetails.royaltyTax || 0;
    const royaltyDeduction = royaltyIncome > 4000 ? royaltyIncome * 0.2 : 800;
    
    // 计算税率用于显示
    const laborTaxRate = laborTaxableIncome <= 20000 ? 0.2 : (laborTaxableIncome <= 50000 ? 0.3 : 0.4);
    const authorTaxRate = 0.2;
    const royaltyTaxRate = 0.2;
    
    // 检查是否有任何其他收入或年终奖
    if (laborIncome > 0 || authorIncome > 0 || royaltyIncome > 0 || (bonusIncome > 0 && !bonusInclude)) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="9"></td>`;
        tbody.appendChild(emptyRow);
        
        const categoryRow2 = document.createElement('tr');
        categoryRow2.innerHTML = `
            <td class="font-bold">类型</td>
            <td class="font-bold">收入</td>
            <td class="font-bold">扣除</td>
            <td class="font-bold">应纳税所得额</td>
            <td class="font-bold">税率</td>
            <td class="font-bold">预缴税额</td>
            <td colspan="3"></td>
        `;
        tbody.appendChild(categoryRow2);
        
        if (laborIncome > 0) {
            const laborRow = document.createElement('tr');
            laborRow.innerHTML = `
                <td>劳务所得</td>
                <td>${laborIncome.toFixed(2)}</td>
                <td>${laborDeduction.toFixed(2)}</td>
                <td>${laborTaxableIncome.toFixed(2)}</td>
                <td>${(laborTaxRate * 100).toFixed(0)}%</td>
                <td>${laborTax.toFixed(2)}</td>
                <td colspan="3"></td>
            `;
            tbody.appendChild(laborRow);
        }
        
        if (authorIncome > 0) {
            const authorRow = document.createElement('tr');
            authorRow.innerHTML = `
                <td>稿酬所得</td>
                <td>${authorIncome.toFixed(2)}</td>
                <td>${authorDeduction.toFixed(2)}</td>
                <td>${authorTaxableIncome.toFixed(2)}</td>
                <td>${(authorTaxRate * 100).toFixed(0)}%</td>
                <td>${authorTax.toFixed(2)}</td>
                <td colspan="3"></td>
            `;
            tbody.appendChild(authorRow);
        }
        
        if (royaltyIncome > 0) {
            const royaltyRow = document.createElement('tr');
            royaltyRow.innerHTML = `
                <td>特许权使用费</td>
                <td>${royaltyIncome.toFixed(2)}</td>
                <td>${royaltyDeduction.toFixed(2)}</td>
                <td>${royaltyTaxableIncome.toFixed(2)}</td>
                <td>${(royaltyTaxRate * 100).toFixed(0)}%</td>
                <td>${royaltyTax.toFixed(2)}</td>
                <td colspan="3"></td>
            `;
            tbody.appendChild(royaltyRow);
        }
        
        if (bonusIncome > 0 && !bonusInclude) {
            const bonusRow = document.createElement('tr');
            let bonusTaxRate = 0;
            const monthlyBonus = bonusIncome / 12;
            
            for (const bracket of bonusMonthlyTaxRates) {
                if (monthlyBonus <= bracket.max) {
                    bonusTaxRate = bracket.rate;
                    break;
                }
            }
            
            bonusRow.innerHTML = `
                <td>年底一次性奖金</td>
                <td>${bonusIncome.toFixed(2)}</td>
                <td>0.00</td>
                <td>${bonusIncome.toFixed(2)}</td>
                <td>${(bonusTaxRate * 100).toFixed(0)}%</td>
                <td>${bonusTax.toFixed(2)}</td>
                <td colspan="3"></td>
            `;
            tbody.appendChild(bonusRow);
        }
    }
    
    // 5. 添加综合所得汇算表格
    // 税前收入 = 收入总额（工资+劳务+稿酬+特许权+年终奖），与结果区「税前年收入」口径一致
    const preTaxIncome = calculationResults.incomeDetails.preTaxTotal || 0;
    const annualDeduction = calculationResults.deductionDetails.total || 0;
    // 应纳税所得额以税务引擎结果为准（劳务/稿酬/特许权使用费已按 20%/减 800 等规则扣除费用）
    const annualTaxableIncome = calculationResults.taxDetails.taxableIncome || 0;
    const annualTaxRate = calculationResults.taxDetails.applicableRate || 0;
    const annualTax = calculationResults.taxDetails.totalTax || 0;
    // 累计预缴税额、应退/补税额与结果区保持一致（支持用户手动填写的预缴税额）
    const prepaidTax = calculationResults.taxDetails.prepaidTax || 0;
    const refundTax = calculationResults.taxDetails.refundTax || 0;
    
    const finalRow1 = document.createElement('tr');
    finalRow1.innerHTML = `<td class="section-title" colspan="9">综合所得汇算</td>`;
    tbody.appendChild(finalRow1);
    
    const finalRow2 = document.createElement('tr');
    finalRow2.innerHTML = `
        <td colspan="3">税前收入</td>
        <td>年度扣除合计</td>
        <td>应纳税所得额合计</td>
        <td>税率</td>
        <td>应纳税额</td>
        <td>累计预缴税额</td>
        <td>应退/补税额</td>
    `;
    tbody.appendChild(finalRow2);
    
    const finalRow3 = document.createElement('tr');
    finalRow3.innerHTML = `
        <td colspan="3">${preTaxIncome.toFixed(2)}</td>
        <td>${annualDeduction.toFixed(2)}</td>
        <td>${annualTaxableIncome.toFixed(2)}</td>
        <td>${(annualTaxRate * 100).toFixed(0)}%</td>
        <td>${annualTax.toFixed(2)}</td>
        <td>${prepaidTax.toFixed(2)}</td>
        <td class="${refundTax < 0 ? 'positive' : refundTax > 0 ? 'negative' : ''}">${refundTax.toFixed(2)}</td>
    `;
    tbody.appendChild(finalRow3);
    
    const dateElement = document.getElementById('budget-table-date');
    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString();
    }
}





// 更新分类所得预算表
function updateClassificationBudgetTable() {
    if (Object.keys(classificationCalculationResults).length === 0) return;
    
    const tbody = document.getElementById('classification-budget-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // 直接设置表格HTML内容
    let tableHTML = '';
    
    // 添加每个条目
    classificationCalculationResults.items.forEach((item, index) => {
        // 收入行
        tableHTML += '<tr>';
        tableHTML += '<td>' + item.typeName + '</td>';
        tableHTML += '<td>¥' + item.income.toFixed(2) + '</td>';
        tableHTML += '<td>分类所得第' + (index + 1) + '项</td>';
        tableHTML += '</tr>';
        
        // 扣除项目行（如果有）
        if (item.deduction > 0) {
            tableHTML += '<tr>';
            tableHTML += '<td>扣除项目</td>';
            tableHTML += '<td>¥' + item.deduction.toFixed(2) + '</td>';
            tableHTML += '<td>' + item.typeName + '的扣除项目</td>';
            tableHTML += '</tr>';
        }
        
        // 应纳税所得额行
        tableHTML += '<tr>';
        tableHTML += '<td>应纳税所得额</td>';
        tableHTML += '<td>¥' + item.taxableIncome.toFixed(2) + '</td>';
        tableHTML += '<td>' + item.typeName + '的应纳税所得额</td>';
        tableHTML += '</tr>';
        
        // 应纳税额行
        tableHTML += '<tr>';
        tableHTML += '<td>应纳税额</td>';
        tableHTML += '<td>¥' + item.totalTax.toFixed(2) + '</td>';
        tableHTML += '<td>' + item.typeName + '的应纳税额</td>';
        tableHTML += '</tr>';
        
        // 分隔行
        if (index < classificationCalculationResults.items.length - 1) {
            tableHTML += '<tr>';
            tableHTML += '<td colspan="3"><hr></td>';
            tableHTML += '</tr>';
        }
    });
    
    // 添加合计行
    if (classificationCalculationResults.items.length > 0) {
        const totalIncome = classificationCalculationResults.totalIncome;
        const totalTaxableIncome = classificationCalculationResults.totalTaxableIncome;
        const totalTax = classificationCalculationResults.totalTax;
        
        // 总收入行
        tableHTML += '<tr>';
        tableHTML += '<td>总收入</td>';
        tableHTML += '<td>¥' + totalIncome.toFixed(2) + '</td>';
        tableHTML += '<td>所有分类所得的收入合计</td>';
        tableHTML += '</tr>';
        
        // 总应纳税所得额行
        tableHTML += '<tr>';
        tableHTML += '<td>总应纳税所得额</td>';
        tableHTML += '<td>¥' + totalTaxableIncome.toFixed(2) + '</td>';
        tableHTML += '<td>所有分类所得的应纳税所得额合计</td>';
        tableHTML += '</tr>';
        
        // 总应纳税额行
        tableHTML += '<tr class="font-bold">';
        tableHTML += '<td>总应纳税额</td>';
        tableHTML += '<td>¥' + totalTax.toFixed(2) + '</td>';
        tableHTML += '<td>所有分类所得的应纳税额合计</td>';
        tableHTML += '</tr>';
    } else {
        // 添加空状态行
        tableHTML += '<tr>';
        tableHTML += '<td colspan="3" class="text-center text-gray-500 py-4">暂无分类所得条目</td>';
        tableHTML += '</tr>';
    }
    
    // 设置表格内容
    tbody.innerHTML = tableHTML;
}

// 更新图表
function updateCharts() {
    // 税率分布饼图
    updateTaxRateDistributionChart();
    
    // 月度个税图表
    updateMonthlyTaxChart();
}


// 更新分类所得图表
function updateClassificationCharts() {
    // 分类所得类型分布图表
    updateClassificationDistributionChart();
}

// 更新分类所得类型分布图表
function updateClassificationDistributionChart() {
    if (Object.keys(classificationCalculationResults).length === 0) return;
    
    const ctx = document.getElementById('classification-distribution-chart');
    if (!ctx) return;
    
    const items = classificationCalculationResults.items;
    const labels = items.map(item => item.typeName);
    const data = items.map(item => item.income);
    
    if (window.classificationDistributionChart) {
        window.classificationDistributionChart.destroy();
    }
    
    // 如果没有数据，显示默认图表
    if (labels.length === 0) {
        window.classificationDistributionChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['无分类所得'],
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
                        text: '分类所得类型分布'
                    }
                }
            }
        });
    } else {
        window.classificationDistributionChart = new Chart(ctx, {
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
                        text: '分类所得类型分布'
                    }
                }
            }
        });
    }
}

// 更新税率分布饼图
function updateTaxRateDistributionChart() {
    const ctx = document.getElementById('tax-rate-distribution-chart');
    if (!ctx) return;
    
    if (window.taxRateChart) {
        window.taxRateChart.destroy();
    }
    
    // 如果没有计算结果，显示默认图表
    if (Object.keys(calculationResults).length === 0) {
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
        return;
    }
    
    const taxableIncome = calculationResults.taxDetails.taxableIncome;
    // 使用统一的税率表
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
    const ctx = document.getElementById('monthly-tax-chart');
    if (!ctx) return;
    
    if (window.monthlyTaxChart) {
        window.monthlyTaxChart.destroy();
    }
    
    // 如果没有计算结果，显示默认图表
    if (Object.keys(calculationResults).length === 0) {
        window.monthlyTaxChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
                datasets: [{
                    label: '月度个税',
                    data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: '#e5e7eb',
                    borderColor: '#9ca3af',
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
        return;
    }
    
    const workMonths = calculationResults.workMonths;
    const monthlySalary = calculationResults.incomeDetails.salary;
    
    const monthlyBasicDeduction = calculationResults.deductionDetails.basic;
    const monthlyInsuranceDeduction = calculationResults.deductionDetails.pensionInsurance + 
                                     calculationResults.deductionDetails.medicalInsurance + 
                                     calculationResults.deductionDetails.unemploymentInsurance + 
                                     calculationResults.deductionDetails.housingFund;
    // 计算月度专项附加扣除（不包含职业资格和大病医疗扣除）
    // 直接从calculationResults中获取各项月度扣除
    const monthlySpecialAdditional = calculationResults.deductionDetails.elderly + 
                                     calculationResults.deductionDetails.childrenInfant + 
                                     calculationResults.deductionDetails.housing + 
                                     (calculationResults.deductionDetails.educationDegree || 0);
    const monthlyOtherDeduction = calculationResults.deductionDetails.otherTotal / workMonths;
    
    const labels = [];
    const taxData = [];
    
    let cumulativeTaxableIncome = 0;
    let cumulativeTax = 0;
    
    for (let month = 1; month <= workMonths; month++) {
        labels.push(`${month}月`);
        
        // 只计算月工资的收入
        const monthlyIncome = monthlySalary;
        const monthlyDeduction = monthlyBasicDeduction + monthlyInsuranceDeduction + monthlySpecialAdditional + monthlyOtherDeduction;
        const monthlyTaxableIncome = Math.max(0, monthlyIncome - monthlyDeduction);
        
        cumulativeTaxableIncome += monthlyTaxableIncome;
        
        // 计算累计应纳税额
        let currentCumulativeTax = 0;
        for (const bracket of comprehensiveTaxRates) {
            if (cumulativeTaxableIncome <= bracket.max) {
                currentCumulativeTax = cumulativeTaxableIncome * bracket.rate - bracket.deduction;
                break;
            }
        }
        
        // 计算本月应纳税额
        let monthTax = currentCumulativeTax - cumulativeTax;
        
        // 更新累计税额
        cumulativeTax = currentCumulativeTax;
        
        taxData.push(monthTax);
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
        const bonusAmount = calculationResults.incomeDetails.bonus;
        
        // 计算另一种计税方式的总税额
        let currentTotalTax = calculationResults.taxDetails.totalTax + bonusTax;
        let alternativeTotalTax = 0;
        
        if (bonusInclude) {
            // 计算单独计税的总税额
            const currentTotalTaxWithoutBonus = calculationResults.taxDetails.totalTax - bonusTax;
            // 计算单独计税的税额：全年奖金/12，查月度税率表
            let bonusTaxAlone = 0;
            const monthlyBonus = bonusAmount / 12;
            for (const bracket of bonusMonthlyTaxRates) {
                if (monthlyBonus <= bracket.max) {
                    bonusTaxAlone = bonusAmount * bracket.rate - bracket.deduction;
                    break;
                }
            }
            alternativeTotalTax = currentTotalTaxWithoutBonus + bonusTaxAlone;
        } else {
            // 计算并入综合所得的总税额
            const totalIncomeWithBonus = calculationResults.incomeDetails.total + bonusAmount;
            const totalDeduction = calculationResults.deductionDetails.total;
            const taxableIncomeWithBonus = Math.max(0, totalIncomeWithBonus - totalDeduction);
            
            let totalTaxWithBonus = 0;
            for (const bracket of comprehensiveTaxRates) {
                if (taxableIncomeWithBonus <= bracket.max) {
                    totalTaxWithBonus = taxableIncomeWithBonus * bracket.rate - bracket.deduction;
                    break;
                }
            }
            alternativeTotalTax = totalTaxWithBonus;
        }
        
        // 只有当另一种方式确实更优时才给出建议
        if (Math.abs(alternativeTotalTax - currentTotalTax) > 100) {
            if (alternativeTotalTax < currentTotalTax) {
                const betterMethod = bonusInclude ? '单独计税' : '并入综合所得计税';
                const taxSaved = currentTotalTax - alternativeTotalTax;
                tips.push(`您的年终奖采用了${bonusInclude ? '并入综合所得计税' : '单独计税'}方式，建议考虑使用${betterMethod}方式，预计可节省税额约${taxSaved.toFixed(2)}元。`);
            }
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
    
    // 检查工作月数
    if (calculationResults.workMonths < 12) {
        tips.push(`您填写的工作月数为${calculationResults.workMonths}个月，系统已根据实际工作月数调整了扣除额计算。`);
    }
    
    // 检查应纳税所得额
    if (calculationResults.taxDetails.taxableIncome === 0) {
        tips.push('您的应纳税所得额为0，无需缴纳个人所得税。');
    }
    
    // 检查税率级别
    const taxRate = calculationResults.taxDetails.applicableRate * 100;
    if (taxRate > 20) {
        tips.push(`您的适用税率为${taxRate}%，属于较高税率级别，建议合理规划税务，利用各项扣除政策降低税负。`);
    }
    
    if (tips.length === 0) {
        tips.push('您的税务规划较为合理，建议继续保持。');
    }
    
    tips.forEach((tip, index) => {
        const tipElement = document.createElement('div');
        tipElement.className = 'flex items-start p-3 bg-blue-50 rounded-lg mb-3';
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

// ===== 阶段12 A2：计算过程透明化 =====
//
// buildFormulaSteps 为纯函数：输入 performTaxCalculation 的结果对象，
// 输出「步骤数据」数组（金额保持为数字，格式化交给渲染层），
// 因此可单测，且能与结果区数值做逐位一致性断言。

// 构建计算过程步骤数据（纯函数）
function buildFormulaSteps(results) {
    const months = results.workMonths || 12;
    const income = results.incomeDetails;
    const deduction = results.deductionDetails;
    const tax = results.taxDetails;
    const steps = [];

    // 第一步：综合所得收入额
    const incomeRows = [
        {
            label: '工资薪金',
            note: income.salary.toFixed(2) + ' × ' + months + ' 个月',
            value: income.salary * months
        }
    ];
    if (income.laborCalculated > 0) {
        incomeRows.push({
            label: '劳务报酬收入额',
            note: income.labor.toFixed(2) + ' × 80%（减除 20% 费用）',
            value: income.laborCalculated
        });
    }
    if (income.authorCalculated > 0) {
        incomeRows.push({
            label: '稿酬收入额',
            note: income.author.toFixed(2) + ' × 80% × 70%（再减按 70% 计）',
            value: income.authorCalculated
        });
    }
    if (income.royaltyCalculated > 0) {
        incomeRows.push({
            label: '特许权使用费收入额',
            note: income.royalty.toFixed(2) + ' × 80%（减除 20% 费用）',
            value: income.royaltyCalculated
        });
    }
    if (income.bonus > 0 && income.bonusInclude) {
        incomeRows.push({
            label: '年终奖（并入综合所得）',
            note: '用户选择并入',
            value: income.bonus
        });
    }

    let incomeFootnote = '';
    if (income.bonus > 0 && !income.bonusInclude) {
        incomeFootnote = '年终奖 ' + income.bonus.toFixed(2) + ' 元选择单独计税，不并入综合所得';
    }

    steps.push({
        title: '第一步：计算综合所得收入额',
        rows: incomeRows,
        totalLabel: '综合所得收入额合计',
        totalValue: income.total,
        footnote: incomeFootnote
    });

    // 第二步：汇总年度扣除额
    const deductionRows = [
        {
            label: '基本减除费用',
            note: deduction.basic.toFixed(2) + ' × ' + months + ' 个月',
            value: deduction.basic * months
        }
    ];
    if (deduction.specialDeductionTotal > 0) {
        deductionRows.push({
            label: '专项扣除（三险一金）',
            note: '个人缴纳部分全年合计',
            value: deduction.specialDeductionTotal
        });
    }
    if (deduction.specialAdditionalTotal > 0) {
        deductionRows.push({
            label: '专项附加扣除',
            note: '子女教育 / 赡养老人 / 住房 / 继续教育 / 大病医疗等',
            value: deduction.specialAdditionalTotal
        });
    }
    if (deduction.otherTotal > 0) {
        deductionRows.push({
            label: '其他扣除',
            note: '个人养老金 / 企业年金 / 商业健康险 / 公益捐赠等',
            value: deduction.otherTotal
        });
    }

    steps.push({
        title: '第二步：汇总年度扣除额',
        rows: deductionRows,
        totalLabel: '年度扣除合计',
        totalValue: deduction.total,
        footnote: ''
    });

    // 第三步：应纳税所得额
    steps.push({
        title: '第三步：计算应纳税所得额',
        rows: [
            { label: '综合所得收入额', note: '', value: income.total },
            { label: '减：年度扣除合计', note: '', value: deduction.total }
        ],
        totalLabel: '应纳税所得额',
        totalValue: tax.taxableIncome,
        footnote: income.total <= deduction.total
            ? '收入额未超过扣除额合计，应纳税所得额按 0 计'
            : ''
    });

    // 第四步：适用税率与应纳税额
    const ratePercent = (tax.applicableRate * 100).toFixed(0);
    steps.push({
        title: '第四步：适用税率与应纳税额',
        rows: [
            { label: '适用税率', note: '按应纳税所得额查综合所得税率表', value: tax.applicableRate, format: 'percent' },
            { label: '速算扣除数', note: '', value: tax.applicableDeduction }
        ],
        totalLabel: '综合所得应纳税额',
        totalValue: tax.totalTax,
        footnote: tax.taxableIncome.toFixed(2) + ' × ' + ratePercent + '% − '
            + tax.applicableDeduction.toFixed(2) + ' = ' + tax.totalTax.toFixed(2)
    });

    // 第五步：预缴税额与汇算结果
    steps.push({
        title: '第五步：预缴税额与年度汇算',
        rows: [
            { label: '综合所得应纳税额', note: '', value: tax.totalTax },
            { label: '减：全年累计已预缴税额', note: '手动填写优先，未填则按源泉扣缴自动推演', value: tax.prepaidTax }
        ],
        totalLabel: tax.refundTax >= 0 ? '应补税额' : '应退税额',
        totalValue: Math.abs(tax.refundTax),
        footnote: '应退/应补 = 应纳税额 − 已预缴税额'
    });

    // 附：年终奖单独计税（仅在单独计税时展示）
    if (income.bonus > 0 && !income.bonusInclude) {
        steps.push({
            title: '附：年终奖单独计税',
            rows: [
                { label: '年终奖金额', note: '', value: income.bonus },
                { label: '折算月均金额', note: income.bonus.toFixed(2) + ' ÷ 12', value: income.bonus / 12 }
            ],
            totalLabel: '年终奖应纳税额',
            totalValue: income.bonusTax,
            footnote: '按月均金额查月度税率表确定税率与速算扣除数，再乘回年终奖全额'
        });
    }

    // 最后一步：税后年收入
    const netRows = [
        { label: '税前年收入', note: '', value: income.preTaxTotal },
        { label: '减：综合所得应纳税额', note: '', value: tax.totalTax }
    ];
    if (income.bonusTax > 0) {
        netRows.push({ label: '减：年终奖应纳税额', note: '单独计税部分', value: income.bonusTax });
    }

    steps.push({
        title: '最后一步：计算税后年收入',
        rows: netRows,
        totalLabel: '税后年收入',
        totalValue: tax.netIncome,
        footnote: ''
    });

    return steps;
}

// 金额/比例格式化（渲染层专用）
function formatFormulaValue(value, format) {
    if (format === 'percent') {
        return (Number(value || 0) * 100).toFixed(0) + '%';
    }
    if (format === 'text') {
        return String(value == null ? '' : value);
    }
    return '¥' + Number(value || 0).toFixed(2);
}

// 步骤数组 → 面板 HTML（纯函数，供各流程推导链与速算器渲染共用，不写第二套）
function renderFormulaStepsHtml(steps) {
    if (!Array.isArray(steps) || !steps.length) return '';
    return steps.map(function (step) {
        const rowsHtml = (step.rows || []).map(function (row) {
            const noteHtml = row.note
                ? '<span class="block text-xs text-gray-500">' + row.note + '</span>'
                : '';
            return '<div class="flex items-start justify-between px-3 py-1 text-sm text-gray-600">'
                + '<span>' + row.label + noteHtml + '</span>'
                + '<span class="font-medium text-gray-800 whitespace-nowrap ml-3">'
                + formatFormulaValue(row.value, row.format) + '</span>'
                + '</div>';
        }).join('');

        const footnoteHtml = step.footnote
            ? '<div class="px-3 py-1 text-xs text-gray-500">' + step.footnote + '</div>'
            : '';

        return '<div class="border border-gray-200 rounded-lg overflow-hidden mb-2">'
            + '<div class="px-3 py-2 bg-gray-50 text-sm font-medium text-gray-800">' + step.title + '</div>'
            + rowsHtml
            + '<div class="flex justify-between px-3 py-2 text-sm font-medium text-gray-800 border-t border-gray-200">'
            + '<span>' + step.totalLabel + '</span>'
            + '<span class="text-primary">' + formatFormulaValue(step.totalValue, step.format) + '</span>'
            + '</div>'
            + footnoteHtml
            + '</div>';
    }).join('');
}

// 通用渲染入口：把任意流程的 steps 数组渲染进指定面板（台账 C —— 四个完整测算页共用一套实现）
function showFormulaStepsPanel(steps, panelId, bodyId) {
    const panel = document.getElementById(panelId || 'formula-steps-panel');
    const body = document.getElementById(bodyId || 'formula-steps-body');
    if (!panel || !body) return;

    body.innerHTML = renderFormulaStepsHtml(steps);

    panel.classList.remove('hidden');
}

// 渲染计算过程面板（综合所得正向页 —— 既有行为不变）
function updateFormulaSteps(results) {
    showFormulaStepsPanel(buildFormulaSteps(results));
}

// ===== 台账 C：其余三个完整测算流程的推导链（纯函数，结构沿用 buildFormulaSteps 的 step schema）=====

// 经营所得推导链：输入 calculateBusinessTax 产出的 businessCalculationResults
function buildBusinessFormulaSteps(results) {
    const income = results.incomeDetails;
    const deduction = results.deductionDetails;
    const tax = results.taxDetails;
    const steps = [];

    // 第一步：经营利润
    steps.push({
        title: '第一步：计算经营利润',
        rows: [
            { label: '经营收入', note: '', value: income.businessIncome },
            { label: '减：经营成本', note: '', value: income.businessCost },
            { label: '减：营业费用', note: '', value: income.businessExpenses },
            { label: '减：税金及附加', note: '', value: income.businessTaxes },
            { label: '减：营业外支出（含损失）', note: '', value: income.businessLosses + income.businessOtherExpenses }
        ],
        totalLabel: '经营利润',
        totalValue: income.businessProfit,
        footnote: income.businessProfit <= 0 && income.businessIncome > 0
            ? '收入未覆盖成本费用，经营利润按 0 计' : ''
    });

    // 第二步：弥补以前年度亏损（无亏损时跳过）
    if (income.businessPreviousLosses > 0) {
        steps.push({
            title: '第二步：弥补以前年度亏损',
            rows: [
                { label: '经营利润', note: '', value: income.businessProfit },
                { label: '减：以前年度亏损', note: '', value: income.businessPreviousLosses }
            ],
            totalLabel: '弥补亏损后所得',
            totalValue: income.businessProfit - income.businessPreviousLosses,
            footnote: '可结转弥补的亏损以 5 年为限'
        });
    }

    // 第三步：汇总扣除额
    const deductionRows = [];
    if (deduction.investorDeduction > 0) {
        deductionRows.push({
            label: '投资者减除费用',
            note: deduction.hasComprehensiveIncome
                ? '5000 元/月 —— 本处按无综合所得情形展示（有综合所得时已在综合所得侧扣除）'
                : '5000 元/月 × 工作月数（无综合所得时方可扣除）',
            value: deduction.investorDeduction
        });
    }
    if (deduction.specialDeduction.deductible > 0) {
        deductionRows.push({
            label: '专项扣除（三险一金）',
            note: '无综合所得时方可在经营所得侧扣除',
            value: deduction.specialDeduction.deductible
        });
    }
    if (deduction.specialAdditionalDeduction.total > 0) {
        deductionRows.push({
            label: '专项附加扣除',
            note: '子女教育 / 赡养老人 / 住房 / 继续教育 / 大病医疗等',
            value: deduction.specialAdditionalDeduction.total
        });
    }
    if (deduction.otherDeduction.total > 0) {
        deductionRows.push({
            label: '其他扣除（含公益性捐赠）',
            note: '个人养老金 / 企业年金 / 商业健康险；捐赠以应纳税所得额 30% 为限',
            value: deduction.otherDeduction.total
        });
    }
    if (deductionRows.length) {
        steps.push({
            title: '第三步：汇总扣除额',
            rows: deductionRows,
            totalLabel: '扣除额合计',
            totalValue: deduction.total,
            footnote: ''
        });
    }

    // 第四步：应纳税所得额
    steps.push({
        title: '第四步：计算应纳税所得额',
        rows: [
            { label: '弥补亏损后所得', note: '', value: tax.netIncome },
            { label: '减：扣除额合计', note: '', value: deduction.total }
        ],
        totalLabel: '应纳税所得额',
        totalValue: tax.taxableIncome,
        footnote: tax.netIncome <= deduction.total
            ? '所得未超过扣除额合计，应纳税所得额按 0 计' : ''
    });

    // 第五步：适用税率与税额（减半前）
    const ratePercent = (tax.applicableRate * 100).toFixed(0);
    steps.push({
        title: '第五步：适用税率与应纳税额',
        rows: [
            { label: '适用税率', note: '按应纳税所得额查经营所得税率表（五级）', value: tax.applicableRate, format: 'percent' },
            { label: '速算扣除数', note: '', value: tax.applicableDeduction }
        ],
        totalLabel: '减半征收前应纳税额',
        totalValue: tax.totalTaxBeforeHalving,
        footnote: tax.taxableIncome.toFixed(2) + ' × ' + ratePercent + '% − '
            + tax.applicableDeduction.toFixed(2) + ' = ' + tax.totalTaxBeforeHalving.toFixed(2)
    });

    // 第六步：减半征收与实际应纳税额
    steps.push({
        title: '第六步：减半征收优惠与实际应纳税额',
        rows: [
            { label: '减半征收前应纳税额', note: '', value: tax.totalTaxBeforeHalving },
            { label: '减：减半征收减免税额', note: '年应纳税所得额不超过 200 万元的部分减半征收', value: tax.taxReduction }
        ],
        totalLabel: '实际应纳税额',
        totalValue: tax.totalTax,
        footnote: '政策依据：财政部 税务总局公告 2023 年第 12 号（个体工商户年应纳税所得额不超过 200 万元部分减半征收个人所得税）'
    });

    // 第七步：预缴与补退
    steps.push({
        title: '第七步：预缴税额与补退',
        rows: [
            { label: '实际应纳税额', note: '', value: tax.totalTax },
            { label: '减：累计已预缴税额', note: '', value: tax.prepaidTax }
        ],
        totalLabel: tax.refundTax >= 0 ? '应补税额' : '应退税额',
        totalValue: Math.abs(tax.refundTax),
        footnote: '应退/应补 = 应纳税额 − 已预缴税额'
    });

    // 最后一步：税后经营所得
    steps.push({
        title: '最后一步：计算税后经营所得',
        rows: [
            { label: '弥补亏损后所得', note: '', value: tax.netIncome },
            { label: '减：实际应纳税额', note: '', value: tax.totalTax }
        ],
        totalLabel: '税后经营所得',
        totalValue: tax.netIncomeAfterTax,
        footnote: ''
    });

    return steps;
}

// 分类所得推导链：输入 calculateClassificationTaxTotal 产出的 classificationCalculationResults
function buildClassificationFormulaSteps(results) {
    const items = results.items || [];
    const steps = [];

    const typeNames = {
        interest: '利息所得',
        accidental: '偶然所得',
        rent: '财产租赁所得',
        transfer: '财产转让所得'
    };

    // 每个条目一步：收入 → 应纳税所得额 → 税额
    items.forEach(function (item, idx) {
        let taxableNote = '按 ' + (item.taxRate * 100).toFixed(0) + '% 比例税率，不减除任何费用';
        if (item.type === 'rent') {
            taxableNote = item.income <= 4000
                ? '收入 ≤ 4000：减除费用 800 元' + (item.deduction ? ' 及修缮费等' : '')
                : '收入 > 4000：减除 20% 费用' + (item.deduction ? ' 及修缮费等' : '');
        } else if (item.type === 'transfer') {
            taxableNote = '按财产原值与合理费用减除后计税';
        }

        const rows = [
            { label: '收入', note: '', value: item.income }
        ];
        if (item.income !== item.taxableIncome) {
            rows.push({ label: '减：费用减除', note: taxableNote, value: item.income - item.taxableIncome });
        }

        steps.push({
            title: '第' + (idx + 1) + '步：' + (item.typeName || typeNames[item.type] || item.type),
            rows: rows,
            totalLabel: '应纳税额',
            totalValue: item.totalTax,
            footnote: item.taxableIncome.toFixed(2) + ' × ' + (item.taxRate * 100).toFixed(0) + '% = '
                + item.totalTax.toFixed(2) + '（分类所得按次/按项单独计税，不并入综合所得）'
        });
    });

    // 汇总
    steps.push({
        title: '最后一步：分类所得汇总',
        rows: [
            { label: '收入合计', note: '', value: results.totalIncome },
            { label: '应纳税所得额合计', note: '', value: results.totalTaxableIncome }
        ],
        totalLabel: '应纳税额合计',
        totalValue: results.totalTax,
        footnote: '分类所得各自独立计税，汇总额为各条目税额直接相加'
    });

    return steps;
}

// 反向倒算推导链：输入由 tool-registry.js 的 buildReverseResultsRecord 攒出来的结果对象
//（原先是页面版 saveReverseCalculationResult 写的全局 reverseCalculationResults，17B-2 随页面删除）
function buildReverseFormulaSteps(results) {
    const income = results.incomeDetails;
    const deduction = results.deductionDetails;
    const tax = results.taxDetails;
    const steps = [];

    const reverseTypeNames = { rate: '按目标税率倒算', monthly: '按月度税后收入倒算', tax: '按目标税额倒算' };
    const incomeTypeNames = { comprehensive: '综合所得（工资薪金）', business: '经营所得' };

    // 第一步：目标（倒算的已知量）
    let goalRow;
    if (results.reverseType === 'rate') {
        goalRow = { label: '目标税率档', note: '求收入落在该档位的区间', value: tax.applicableRate, format: 'percent' };
    } else if (results.reverseType === 'monthly') {
        goalRow = { label: '月度税后收入目标', note: '× ' + results.workMonths + ' 个月为年度目标', value: tax.monthlyNet };
    } else {
        goalRow = { label: '目标税额', note: '', value: tax.targetTax };
    }
    steps.push({
        title: '第一步：倒算目标',
        rows: [
            { label: '倒算方式', note: incomeTypeNames[results.incomeType] || results.incomeType, value: reverseTypeNames[results.reverseType] || results.reverseType, format: 'text' },
            goalRow
        ],
        totalLabel: '目标口径',
        totalValue: results.reverseType === 'rate' ? tax.applicableRate : (results.reverseType === 'monthly' ? tax.monthlyNet : tax.targetTax),
        footnote: '反向倒算由目标出发反推收入，以下步骤给出推导路径',
        format: 'text'
    });

    // 第二步：年度扣除额合计
    const deductionRows = [];
    if (deduction.basic > 0) {
        deductionRows.push({
            label: '基本减除费用',
            note: deduction.basic.toFixed(2) + ' × ' + results.workMonths + ' 个月',
            value: deduction.basic * results.workMonths
        });
    }
    if (deduction.specialDeductionTotal > 0) {
        deductionRows.push({ label: '专项扣除（三险一金）', note: '个人缴纳部分全年合计', value: deduction.specialDeductionTotal });
    }
    if (deduction.specialAdditionalTotal > 0) {
        deductionRows.push({ label: '专项附加扣除', note: '子女教育 / 赡养老人 / 住房 / 继续教育等', value: deduction.specialAdditionalTotal });
    }
    if (deduction.otherTotal > 0) {
        deductionRows.push({ label: '其他扣除', note: '个人养老金 / 企业年金 / 商业健康险 / 公益捐赠等', value: deduction.otherTotal });
    }
    steps.push({
        title: '第二步：汇总年度扣除额',
        rows: deductionRows.length ? deductionRows : [{ label: '未填写扣除项', note: '', value: 0 }],
        totalLabel: '年度扣除额合计',
        totalValue: results.totalDeduction,
        footnote: ''
    });

    // 第三步：应纳税所得额（由目标反推）
    steps.push({
        title: '第三步：反推应纳税所得额',
        rows: [
            { label: '适用税率', note: '按倒算结果查税率表', value: tax.applicableRate, format: 'percent' },
            { label: '速算扣除数', note: '', value: tax.applicableDeduction }
        ],
        totalLabel: '应纳税所得额',
        totalValue: tax.taxableIncome,
        footnote: '由目标税额/税后收入反解：应纳税所得额 = (目标税额 + 速算扣除数) ÷ 适用税率'
    });

    // 第四步：年度应纳税额
    steps.push({
        title: '第四步：年度应纳税额',
        rows: [
            { label: '应纳税所得额', note: '', value: tax.taxableIncome },
            { label: '年终奖单独计税税额', note: results.bonusIncome > 0 ? '单独计税部分，不并入综合所得' : '', value: results.bonusTax }
        ],
        totalLabel: '年度应纳税额合计',
        totalValue: results.totalTax,
        footnote: ''
    });

    // 第五步：反推所需收入（核心结果）
    steps.push({
        title: '第五步：反推所需税前收入',
        rows: [
            { label: '应纳税所得额', note: '', value: tax.taxableIncome },
            { label: '加：年度扣除额合计', note: '', value: results.totalDeduction }
        ],
        totalLabel: '所需税前收入',
        totalValue: income.total,
        footnote: results.reverseType === 'rate'
            ? '按目标税率倒算时，落在该档位的收入是一个区间（相邻档位边界之间）'
            : ''
    });

    // 最后一步：验证税后收入（闭合校验）
    steps.push({
        title: '最后一步：验证（正向重算税后收入）',
        rows: [
            { label: '所需税前收入', note: '', value: income.total },
            { label: '减：年度应纳税额', note: '', value: results.totalTax }
        ],
        totalLabel: '税后收入（正向验算）',
        totalValue: tax.netIncome,
        footnote: '用反推结果正向重算税后收入，与目标一致说明推导闭合'
    });

    return steps;
}

// ===== Phase 2：结果页「结论 / 一句话理由 / 注意点」=====
// 放在这里的原因：buildFormulaSteps 已在本文件消费同一份 results，
// 叙述与推导链必须同口径，否则「结论说退税、推导链算出补税」的漂移没人把关。
var REFUND_EPSILON = 0.005;

// 三种结论对应的「下一步动作」。汇算期口径：次年 3 月 1 日—6 月 30 日（个税法实施条例）；
// 这句话是结果页唯一告诉用户「要做什么」的地方，不能只给数字。
// 理由的「后半句」：解释这个方向是怎么来的（预缴 vs 应纳税额的大小关系）
var RESULT_REASON_TAIL = {
    owe: '预缴少于应纳税额，差额部分需要补缴。',
    refund: '预缴多于应纳税额，多缴部分可以退回。',
    even: '预缴与应纳税额刚好持平。'
};

var RESULT_ACTIONS = {
    owe: '汇算期（次年 3 月 1 日—6 月 30 日）内完成申报补缴，逾期按日加收万分之五滞纳金',
    refund: '汇算期内申请退税，退税款将退至你绑定的银行卡',
    even: '全年预缴与应纳税额一致，无需办理汇算'
};

function buildResultNarrative(results) {
    const tax = results.taxDetails || {};
    const refundTax = Number(tax.refundTax) || 0;
    const direction = Math.abs(refundTax) < REFUND_EPSILON ? 'even' : (refundTax > 0 ? 'owe' : 'refund');
    return {
        direction: direction,
        action: RESULT_ACTIONS[direction],
        reason: buildResultReason(results, direction),
        pitfalls: buildResultPitfalls(results, direction)
    };
}

function yuan(value) {
    return '¥' + (Number(value) || 0).toFixed(2);
}

// 一句话理由：先说税负水平，再说「最影响这个结果的那一个变量」。
// 不铺陈公式（公式在推导链），也不重复 Hero 已有的税后金额。
function buildResultReason(results, direction) {
    const tax = results.taxDetails || {};
    const income = results.incomeDetails || {};
    const preTax = Number(income.preTaxTotal) || 0;
    const rate = preTax > 0 ? (Number(tax.totalTax) || 0) / preTax * 100 : 0;
    const head = '税前 ' + yuan(preTax) + '，全年税额 ' + yuan(tax.totalTax) + '，实际税负 ' + rate.toFixed(1) + '%。';
    const tail = RESULT_REASON_TAIL[direction] || '';
    return head + tail;
}

// 注意点：只留「会影响这笔钱」的 2-3 条，且必须是本结果触发的，不是通用免责。
// 排序原则：越可能导致用户实际损失越靠前（补税逾期 > 年终奖方式 > 数据口径）。
function buildResultPitfalls(results, direction) {
    const list = [];
    if (direction === 'owe') {
        list.push('6 月 30 日之后补缴会产生滞纳金，金额较大时可先在「个人所得税」App 预约办理。');
    }
    const income = results.incomeDetails || {};
    if (Number(income.bonus) > 0) {
        list.push('年终奖按' + (income.bonusInclude ? '并入综合所得' : '单独计税') + '测算；两种方式差额可能很大，建议两种都算一遍再决定。');
    }
    if (direction === 'refund') {
        list.push('退税需要本人银行卡信息已在「个人所得税」App 完成核验，否则会卡在退库环节。');
    }
    return list;
}

var RESULT_DETAILS_OPEN_KEY = 'euriskoResultDetailsOpen';

function bindRememberCollapse(panelId, storageKey) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    if (window.localStorage.getItem(storageKey) === '1') panel.open = true;
    panel.addEventListener('toggle', function () {
        window.localStorage.setItem(storageKey, panel.open ? '1' : '0');
    });
}

// 只在首次渲染时挂一次监听（updateResultNarrative 每次计算都会跑）
function bindResultCollapseOnce() {
    const panel = document.getElementById('result-details-panel');
    if (!panel || panel.dataset.collapseBound === '1') return;
    panel.dataset.collapseBound = '1';
    bindRememberCollapse('result-details-panel', RESULT_DETAILS_OPEN_KEY);
}

function updateResultNarrative(results) {
    bindResultCollapseOnce();
    const narrative = buildResultNarrative(results || {});
    const box = document.getElementById('result-conclusion');
    if (box) {
        box.classList.remove('is-even', 'is-owe', 'is-refund');
        box.classList.add('is-' + narrative.direction);
    }
    const actionEl = document.getElementById('result-conclusion-action');
    if (actionEl) actionEl.textContent = narrative.action;
    const reasonEl = document.getElementById('result-reason');
    if (reasonEl) reasonEl.textContent = narrative.reason;
    renderResultPitfalls(narrative.pitfalls);
}

function renderResultPitfalls(pitfalls) {
    const box = document.getElementById('result-pitfalls');
    const ul = document.getElementById('result-pitfall-list');
    if (!box || !ul) return;
    if (!pitfalls || !pitfalls.length) {
        box.classList.add('hidden');
        ul.innerHTML = '';
        return;
    }
    box.classList.remove('hidden');
    ul.innerHTML = pitfalls.map(function (t) { return '<li>' + t + '</li>'; }).join('');
}


