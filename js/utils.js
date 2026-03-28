// 更新预算表
function updateBudgetTable() {
    if (Object.keys(calculationResults).length === 0) return;
    
    const workMonths = calculationResults.workMonths;
    const tbody = document.getElementById('budget-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const monthlySalary = calculationResults.incomeDetails.salary;
    // laborCalculated、authorCalculated 和 royaltyCalculated 已经是年度计算后的值，需要除以12得到月度值
    const monthlyLabor = calculationResults.incomeDetails.laborCalculated / 12;
    const monthlyAuthor = calculationResults.incomeDetails.authorCalculated / 12;
    const monthlyRoyalty = calculationResults.incomeDetails.royaltyCalculated / 12;
    const monthlyBonus = calculationResults.incomeDetails.bonusInclude ? calculationResults.incomeDetails.bonus / workMonths : 0;
    
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
    
    let cumulativeTaxableIncome = 0;
    let cumulativeTax = 0;
    
    // 大病医疗按年计算，不平均到工作月
    const annualMedicalDeduction = calculationResults.deductionDetails.actualMedical;
    // 年终奖税额
    const bonusTax = calculationResults.incomeDetails.bonusTax || 0;
    // 总应纳税额（来自计算结果）
    const totalTax = calculationResults.taxDetails.totalTax - bonusTax;
    
    // 1. 生成月度数据表格
    for (let month = 1; month <= workMonths; month++) {
        // 只计算月工资的收入
        const monthlyIncome = monthlySalary;
        // 月度扣除不包含大病医疗
        const monthlyDeduction = monthlyBasicDeduction + monthlyInsuranceDeduction + monthlySpecialAdditional + monthlyOtherDeduction;
        const monthlyTaxableIncome = Math.max(0, monthlyIncome - monthlyDeduction);
        
        cumulativeTaxableIncome += monthlyTaxableIncome;
        
        // 最后一个月减去年度大病医疗扣除，并加上年终奖税额
        let adjustedTaxableIncome = cumulativeTaxableIncome;
        let monthTax = 0;
        
        if (month === workMonths) {
            adjustedTaxableIncome = Math.max(0, cumulativeTaxableIncome - annualMedicalDeduction);
            // 最后一个月的税额 = 总应纳税额 - 之前累计的税额 + 年终奖税额
            monthTax = totalTax - cumulativeTax + bonusTax;
        } else {
            // 前11个月的税额 = 总应纳税额 / 12
            monthTax = totalTax / workMonths;
        }
        
        cumulativeTax += monthTax;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${month}月</td>
            <td>${monthlyIncome.toFixed(2)}</td>
            <td>${monthlyDeduction.toFixed(2)}</td>
            <td>${monthlyTaxableIncome.toFixed(2)}</td>
            <td>${getTaxRate(adjustedTaxableIncome)}%</td>
            <td>${monthTax.toFixed(2)}</td>
            <td>${cumulativeTax.toFixed(2)}</td>
        `;
        
        tbody.appendChild(row);
    }
    
    // 2. 添加劳务所得、稿酬所得、特许权使用费表格
    const laborIncome = calculationResults.incomeDetails.labor || 0;
    const laborDeduction = laborIncome > 4000 ? laborIncome * 0.2 : 800;
    const laborTaxableIncome = Math.max(0, laborIncome - laborDeduction);
    
    // 劳务报酬预扣预缴采用累进税率
    let laborTaxRate = 0.2;
    let laborTax = 0;
    if (laborTaxableIncome <= 20000) {
        laborTax = laborTaxableIncome * 0.2;
        laborTaxRate = 0.2;
    } else if (laborTaxableIncome <= 50000) {
        laborTax = laborTaxableIncome * 0.3 - 2000;
        laborTaxRate = 0.3;
    } else {
        laborTax = laborTaxableIncome * 0.4 - 7000;
        laborTaxRate = 0.4;
    }
    
    const authorIncome = calculationResults.incomeDetails.author || 0;
    const authorDeduction = authorIncome > 4000 ? authorIncome * 0.2 : 800;
    const authorTaxableIncome = Math.max(0, authorIncome - authorDeduction) * 0.7;
    const authorTaxRate = 0.2;
    const authorTax = authorTaxableIncome * authorTaxRate;
    
    const royaltyIncome = calculationResults.incomeDetails.royalty || 0;
    const royaltyDeduction = royaltyIncome > 4000 ? royaltyIncome * 0.2 : 800;
    const royaltyTaxableIncome = Math.max(0, royaltyIncome - royaltyDeduction);
    const royaltyTaxRate = 0.2;
    const royaltyTax = royaltyTaxableIncome * royaltyTaxRate;
    
    // 检查是否有任何分类所得
    if (laborIncome > 0 || authorIncome > 0 || royaltyIncome > 0) {
        // 添加空行
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td colspan="7"></td>
        `;
        tbody.appendChild(emptyRow);
        
        const categoryRow2 = document.createElement('tr');
        categoryRow2.innerHTML = `
            <td class="font-bold">类型</td>
            <td class="font-bold">收入</td>
            <td class="font-bold">扣除</td>
            <td class="font-bold">应纳税所得额</td>
            <td class="font-bold">税率</td>
            <td class="font-bold">预缴税额</td>
            <td></td>
        `;
        tbody.appendChild(categoryRow2);
        
        // 劳务所得行
        if (laborIncome > 0) {
            const laborRow = document.createElement('tr');
            laborRow.innerHTML = `
                <td>劳务所得</td>
                <td>${laborIncome.toFixed(2)}</td>
                <td>${laborDeduction.toFixed(2)}</td>
                <td>${laborTaxableIncome.toFixed(2)}</td>
                <td>${(laborTaxRate * 100).toFixed(0)}%</td>
                <td>${laborTax.toFixed(2)}</td>
                <td></td>
            `;
            tbody.appendChild(laborRow);
        }
        
        // 稿酬所得行
        if (authorIncome > 0) {
            const authorRow = document.createElement('tr');
            authorRow.innerHTML = `
                <td>稿酬所得</td>
                <td>${authorIncome.toFixed(2)}</td>
                <td>${authorDeduction.toFixed(2)}</td>
                <td>${authorTaxableIncome.toFixed(2)}</td>
                <td>${(authorTaxRate * 100).toFixed(0)}%</td>
                <td>${authorTax.toFixed(2)}</td>
                <td></td>
            `;
            tbody.appendChild(authorRow);
        }
        
        // 特许权使用费行
        if (royaltyIncome > 0) {
            const royaltyRow = document.createElement('tr');
            royaltyRow.innerHTML = `
                <td>特许权使用费</td>
                <td>${royaltyIncome.toFixed(2)}</td>
                <td>${royaltyDeduction.toFixed(2)}</td>
                <td>${royaltyTaxableIncome.toFixed(2)}</td>
                <td>${(royaltyTaxRate * 100).toFixed(0)}%</td>
                <td>${royaltyTax.toFixed(2)}</td>
                <td></td>
            `;
            tbody.appendChild(royaltyRow);
        }
    }
    
    // 5. 添加综合所得汇算表格
    const annualIncome = calculationResults.incomeDetails.total || 0;
    const annualDeduction = calculationResults.deductionDetails.total || 0;
    const annualTaxableIncome = Math.max(0, annualIncome - annualDeduction);
    const annualTaxRate = calculationResults.taxDetails.applicableRate || 0;
    const annualTax = calculationResults.taxDetails.totalTax || 0;
    const prepaidTax = calculationResults.taxDetails.prepaidTax || 0;
    const refundTax = annualTax - prepaidTax;
    
    const finalRow1 = document.createElement('tr');
    finalRow1.innerHTML = `
        <td class="section-title" colspan="7">综合所得汇算</td>
    `;
    tbody.appendChild(finalRow1);
    
    const finalRow2 = document.createElement('tr');
    finalRow2.innerHTML = `
        <td>全年收入额</td>
        <td>年度扣除合计</td>
        <td>应纳税所得额合计</td>
        <td>税率</td>
        <td>应纳税额</td>
        <td>已纳税额</td>
        <td>应退/补税额</td>
    `;
    tbody.appendChild(finalRow2);
    
    const finalRow3 = document.createElement('tr');
    finalRow3.innerHTML = `
        <td>${annualIncome.toFixed(2)}</td>
        <td>${annualDeduction.toFixed(2)}</td>
        <td>${annualTaxableIncome.toFixed(2)}</td>
        <td>${(annualTaxRate * 100).toFixed(0)}%</td>
        <td>${annualTax.toFixed(2)}</td>
        <td>${prepaidTax.toFixed(2)}</td>
        <td class="${refundTax < 0 ? 'negative' : 'positive'}">${refundTax.toFixed(2)}</td>
    `;
    tbody.appendChild(finalRow3);
    
    // 更新生成日期
    const dateElement = document.getElementById('budget-table-date');
    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString();
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
    // 月度扣除不包含大病医疗
    const monthlyDeduction = (reverseCalculationResults.totalDeduction - reverseCalculationResults.deductionDetails.actualMedical) / workMonths;
    const monthlyTaxableIncome = monthlyIncome - monthlyDeduction;
    const monthlyTax = reverseCalculationResults.totalTax / workMonths;
    
    let cumulativeTaxableIncome = 0;
    let cumulativeTax = 0;
    
    // 大病医疗按年计算，不平均到工作月
    const annualMedicalDeduction = reverseCalculationResults.deductionDetails.actualMedical || 0;
    
    for (let month = 1; month <= workMonths; month++) {
        cumulativeTaxableIncome += monthlyTaxableIncome;
        
        // 最后一个月减去年度大病医疗扣除
        let adjustedTaxableIncome = cumulativeTaxableIncome;
        if (month === workMonths) {
            adjustedTaxableIncome = Math.max(0, cumulativeTaxableIncome - annualMedicalDeduction);
        }
        
        cumulativeTax += monthlyTax;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${month}月</td>
            <td>¥${monthlyIncome.toFixed(2)}</td>
            <td>¥${monthlyDeduction.toFixed(2)}</td>
            <td>¥${monthlyTaxableIncome.toFixed(2)}</td>
            <td>${getTaxRate(adjustedTaxableIncome)}%</td>
            <td>¥${monthlyTax.toFixed(2)}</td>
            <td>¥${cumulativeTax.toFixed(2)}</td>
        `;
        
        tbody.appendChild(row);
    }
    
    // 更新生成日期
    const dateElement = document.getElementById('reverse-budget-table-date');
    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString();
    }
}

// 更新经营所得预算表
function updateBusinessBudgetTable() {
    if (Object.keys(businessCalculationResults).length === 0) return;
    
    const tbody = document.getElementById('business-budget-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const rows = [
        { item: '年度经营收入总额', amount: businessCalculationResults.incomeDetails.businessIncome, description: '包括主营业务收入和其他业务收入' },
        { item: '年度成本', amount: businessCalculationResults.incomeDetails.businessCost, description: '包括原材料、商品采购等直接成本' },
        { item: '年度费用', amount: businessCalculationResults.incomeDetails.businessExpenses, description: '包括房租、水电费、办公费等间接费用' },
        { item: '年度税金', amount: businessCalculationResults.incomeDetails.businessTaxes, description: '包括增值税、城建税、教育费附加等' },
        { item: '年度损失', amount: businessCalculationResults.incomeDetails.businessLosses, description: '包括资产损失、坏账损失等' },
        { item: '其他支出', amount: businessCalculationResults.incomeDetails.businessOtherExpenses, description: '其他与经营活动相关的支出' },
        { item: '以前年度亏损弥补', amount: businessCalculationResults.incomeDetails.businessPreviousLosses, description: '允许弥补的以前年度亏损' },
        { item: '投资者减除费用', amount: businessCalculationResults.deductionDetails.investorDeduction, description: '固定60000元/年' },
        { item: '其他扣除', amount: businessCalculationResults.deductionDetails.otherDeduction, description: '个人养老金、商业健康保险等' },
        { item: '年度应纳税所得额', amount: businessCalculationResults.taxDetails.taxableIncome, description: '经营利润减去各项扣除后的余额' },
        { item: '适用税率', amount: businessCalculationResults.taxDetails.applicableRate * 100, description: '根据应纳税所得额确定的税率' },
        { item: '速算扣除数', amount: businessCalculationResults.taxDetails.applicableDeduction, description: '根据税率级数确定的速算扣除数' },
        { item: '年度应纳税额', amount: businessCalculationResults.taxDetails.totalTax, description: '应纳税所得额乘以适用税率减去速算扣除数' },
        { item: '全年累计已预缴税额', amount: businessCalculationResults.taxDetails.prepaidTax, description: '年度内已预缴的经营所得税额' },
        { item: '年度应退/应补税额', amount: businessCalculationResults.taxDetails.refundTax, description: '应纳税额减去已预缴税额' },
        { item: '税后经营所得', amount: businessCalculationResults.taxDetails.netIncome, description: '经营利润减去应纳税额' }
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
    
    // 更新生成日期
    const dateElement = document.getElementById('business-budget-table-date');
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

// 更新经营所得图表
function updateBusinessCharts() {
    // 经营所得构成分析图表
    updateBusinessCompositionChart();
}

// 更新经营所得构成分析图表
function updateBusinessCompositionChart() {
    if (Object.keys(businessCalculationResults).length === 0) return;
    
    const ctx = document.getElementById('business-composition-chart');
    if (!ctx) return;
    
    const businessIncome = businessCalculationResults.incomeDetails.businessIncome;
    const businessProfit = businessCalculationResults.incomeDetails.businessProfit;
    const totalTax = businessCalculationResults.taxDetails.totalTax;
    const netIncome = businessCalculationResults.taxDetails.netIncome;
    const totalCosts = businessIncome - businessProfit;
    
    if (window.businessCompositionChart) {
        window.businessCompositionChart.destroy();
    }
    
    window.businessCompositionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['税后经营所得', '个人所得税', '成本费用'],
            datasets: [{
                data: [netIncome, totalTax, totalCosts],
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
                    text: '经营所得构成分析'
                }
            }
        }
    });
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
    if (Object.keys(calculationResults).length === 0) return;
    
    const ctx = document.getElementById('tax-rate-distribution-chart');
    if (!ctx) return;
    
    const taxableIncome = calculationResults.taxDetails.taxableIncome;
    // 直接定义税率表，避免依赖外部变量
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
    const monthlyLabor = calculationResults.incomeDetails.laborCalculated / 12;
    const monthlyAuthor = calculationResults.incomeDetails.authorCalculated / 12;
    const monthlyRoyalty = calculationResults.incomeDetails.royaltyCalculated / 12;
    const monthlyBonus = calculationResults.incomeDetails.bonusInclude ? calculationResults.incomeDetails.bonus / workMonths : 0;
    
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
        // 确保comprehensiveTaxRates变量存在
        if (typeof comprehensiveTaxRates !== 'undefined') {
            for (const bracket of comprehensiveTaxRates) {
                if (cumulativeTaxableIncome <= bracket.max) {
                    monthTax = cumulativeTaxableIncome * bracket.rate - bracket.deduction - cumulativeTax;
                    break;
                }
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
        
        // 只有当另一种方式确实更优时才给出建议
        if (Math.abs(alternativeTax - bonusTax) > 100) {
            if (alternativeTax < bonusTax) {
                const betterMethod = bonusInclude ? '单独计税' : '并入综合所得计税';
                const taxSaved = bonusTax - alternativeTax;
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


