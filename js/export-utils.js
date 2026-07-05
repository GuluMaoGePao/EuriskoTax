// 导出到Word文档
function exportToWord(elementId, title) {
    // 获取计算结果数据
    if (Object.keys(calculationResults).length === 0 && 
        Object.keys(reverseCalculationResults).length === 0 &&
        Object.keys(businessCalculationResults).length === 0) {
        showAlert('请先进行计算，再导出文档');
        return;
    }
    
    // 构建Word文档内容
    const docContent = generateWordDocumentContent(title);
    
    // 创建Blob对象
    const blob = new Blob(['\ufeff' + docContent], { type: 'application/msword' });
    
    // 创建下载链接
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title}_${new Date().toISOString().split('T')[0]}.doc`;
    link.click();
}

// 安全格式化数值
function safeFormatNumber(value, decimals = 2) {
    const num = parseFloat(value);
    if (isNaN(num) || !isFinite(num)) {
        return '0.' + '0'.repeat(decimals);
    }
    return num.toFixed(decimals);
}

// 生成Word文档内容
function generateWordDocumentContent(title) {
    // 优先使用反向倒算结果（如果有），否则使用正向计算结果，最后检查经营所得
    const hasReverseCalculation = Object.keys(reverseCalculationResults).length > 0;
    const hasForwardCalculation = Object.keys(calculationResults).length > 0;
    const hasBusinessCalculation = Object.keys(businessCalculationResults).length > 0;
    
    // 如果是经营所得
    if (title.includes('经营所得')) {
        return generateBusinessDocumentContent(title);
    }
    
    // 综合所得或反向倒算
    const isReverseCalculation = hasReverseCalculation;
    const results = isReverseCalculation ? reverseCalculationResults : calculationResults;
    const workMonths = results.workMonths;
    
    // 构建收入明细（根据计算类型）
    let incomeDetails;
    let deductionDetails;
    let taxDetails;
    
    if (isReverseCalculation) {
        // 反向倒算结果结构
        const bonusInclude = document.getElementById('reverse-bonus-include')?.checked || false;
        const regularIncome = calculateRegularIncome(results.totalIncome, results.bonusIncome, bonusInclude);
        
        incomeDetails = {
            total: results.totalIncome,
            bonus: results.bonusIncome,
            bonusInclude: bonusInclude,
            bonusTax: results.bonusTax,
            // 添加缺失的属性，避免toFixed错误
            labor: 0,
            laborCalculated: 0,
            laborTax: 0,
            author: 0,
            authorCalculated: 0,
            authorTax: 0,
            royalty: 0,
            royaltyCalculated: 0,
            royaltyTax: 0,
            salary: regularIncome / results.workMonths // 平均月工资（不含年终奖）
        };
        
        deductionDetails = {
            total: results.totalDeduction,
            basic: 5000,
            pensionInsurance: 0,
            medicalInsurance: 0,
            unemploymentInsurance: 0,
            housingFund: 0,
            elderly: 0,
            childrenInfant: 0,
            housing: 0,
            educationDegree: 0,
            professional: 0,
            actualMedical: results.deductionDetails.actualMedical || 0,
            pension: 0,
            enterpriseAnnuity: 0,
            insuranceOther: 0,
            taxDeferredPension: 0,
            charitableDonation: 0,
            specialAdditionalTotal: 0,
            otherTotal: 0
        };
        
        const reverseTotalTax = results.totalTax || 0;
        
        taxDetails = {
            taxableIncome: results.taxableIncome || 0,
            applicableRate: results.applicableRate || 0,
            applicableDeduction: results.applicableDeduction || 0,
            totalTax: reverseTotalTax,
            prepaidTax: 0, // 反向倒算为预测性计算，尚未实际缴纳
            refundTax: reverseTotalTax - 0, // 应退/补税额 = 应纳税额 - 已纳税额
            netIncome: results.netIncome || 0
        };
    } else {
        // 正向计算结果结构
        incomeDetails = results.incomeDetails;
        deductionDetails = results.deductionDetails;
        taxDetails = results.taxDetails;
    }
    
    // 生成月度数据
    const monthlyData = generateMonthlyData(results);
    
    // 生成税收优化建议
    const optimizationTips = generateOptimizationTipsForWord();
    
    // 构建完整的HTML内容
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        * {
            font-family: 'SimSun', '宋体', serif;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'SimSun', '宋体', serif;
            margin: 0;
            line-height: 1.5;
            font-size: 14pt;
            color: #000;
        }
        .cover {
            text-align: center;
            margin-bottom: 0px;
            padding: 0 0;
        }
        .cover h1 {
            font-size: 22pt;
            font-weight: bold;
            margin-bottom: 30px;
            color: #000;
        }
        .cover p {
            font-size: 14pt;
            color: #000;
            margin-bottom: 10px;
        }
        .section {
            margin-bottom: 30px;
            page-break-inside: avoid;
        }
        .section h2 {
            font-size: 16pt;
            font-weight: bold;
            margin-bottom: 15px;
            padding-bottom: 5px;
            color: #000;
        }
        .section h3 {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 12px;
            margin-top: 20px;
            color: #000;
        }
        .section p {
            font-size: 14pt;
            margin-bottom: 10px;
            text-align: justify;
        }
        .info-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 12pt;
            page-break-inside: avoid;
            page-break-before: auto;
            page-break-after: auto;
        }
        .info-table th,
        .info-table td {
            border: 1px solid #000;
            padding: 6px;
            text-align: left;
            font-size: 12pt;
        }
        .info-table th {
            background-color: #f0f0f0;
            font-weight: bold;
            color: #000;
        }
        .summary-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 12pt;
            page-break-inside: avoid;
            page-break-before: auto;
            page-break-after: auto;
        }
        .summary-table th,
        .summary-table td {
            border: 1px solid #000;
            padding: 8px;
            text-align: right;
            font-size: 12pt;
        }
        .summary-table th {
            background-color: #f0f0f0;
            font-weight: bold;
            text-align: left;
            color: #000;
        }
        .highlight {
            font-weight: bold;
            color: #000;
        }
        .danger {
            font-weight: bold;
            color: #000;
        }
        .success {
            font-weight: bold;
            color: #000;
        }
        .tips {
            background-color: #f9f9f9;
            border-left: 3px solid #000;
            padding: 10px;
            margin: 12px 0;
        }
        .tips h4 {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 6px;
            color: #000;
        }
        .tips p {
            font-size: 14pt;
            margin-bottom: 4px;
            line-height: 1.4;
        }
        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 2px solid #000;
            text-align: center;
            font-size: 12pt;
            color: #666;
        }
        .footer p {
            font-size: 12pt;
            margin-bottom: 4px;
        }
        .note {
            font-size: 12pt;
            color: #666;
            margin-top: 8px;
            font-style: italic;
        }
        .cover-info {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            padding: 0 0 10px 0;
            border-bottom: 1px solid #000;
        }
        .cover-info span {
            font-size: 14pt;
        }
        .footer-info {
            display: flex;
            justify-content: center;
            gap: 30px;
            padding: 15px 0;
            border-top: 2px solid #000;
        }
        .footer-info span {
            font-size: 12pt;
            color: #666;
        }
    </style>
</head>
<body>
    <!-- 封面 -->
    <div class="cover">
        <h1>${title}</h1>
        <div class="cover-info">
            <span>生成日期：${new Date().toLocaleDateString()}</span>
            <span>计算类型：综合所得计税</span>
            <span>工作月数：${workMonths}个月</span>
        </div>
    </div>
    
    <!-- 报告概述 -->
    <div class="section">
        <h2>1. 报告概述</h2>
        <p>本报告根据《中华人民共和国个人所得税法》及其实施条例，结合您提供的个人收入和扣除信息，对2026年度综合所得进行了详细计算。</p>
        <p>报告涵盖年度总览、收入明细、扣除项明细、月度个税明细、税率分布分析、税收优化建议及结论等内容，旨在为您提供清晰的税务状况分析和合规的税务规划建议。</p>
        <p class="note">声明：本报告仅供参考，实际纳税情况以税务部门核算结果为准。</p>
    </div>
    
    <!-- 年度总览 -->
    <div class="section">
        <h2>2. 年度总览</h2>
        <table class="summary-table">
            <tr>
                <th>项目</th>
                <th>金额（元）</th>
            </tr>
            <tr>
                <td>年度应税综合所得</td>
                <td>${incomeDetails.total.toFixed(2)}</td>
            </tr>
            <tr>
                <td>年度总扣除</td>
                <td class="success">${deductionDetails.total.toFixed(2)}</td>
            </tr>
            <tr>
                <td>应纳税所得额</td>
                <td>${taxDetails.taxableIncome.toFixed(2)}</td>
            </tr>
            <tr>
                <td>适用税率</td>
                <td>${(taxDetails.applicableRate * 100).toFixed(0)}%</td>
            </tr>
            <tr>
                <td>速算扣除数</td>
                <td>${taxDetails.applicableDeduction.toFixed(2)}</td>
            </tr>
            <tr>
                <td>年度应纳税额</td>
                <td class="danger">${(taxDetails.totalTax - (incomeDetails.bonusTax || 0)).toFixed(2)}</td>
            </tr>
            ${incomeDetails.bonus > 0 ? `
            <tr>
                <td>年终奖税额（${incomeDetails.bonusInclude ? '并入综合所得计税' : '单独计税'}）</td>
                <td class="danger">${(incomeDetails.bonusTax || 0).toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr>
                <td>全年累计已预缴税额</td>
                <td>${taxDetails.prepaidTax.toFixed(2)}</td>
            </tr>
            <tr>
                <td>年度应退/应补税额</td>
                <td class="${taxDetails.refundTax < 0 ? 'success' : taxDetails.refundTax > 0 ? 'danger' : ''}">${taxDetails.refundTax.toFixed(2)}</td>
            </tr>
            <tr>
                <td>税后年收入</td>
                <td class="highlight">${taxDetails.netIncome.toFixed(2)}</td>
            </tr>
        </table>
    </div>
    
    <!-- 收入明细 -->
    <div class="section">
        <h2>3. 收入明细</h2>
        <table class="info-table">
            <tr>
                <th>收入类型</th>
                <th>金额（元）</th>
                <th>计入综合所得金额（元）</th>
                <th>预扣税额（元）</th>
            </tr>
            <tr>
                <td>工资薪金所得</td>
                <td>${(incomeDetails.salary * workMonths).toFixed(2)}</td>
                <td>${(incomeDetails.salary * workMonths).toFixed(2)}</td>
                <td>-</td>
            </tr>
            <tr>
                <td>劳务报酬所得</td>
                <td>${incomeDetails.labor.toFixed(2)}</td>
                <td>${incomeDetails.laborCalculated.toFixed(2)}</td>
                <td>${incomeDetails.laborTax.toFixed(2)}</td>
            </tr>
            <tr>
                <td>稿酬所得</td>
                <td>${incomeDetails.author.toFixed(2)}</td>
                <td>${incomeDetails.authorCalculated.toFixed(2)}</td>
                <td>${incomeDetails.authorTax.toFixed(2)}</td>
            </tr>
            <tr>
                <td>特许权使用费所得</td>
                <td>${incomeDetails.royalty.toFixed(2)}</td>
                <td>${incomeDetails.royaltyCalculated.toFixed(2)}</td>
                <td>${incomeDetails.royaltyTax.toFixed(2)}</td>
            </tr>
            <tr>
                <td>年终奖</td>
                <td>${incomeDetails.bonus.toFixed(2)}</td>
                <td>${incomeDetails.bonusInclude ? incomeDetails.bonus.toFixed(2) : '0.00'}</td>
                <td>${(incomeDetails.bonusTax || 0).toFixed(2)}</td>
            </tr>
        </table>
    </div>
    
    <!-- 扣除项明细 -->
    <div class="section">
        <h2>4. 扣除项明细</h2>
        
        <h3>4.1 月度扣除明细</h3>
        <table class="info-table">
            <tr>
                <th>扣除类型</th>
                <th>月度金额（元）</th>
                <th>年度金额（元）</th>
            </tr>
            <tr>
                <td>基本减除费用</td>
                <td>${deductionDetails.basic.toFixed(2)}</td>
                <td>${(deductionDetails.basic * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>养老保险金</td>
                <td>${deductionDetails.pensionInsurance.toFixed(2)}</td>
                <td>${(deductionDetails.pensionInsurance * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>医疗保险金</td>
                <td>${deductionDetails.medicalInsurance.toFixed(2)}</td>
                <td>${(deductionDetails.medicalInsurance * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>失业保险金</td>
                <td>${deductionDetails.unemploymentInsurance.toFixed(2)}</td>
                <td>${(deductionDetails.unemploymentInsurance * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>住房公积金</td>
                <td>${deductionDetails.housingFund.toFixed(2)}</td>
                <td>${(deductionDetails.housingFund * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>赡养老人</td>
                <td>${deductionDetails.elderly.toFixed(2)}</td>
                <td>${(deductionDetails.elderly * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>子女教育 + 3岁以下婴幼儿照护</td>
                <td>${deductionDetails.childrenInfant.toFixed(2)}</td>
                <td>${(deductionDetails.childrenInfant * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>住房扣除（${deductionDetails.housing > 1200 ? '租金' : '贷款利息'}）</td>
                <td>${deductionDetails.housing.toFixed(2)}</td>
                <td>${(deductionDetails.housing * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>继续教育（学历）</td>
                <td>${(deductionDetails.educationDegree || 0).toFixed(2)}</td>
                <td>${((deductionDetails.educationDegree || 0) * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>个人养老金</td>
                <td>${deductionDetails.pension.toFixed(2)}</td>
                <td>${(deductionDetails.pension * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>企业年金</td>
                <td>${deductionDetails.enterpriseAnnuity.toFixed(2)}</td>
                <td>${(deductionDetails.enterpriseAnnuity * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>商业健康保险</td>
                <td>${deductionDetails.insuranceOther.toFixed(2)}</td>
                <td>${(deductionDetails.insuranceOther * workMonths).toFixed(2)}</td>
            </tr>
            <tr>
                <td>税收递延型养老保险</td>
                <td>${deductionDetails.taxDeferredPension.toFixed(2)}</td>
                <td>${(deductionDetails.taxDeferredPension * workMonths).toFixed(2)}</td>
            </tr>
        </table>
        
        <h3>4.2 年度一次性扣除</h3>
        <table class="info-table">
            <tr>
                <th>扣除类型</th>
                <th>金额（元）</th>
            </tr>
            <tr>
                <td>继续教育（职业资格）</td>
                <td>${deductionDetails.professional.toFixed(2)}</td>
            </tr>
            <tr>
                <td>大病医疗（实际可扣除）</td>
                <td>${deductionDetails.actualMedical.toFixed(2)}</td>
            </tr>
            <tr>
                <td>公益捐赠支出</td>
                <td>${deductionDetails.charitableDonation.toFixed(2)}</td>
            </tr>
        </table>
    </div>
    
    <!-- 月度个税明细 -->
    <div class="section">
        <h2>5. 月度个税明细</h2>
        <table class="info-table">
            <tr>
                <th>月份</th>
                <th>月工资收入（元）</th>
                <th>扣除（元）</th>
                <th>应纳税所得额（元）</th>
                <th>税率</th>
                <th>月工资应纳税额（元）</th>
                <th>累计已缴（元）</th>
            </tr>
            ${monthlyData.map((item, index) => `
            <tr>
                <td>${index + 1}月</td>
                <td>${item.monthlyIncome.toFixed(2)}</td>
                <td>${item.monthlyDeduction.toFixed(2)}</td>
                <td>${item.monthlyTaxableIncome.toFixed(2)}</td>
                <td>${item.applicableRate}%</td>
                <td>${item.monthTax.toFixed(2)}</td>
                <td>${item.cumulativeTax.toFixed(2)}</td>
            </tr>
            `).join('')}
        </table>
        
        ${incomeDetails.bonus > 0 && !incomeDetails.bonusInclude ? `
        <h3>5.1 年底一次性奖金（单独计税）</h3>
        <table class="info-table">
            <tr>
                <th>类型</th>
                <th>收入（元）</th>
                <th>扣除（元）</th>
                <th>应纳税所得额（元）</th>
                <th>税率</th>
                <th>应纳税额（元）</th>
            </tr>
            <tr>
                <td>年底一次性奖金</td>
                <td>${incomeDetails.bonus.toFixed(2)}</td>
                <td>0.00</td>
                <td>${incomeDetails.bonus.toFixed(2)}</td>
                <td>${(() => {
                    const monthlyBonus = incomeDetails.bonus / 12;
                    let applicableRate = 0;
                    for (const bracket of bonusMonthlyTaxRates) {
                        if (monthlyBonus <= bracket.max) {
                            applicableRate = bracket.rate * 100;
                            break;
                        }
                    }
                    return applicableRate;
                })()}%</td>
                <td>${(incomeDetails.bonusTax || 0).toFixed(2)}</td>
            </tr>
        </table>
        ` : ''}
    </div>
    
    <!-- 税率分布分析 -->
    <div class="section">
        <h2>6. 税率分布分析</h2>
        <p>根据计算结果，您的应纳税所得额为 ${taxDetails.taxableIncome.toFixed(2)} 元，适用税率为 ${(taxDetails.applicableRate * 100).toFixed(0)}%。</p>
        <p>税率分布情况如下：</p>
        ${generateTaxRateDistribution(taxDetails.taxableIncome)}
    </div>
    
    <!-- 税收优化建议 -->
    <div class="section">
        <h2>7. 税收优化建议</h2>
        ${optimizationTips}
    </div>
    
    <!-- 结论 -->
    <div class="section">
        <h2>8. 结论</h2>
        <p>经计算，2026年度您的应纳税额合计为 ${taxDetails.totalTax.toFixed(2)} 元，税后年收入为 ${taxDetails.netIncome.toFixed(2)} 元。</p>
        <p>若全年累计已预缴税额为 ${taxDetails.prepaidTax.toFixed(2)} 元，则 ${taxDetails.refundTax >= 0 ? '应补税额' : '应退税额'} 为 ${Math.abs(taxDetails.refundTax).toFixed(2)} 元。</p>
        <p>建议您依据本报告中的税收优化建议，合理规划个人税务，充分利用各项法定扣除政策，合规降低税负。同时，请妥善保存相关扣除凭证，以备税务部门核查。</p>
        <p>本报告数据截至生成之日，如遇税收政策调整，以最新政策为准。</p>
    </div>
    
    <!-- 页脚 -->
    <div class="footer">
        <div class="footer-info">
            <span>本报告由个人所得税计算小程序生成</span>
            <span>报告生成日期：${new Date().toLocaleDateString()}</span>
            <span>版本：2026.04.11</span>
        </div>
    </div>
</body>
</html>
    `;
}

// 生成月度数据
function generateMonthlyData(results) {
    const workMonths = results.workMonths;
    
    // 检查是否为反向倒算结果
    const isReverseCalculation = Object.keys(reverseCalculationResults).length > 0;
    
    let monthlySalary, monthlyBasicDeduction, monthlyInsuranceDeduction, monthlySpecialAdditional, monthlyOtherDeduction;
    
    if (isReverseCalculation) {
        // 反向倒算结果
        const bonusInclude = document.getElementById('reverse-bonus-include')?.checked || false;
        const regularIncome = calculateRegularIncome(results.totalIncome, results.bonusIncome, bonusInclude);
        monthlySalary = regularIncome / workMonths;
        monthlyBasicDeduction = results.deductionDetails?.basic || 5000;
        monthlyInsuranceDeduction = (results.deductionDetails?.pensionInsurance || 0) + 
                                     (results.deductionDetails?.medicalInsurance || 0) + 
                                     (results.deductionDetails?.unemploymentInsurance || 0) + 
                                     (results.deductionDetails?.housingFund || 0);
        monthlySpecialAdditional = (results.deductionDetails?.elderly || 0) + 
                                     (results.deductionDetails?.childrenInfant || 0) + 
                                     (results.deductionDetails?.housing || 0) + 
                                     (results.deductionDetails?.educationDegree || 0);
        monthlyOtherDeduction = ((results.deductionDetails?.otherTotal || 0) - (results.deductionDetails?.charitableDonation || 0)) / workMonths;
    } else {
        // 正向计算结果
        monthlySalary = results.incomeDetails.salary;
        monthlyBasicDeduction = results.deductionDetails.basic;
        monthlyInsuranceDeduction = results.deductionDetails.pensionInsurance + 
                                     results.deductionDetails.medicalInsurance + 
                                     results.deductionDetails.unemploymentInsurance + 
                                     results.deductionDetails.housingFund;
        monthlySpecialAdditional = results.deductionDetails.elderly + 
                                     results.deductionDetails.childrenInfant + 
                                     results.deductionDetails.housing + 
                                     (results.deductionDetails.educationDegree || 0);
        monthlyOtherDeduction = results.deductionDetails.otherTotal / workMonths;
    }
    
    const monthlyData = [];
    let cumulativeTaxableIncome = 0;
    let cumulativeTax = 0;
    
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
                applicableRate = bracket.rate * 100;
                break;
            }
        }
        
        const monthTax = currentCumulativeTax - cumulativeTax;
        cumulativeTax = currentCumulativeTax;
        
        monthlyData.push({
            monthlyIncome,
            monthlyDeduction,
            monthlyTaxableIncome,
            applicableRate: applicableRate.toFixed(0),
            monthTax,
            cumulativeTax
        });
    }
    
    return monthlyData;
}

// 生成税率分布
function generateTaxRateDistribution(taxableIncome) {
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
    
    const distribution = taxBrackets.filter(bracket => bracket.amount > 0);
    
    if (distribution.length === 0) {
        return '<p>无应纳税所得额</p>';
    }
    
    return `
    <table class="info-table">
        <tr>
            <th>税率</th>
            <th>应纳税所得额（元）</th>
            <th>占比</th>
        </tr>
        ${distribution.map(bracket => {
            const percentage = ((bracket.amount / taxableIncome) * 100).toFixed(2);
            return `
            <tr>
                <td>${bracket.rate}%</td>
                <td>${bracket.amount.toFixed(2)}</td>
                <td>${percentage}%</td>
            </tr>
            `;
        }).join('')}
    </table>
    `;
}

// 生成税收优化建议
function generateOptimizationTipsForWord() {
    if (Object.keys(calculationResults).length === 0 && Object.keys(reverseCalculationResults).length === 0) {
        return '<p>暂无优化建议</p>';
    }
    
    const tips = [];
    const isReverseCalculation = Object.keys(reverseCalculationResults).length > 0;
    const results = isReverseCalculation ? reverseCalculationResults : calculationResults;
    
    // 检查专项附加扣除
    if (!isReverseCalculation && results.deductionDetails.specialAdditionalTotal === 0) {
        tips.push('您未填写任何专项附加扣除，建议检查是否有符合条件的扣除项目，如子女教育、赡养老人、住房贷款利息等。');
    }
    
    // 检查个人养老金
    if (!isReverseCalculation && results.deductionDetails.pension === 0) {
        tips.push('您未填写个人养老金扣除，建议考虑缴纳个人养老金，每年最高可扣除12000元。');
    }
    
    // 检查商业健康保险
    if (!isReverseCalculation && results.deductionDetails.insuranceOther === 0) {
        tips.push('您未填写商业健康保险扣除，建议考虑购买符合条件的商业健康保险，每年最高可扣除2400元。');
    }
    
    // 检查年终奖计税方式
    if (!isReverseCalculation && results.incomeDetails && results.incomeDetails.bonus > 0) {
        const bonusTax = results.incomeDetails.bonusTax;
        const bonusInclude = results.incomeDetails.bonusInclude;
        const bonusAmount = results.incomeDetails.bonus;
        
        // 计算另一种计税方式的税额
        let alternativeTax = 0;
        
        if (bonusInclude) {
            // 计算单独计税的税额：全年奖金/12，查月度税率表
            const monthlyBonus = bonusAmount / 12;
            for (const bracket of bonusMonthlyTaxRates) {
                if (monthlyBonus <= bracket.max) {
                    alternativeTax = bonusAmount * bracket.rate - bracket.deduction;
                    break;
                }
            }
        } else {
            // 计算并入综合所得的税额
            const currentTotalTax = results.taxDetails.totalTax;
            const currentBonusTax = bonusTax;
            
            // 计算并入综合所得后的总应纳税额
            const totalIncomeWithBonus = results.incomeDetails.total - results.incomeDetails.bonus + bonusAmount;
            const totalDeduction = results.deductionDetails.total;
            const taxableIncomeWithBonus = Math.max(0, totalIncomeWithBonus - totalDeduction);
            
            let totalTaxWithBonus = 0;
            for (const bracket of comprehensiveTaxRates) {
                if (taxableIncomeWithBonus <= bracket.max) {
                    totalTaxWithBonus = taxableIncomeWithBonus * bracket.rate - bracket.deduction;
                    break;
                }
            }
            
            // 计算并入综合所得后，年终奖部分的税额
            alternativeTax = totalTaxWithBonus - (currentTotalTax - currentBonusTax);
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
    if (!isReverseCalculation && results.deductionDetails.medical > 0 && results.deductionDetails.actualMedical === 0) {
        tips.push('您填写的大病医疗费用未达到扣除标准（超过15000元的部分），建议保留相关凭证，以备后续年度可能的扣除。');
    }
    
    // 检查社保缴费
    if (!isReverseCalculation && results.deductionDetails.pensionInsurance + 
        results.deductionDetails.medicalInsurance + 
        results.deductionDetails.unemploymentInsurance + 
        results.deductionDetails.housingFund === 0) {
        tips.push('您未填写社保缴费信息，建议根据实际情况填写，这部分支出可以在计算个税时扣除。');
    }
    
    // 检查工作月数
    if (results.workMonths < 12) {
        tips.push(`您填写的工作月数为${results.workMonths}个月，系统已根据实际工作月数调整了扣除额计算。`);
    }
    
    // 检查应纳税所得额
    if (results.taxableIncome === 0) {
        tips.push('您的应纳税所得额为0，无需缴纳个人所得税。');
    }
    
    // 检查税率级别
    const taxRate = results.applicableRate * 100;
    if (taxRate > 20) {
        tips.push(`您的适用税率为${taxRate}%，属于较高税率级别，建议合理规划税务，利用各项扣除政策降低税负。`);
    }
    
    if (tips.length === 0) {
        return '<p>您的税务规划较为合理，建议继续保持。</p>';
    }
    
    return tips.map((tip, index) => `
    <div class="tips">
        <h4>优化建议 ${index + 1}</h4>
        <p>${tip}</p>
    </div>
    `).join('');
}

// 生成经营所得Word文档内容
function generateBusinessDocumentContent(title) {
    const results = businessCalculationResults;
    
    // 安全获取值
    const businessIncome = results.incomeDetails?.businessIncome || 0;
    const businessCost = results.incomeDetails?.businessCost || 0;
    const businessExpenses = results.incomeDetails?.businessExpenses || 0;
    const businessTaxes = results.incomeDetails?.businessTaxes || 0;
    const businessLosses = results.incomeDetails?.businessLosses || 0;
    const businessOtherExpenses = results.incomeDetails?.businessOtherExpenses || 0;
    const businessPreviousLosses = results.incomeDetails?.businessPreviousLosses || 0;
    const businessProfit = results.incomeDetails?.businessProfit || 0;
    
    const hasComprehensiveIncome = results.deductionDetails?.hasComprehensiveIncome ?? true;
    const investorDeduction = results.deductionDetails?.investorDeduction || 0;
    
    const specialAdd = results.deductionDetails?.specialAdditionalDeduction || {};
    const specialAdditionalDeduction = typeof specialAdd === 'number' ? specialAdd : (specialAdd.total || 0);
    
    const other = results.deductionDetails?.otherDeduction || {};
    const otherDeduction = typeof other === 'number' ? other : (other.total || 0);
    
    const taxableIncome = results.taxDetails?.taxableIncome || 0;
    const applicableRate = results.taxDetails?.applicableRate || 0;
    const applicableDeduction = results.taxDetails?.applicableDeduction || 0;
    const totalTaxBeforeHalving = results.taxDetails?.totalTaxBeforeHalving || 0;
    const taxReduction = results.taxDetails?.taxReduction || 0;
    const totalTax = results.taxDetails?.totalTax || 0;
    const prepaidTax = results.taxDetails?.prepaidTax || 0;
    const refundTax = results.taxDetails?.refundTax || 0;
    const netIncome = results.taxDetails?.netIncome || 0;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        * {
            font-family: 'SimSun', '宋体', serif;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'SimSun', '宋体', serif;
            margin: 0;
            line-height: 1.5;
            font-size: 14pt;
            color: #000;
        }
        .cover {
            text-align: center;
            margin-bottom: 0px;
            padding: 0 0;
        }
        .cover h1 {
            font-size: 22pt;
            font-weight: bold;
            margin-bottom: 30px;
            color: #000;
        }
        .section {
            margin-bottom: 30px;
            page-break-inside: avoid;
        }
        .section h2 {
            font-size: 16pt;
            font-weight: bold;
            margin-bottom: 15px;
            padding-bottom: 5px;
            color: #000;
        }
        .info-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 12pt;
        }
        .info-table th,
        .info-table td {
            border: 1px solid #000;
            padding: 6px;
            text-align: left;
            font-size: 12pt;
        }
        .info-table th {
            background-color: #f0f0f0;
            font-weight: bold;
        }
        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 2px solid #000;
            text-align: center;
            font-size: 12pt;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="cover">
        <h1>${title}</h1>
        <p>生成日期：${new Date().toLocaleDateString()}</p>
        <p>计算类型：经营所得计税</p>
    </div>
    
    <div class="section">
        <h2>一、经营所得计算</h2>
        <table class="info-table">
            <tr>
                <th>项目</th>
                <th>金额（元）</th>
                <th>说明</th>
            </tr>
            <tr>
                <td>年度经营收入总额</td>
                <td>${safeFormatNumber(businessIncome)}</td>
                <td>包括主营业务收入和其他业务收入</td>
            </tr>
            <tr>
                <td>年度成本</td>
                <td>${safeFormatNumber(businessCost)}</td>
                <td>包括原材料、商品采购等直接成本</td>
            </tr>
            <tr>
                <td>年度费用</td>
                <td>${safeFormatNumber(businessExpenses)}</td>
                <td>包括房租、水电费、办公费等间接费用</td>
            </tr>
            <tr>
                <td>年度税金</td>
                <td>${safeFormatNumber(businessTaxes)}</td>
                <td>包括增值税、城建税、教育费附加等</td>
            </tr>
            <tr>
                <td>年度损失</td>
                <td>${safeFormatNumber(businessLosses)}</td>
                <td>包括资产损失、坏账损失等</td>
            </tr>
            <tr>
                <td>其他支出</td>
                <td>${safeFormatNumber(businessOtherExpenses)}</td>
                <td>其他与经营活动相关的支出</td>
            </tr>
            <tr>
                <td>以前年度亏损弥补</td>
                <td>${safeFormatNumber(businessPreviousLosses)}</td>
                <td>允许弥补的以前年度亏损（不超过5年）</td>
            </tr>
        </table>
    </div>
    
    <div class="section">
        <h2>二、应纳税所得额计算</h2>
        <table class="info-table">
            <tr>
                <th>项目</th>
                <th>金额（元）</th>
                <th>说明</th>
            </tr>
            <tr>
                <td>经营利润</td>
                <td>${safeFormatNumber(businessProfit)}</td>
                <td>= 收入-成本-费用-税金-损失-其他</td>
            </tr>
            <tr>
                <td>减：以前年度亏损</td>
                <td>${safeFormatNumber(businessPreviousLosses)}</td>
                <td>可弥补以前年度亏损</td>
            </tr>
            <tr>
                <td>减：投资者减除费用</td>
                <td>${safeFormatNumber(investorDeduction)}</td>
                <td>${hasComprehensiveIncome ? '有综合所得，不扣' : '无综合所得，扣60000元/年'}</td>
            </tr>
            <tr>
                <td>减：专项附加扣除</td>
                <td>${safeFormatNumber(specialAdditionalDeduction)}</td>
                <td>子女教育、继续教育等7项</td>
            </tr>
            <tr>
                <td>减：其他扣除</td>
                <td>${safeFormatNumber(otherDeduction)}</td>
                <td>个人养老金、商业健康保险等</td>
            </tr>
            <tr>
                <td>年度应纳税所得额</td>
                <td>${safeFormatNumber(taxableIncome)}</td>
                <td>= 利润-亏损-各项扣除</td>
            </tr>
        </table>
    </div>
    
    <div class="section">
        <h2>三、应纳税额计算</h2>
        <table class="info-table">
            <tr>
                <th>项目</th>
                <th>金额（元）</th>
                <th>说明</th>
            </tr>
            <tr>
                <td>适用税率</td>
                <td>${(applicableRate * 100).toFixed(0)}%</td>
                <td>5%-35%超额累进税率</td>
            </tr>
            <tr>
                <td>速算扣除数</td>
                <td>${safeFormatNumber(applicableDeduction)}</td>
                <td>根据应纳税所得额级数确定</td>
            </tr>
            <tr>
                <td>应纳税额（未减半）</td>
                <td>${safeFormatNumber(totalTaxBeforeHalving)}</td>
                <td>= 应纳税所得额×税率-速算扣除数</td>
            </tr>
            <tr>
                <td>减半征收减免税额</td>
                <td>${safeFormatNumber(taxReduction)}</td>
                <td>≤200万元部分减半征收</td>
            </tr>
            <tr>
                <td>年度应纳税额（实际应缴）</td>
                <td>${safeFormatNumber(totalTax)}</td>
                <td>= 应纳税额-减免税额</td>
            </tr>
        </table>
    </div>
    
    <div class="section">
        <h2>四、应退/应补税额计算</h2>
        <table class="info-table">
            <tr>
                <th>项目</th>
                <th>金额（元）</th>
                <th>说明</th>
            </tr>
            <tr>
                <td>全年累计已预缴税额</td>
                <td>${safeFormatNumber(prepaidTax)}</td>
                <td>年度内已预缴的经营所得税额</td>
            </tr>
            <tr>
                <td>年度应退/应补税额</td>
                <td>${safeFormatNumber(refundTax)}</td>
                <td>= 应纳税额-已预缴税额</td>
            </tr>
        </table>
    </div>
    
    <div class="section">
        <h2>五、税后经营所得</h2>
        <table class="info-table">
            <tr>
                <th>项目</th>
                <th>金额（元）</th>
                <th>说明</th>
            </tr>
            <tr>
                <td>税后经营所得</td>
                <td>${safeFormatNumber(netIncome)}</td>
                <td>= 经营利润-实际应纳税额</td>
            </tr>
        </table>
    </div>
    
    <div class="footer">
        <p>声明：本报告仅供参考，实际纳税情况以税务部门核算结果为准。</p>
        <p>版本：2026.04.13</p>
    </div>
</body>
</html>
    `;
}
