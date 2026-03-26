// 全局变量
let calculationResults = {};
let reverseCalculationResults = {};
let businessCalculationResults = {};
let classificationCalculationResults = {};
let classificationItems = [];

// 税率表定义
const comprehensiveTaxRates = [
    { max: 36000, rate: 0.03, deduction: 0 },
    { max: 144000, rate: 0.1, deduction: 2520 },
    { max: 300000, rate: 0.2, deduction: 16920 },
    { max: 420000, rate: 0.25, deduction: 31920 },
    { max: 660000, rate: 0.3, deduction: 52920 },
    { max: 960000, rate: 0.35, deduction: 85920 },
    { max: Infinity, rate: 0.45, deduction: 181920 }
];

const businessTaxRates = [
    { max: 30000, rate: 0.05, deduction: 0 },
    { max: 90000, rate: 0.1, deduction: 1500 },
    { max: 300000, rate: 0.2, deduction: 10500 },
    { max: 500000, rate: 0.3, deduction: 40500 },
    { max: Infinity, rate: 0.35, deduction: 65500 }
];

const classificationTaxRate = 0.2;

// 计算个人所得税
function calculateTax() {
    try {
        // 获取工作月数
        const workMonths = parseInt(document.getElementById('work-months').value) || 12;
        
        // 验证工作月数
        if (workMonths < 1 || workMonths > 12) {
            throw new Error('工作月数必须在1-12之间');
        }
        
        // 获取收入数据
        const monthlySalaryIncome = parseFloat(document.getElementById('salary-income').value) || 0;
        const annualLaborIncome = parseFloat(document.getElementById('labor-income').value) || 0;
        const annualAuthorIncome = parseFloat(document.getElementById('author-income').value) || 0;
        const annualRoyaltyIncome = parseFloat(document.getElementById('royalty-income').value) || 0;
        const bonusIncome = parseFloat(document.getElementById('bonus-income').value) || 0;
        const bonusInclude = document.getElementById('bonus-include').checked;
        
        // 验证收入数据
        if (monthlySalaryIncome < 0 || annualLaborIncome < 0 || annualAuthorIncome < 0 || annualRoyaltyIncome < 0 || bonusIncome < 0) {
            throw new Error('收入数据不能为负数');
        }
        
        // 计算各项收入计入综合所得的金额（年度）
        // 劳务报酬所得：不超过4000元的减除800元，超过4000元的减除20%，但不低于0
        const laborTaxableIncome = Math.max(0, annualLaborIncome <= 4000 ? (annualLaborIncome - 800) : (annualLaborIncome * 0.8));
        // 稿酬所得：不超过4000元的减除800元，超过4000元的减除20%，再减按70%，但不低于0
        const authorTaxableIncome = Math.max(0, annualAuthorIncome <= 4000 ? ((annualAuthorIncome - 800) * 0.7) : (annualAuthorIncome * 0.8 * 0.7));
        // 特许权使用费所得：不超过4000元的减除800元，超过4000元的减除20%，但不低于0
        const royaltyTaxableIncome = Math.max(0, annualRoyaltyIncome <= 4000 ? (annualRoyaltyIncome - 800) : (annualRoyaltyIncome * 0.8));
        
        // 计算劳务报酬所得的预扣税额（根据应纳税所得额的不同档次）
        let laborTax = 0;
        if (laborTaxableIncome <= 20000) {
            laborTax = laborTaxableIncome * 0.2;
        } else if (laborTaxableIncome <= 50000) {
            laborTax = laborTaxableIncome * 0.3 - 2000;
        } else {
            laborTax = laborTaxableIncome * 0.4 - 7000;
        }
        
        // 计算稿酬所得的预扣税额
        const authorTax = authorTaxableIncome * 0.2;
        
        // 计算特许权使用费所得的预扣税额
        const royaltyTax = royaltyTaxableIncome * 0.2;
        
        // 计算计入综合所得的金额（年度）
        const annualLaborIncomeCalculated = laborTaxableIncome;
        const annualAuthorIncomeCalculated = authorTaxableIncome;
        const annualRoyaltyIncomeCalculated = royaltyTaxableIncome;
        
        // 计算年度综合所得收入额合计
        let totalIncome = monthlySalaryIncome * workMonths + annualLaborIncomeCalculated + annualAuthorIncomeCalculated + annualRoyaltyIncomeCalculated;
        if (bonusInclude) {
            totalIncome += bonusIncome;
        }
        
        // 检查各扣除项是否显示
        const isSpecialDeductionVisible = !document.getElementById('special-deduction-content').classList.contains('hidden');
        const isSpecialAdditionalDeductionVisible = !document.getElementById('special-additional-deduction-content').classList.contains('hidden');
        const isOtherDeductionVisible = !document.getElementById('other-deduction-content').classList.contains('hidden');
        
        // 获取扣除项数据（月度）
        const monthlyBasicDeduction = parseFloat(document.getElementById('basic-deduction').value) || 0;
        const monthlyPensionInsurance = isSpecialDeductionVisible ? (parseFloat(document.getElementById('pension-insurance').value) || 0) : 0;
        const monthlyMedicalInsurance = isSpecialDeductionVisible ? (parseFloat(document.getElementById('medical-insurance').value) || 0) : 0;
        const monthlyUnemploymentInsurance = isSpecialDeductionVisible ? (parseFloat(document.getElementById('unemployment-insurance').value) || 0) : 0;
        const monthlyHousingFund = isSpecialDeductionVisible ? (parseFloat(document.getElementById('housing-fund').value) || 0) : 0;
        const monthlyInsuranceDeduction = monthlyPensionInsurance + monthlyMedicalInsurance + monthlyUnemploymentInsurance + monthlyHousingFund;
        const monthlyElderlyDeduction = isSpecialAdditionalDeductionVisible ? (parseFloat(document.getElementById('elderly-deduction').value) || 0) : 0;
        const monthlyChildrenInfantDeduction = isSpecialAdditionalDeductionVisible ? (parseFloat(document.getElementById('children-infant-deduction').value) || 0) : 0;
        
        // 验证扣除项数据
        if (monthlyBasicDeduction < 0 || monthlyPensionInsurance < 0 || monthlyMedicalInsurance < 0 || 
            monthlyUnemploymentInsurance < 0 || monthlyHousingFund < 0 || monthlyElderlyDeduction < 0 || 
            monthlyChildrenInfantDeduction < 0) {
            throw new Error('扣除项数据不能为负数');
        }
        
        // 住房扣除（二选一）
        let monthlyHousingDeduction = 0;
        if (isSpecialAdditionalDeductionVisible) {
            const housingType = document.getElementById('housing-type').value;
            if (housingType === 'rent') {
                monthlyHousingDeduction = parseFloat(document.getElementById('rent-deduction').value) || 0;
            } else if (housingType === 'loan') {
                monthlyHousingDeduction = parseFloat(document.getElementById('housing-loan-deduction').value) || 0;
            }
        }
        
        const annualEducationDeduction = isSpecialAdditionalDeductionVisible ? (parseFloat(document.getElementById('education-deduction').value) || 0) : 0;
        const annualMedicalDeduction = isSpecialAdditionalDeductionVisible ? (parseFloat(document.getElementById('medical-deduction').value) || 0) : 0;
        const monthlyPensionDeduction = isOtherDeductionVisible ? (parseFloat(document.getElementById('pension-deduction').value) || 0) : 0;
        const monthlyEnterpriseAnnuity = isOtherDeductionVisible ? (parseFloat(document.getElementById('enterprise-annuity').value) || 0) : 0;
        const monthlyInsuranceOtherDeduction = isOtherDeductionVisible ? (parseFloat(document.getElementById('insurance-other-deduction').value) || 0) : 0;
        const monthlyTaxDeferredPension = isOtherDeductionVisible ? (parseFloat(document.getElementById('tax-deferred-pension').value) || 0) : 0;
        const annualCharitableDonation = isOtherDeductionVisible ? (parseFloat(document.getElementById('charitable-donation').value) || 0) : 0;
        
        // 检查职业资格扣除
        let annualProfessionalDeduction = 0;
        if (isSpecialAdditionalDeductionVisible && document.getElementById('education-professional-checkbox') && document.getElementById('education-professional-checkbox').checked) {
            annualProfessionalDeduction = 3600; // 职业资格3600元/年
        }
        
        // 验证其他扣除项数据
        if (annualEducationDeduction < 0 || annualMedicalDeduction < 0 || monthlyPensionDeduction < 0 || monthlyInsuranceOtherDeduction < 0) {
            throw new Error('扣除项数据不能为负数');
        }
        
        // 计算年度大病医疗实际可扣除额
        const actualMedicalDeduction = annualMedicalDeduction > 15000 ? Math.min(annualMedicalDeduction - 15000, 80000) : 0;
        
        // 计算月度专项附加扣除合计（包含学历教育，不包含职业资格和大病医疗）
        // 从annualEducationDeduction中减去职业资格的3600元，只保留学历教育的金额
        const educationDegreeDeduction = parseFloat(document.getElementById('education-degree-checkbox').checked ? (400 * workMonths) : 0);
        const monthlySpecialAdditionalTotal = monthlyElderlyDeduction + monthlyChildrenInfantDeduction + monthlyHousingDeduction + (educationDegreeDeduction / workMonths);
        
        // 计算年度专项附加扣除合计 = 月度专项附加扣除合计 * 工作月数 + 职业资格 + 大病医疗
        const annualSpecialAdditionalTotal = monthlySpecialAdditionalTotal * workMonths + annualProfessionalDeduction + actualMedicalDeduction;
        
        // 计算年度其他扣除合计（根据工作月数调整）
        const annualOtherDeductionTotal = (monthlyPensionDeduction + monthlyEnterpriseAnnuity + monthlyInsuranceOtherDeduction + monthlyTaxDeferredPension) * workMonths + annualCharitableDonation;
        
        // 计算年度总扣除额（根据工作月数调整）
        const totalDeduction = monthlyBasicDeduction * workMonths + monthlyInsuranceDeduction * workMonths + annualSpecialAdditionalTotal + annualOtherDeductionTotal;
        
        // 计算应纳税所得额
        const taxableIncome = Math.max(0, totalIncome - totalDeduction);
        
        // 计算应纳税额
        let totalTax = 0;
        let applicableRate = 0;
        let applicableDeduction = 0;
        
        for (const bracket of comprehensiveTaxRates) {
            if (taxableIncome <= bracket.max) {
                totalTax = taxableIncome * bracket.rate - bracket.deduction;
                applicableRate = bracket.rate;
                applicableDeduction = bracket.deduction;
                break;
            }
        }
        
        // 计算年终奖单独计税税额
        let bonusTax = 0;
        if (bonusIncome > 0 && !bonusInclude) {
            const bonusTaxableIncome = bonusIncome;
            for (const bracket of comprehensiveTaxRates) {
                if (bonusTaxableIncome <= bracket.max) {
                    bonusTax = bonusTaxableIncome * bracket.rate - bracket.deduction;
                    break;
                }
            }
        }
        
        // 计算总应纳税额
        const finalTotalTax = totalTax + bonusTax;
        
        // 获取已预缴税额
        const prepaidTax = parseFloat(document.getElementById('prepaid-tax').value) || 0;
        
        // 验证已预缴税额
        if (prepaidTax < 0) {
            throw new Error('已预缴税额不能为负数');
        }
        
        // 计算应退/应补税额
        const refundTax = finalTotalTax - prepaidTax;
        
        // 计算税后收入（考虑已预缴税额）
        const netIncome = totalIncome - (finalTotalTax - prepaidTax);
        
        // 保存计算结果
        calculationResults = {
            workMonths: workMonths,
            incomeDetails: {
                salary: monthlySalaryIncome,
                labor: annualLaborIncome,
                laborCalculated: annualLaborIncomeCalculated,
                laborTax: laborTax,
                author: annualAuthorIncome,
                authorCalculated: annualAuthorIncomeCalculated,
                authorTax: authorTax,
                royalty: annualRoyaltyIncome,
                royaltyCalculated: annualRoyaltyIncomeCalculated,
                royaltyTax: royaltyTax,
                bonus: bonusIncome,
                bonusInclude: bonusInclude,
                bonusTax: bonusTax,
                total: totalIncome
            },
            deductionDetails: {
                basic: monthlyBasicDeduction,
                pensionInsurance: monthlyPensionInsurance,
                medicalInsurance: monthlyMedicalInsurance,
                unemploymentInsurance: monthlyUnemploymentInsurance,
                housingFund: monthlyHousingFund,
                elderly: monthlyElderlyDeduction,
                childrenInfant: monthlyChildrenInfantDeduction,
                housing: monthlyHousingDeduction,
                education: annualEducationDeduction,
                medical: annualMedicalDeduction,
                actualMedical: actualMedicalDeduction,
                pension: monthlyPensionDeduction,
                enterpriseAnnuity: monthlyEnterpriseAnnuity,
                insuranceOther: monthlyInsuranceOtherDeduction,
                taxDeferredPension: monthlyTaxDeferredPension,
                charitableDonation: annualCharitableDonation,
                specialAdditionalTotal: annualSpecialAdditionalTotal,
                otherTotal: annualOtherDeductionTotal,
                total: totalDeduction
            },
            taxDetails: {
                taxableIncome: taxableIncome,
                totalTax: finalTotalTax,
                applicableRate: applicableRate,
                applicableDeduction: applicableDeduction,
                prepaidTax: prepaidTax,
                refundTax: refundTax,
                netIncome: netIncome
            },
            calculationDate: new Date().toISOString()
        };
        
        // 更新结果显示
        document.getElementById('result-total-income').textContent = '¥' + totalIncome.toFixed(2);
        document.getElementById('result-total-deduction').textContent = '¥' + totalDeduction.toFixed(2);
        document.getElementById('result-taxable-income').textContent = '¥' + taxableIncome.toFixed(2);
        document.getElementById('result-tax-rate').textContent = (applicableRate * 100).toFixed(0) + '%';
        document.getElementById('result-deduction-amount').textContent = '¥' + applicableDeduction.toFixed(2);
        document.getElementById('result-total-tax').textContent = '¥' + finalTotalTax.toFixed(2);
        
        // 更新年终奖相关显示
        if (bonusIncome > 0) {
            const bonusDisplay = document.getElementById('bonus-tax-display');
            if (bonusDisplay) {
                bonusDisplay.style.display = 'block';
                // 检查元素是否存在
                const bonusTaxAmountElement = document.getElementById('bonus-tax-amount');
                const bonusMethodElement = document.getElementById('bonus-method');
                if (bonusTaxAmountElement) {
                    bonusTaxAmountElement.textContent = '¥' + bonusTax.toFixed(2);
                }
                if (bonusMethodElement) {
                    bonusMethodElement.textContent = bonusInclude ? '并入综合所得计税' : '单独计税';
                }
            }
        } else {
            const bonusDisplay = document.getElementById('bonus-tax-display');
            if (bonusDisplay) {
                bonusDisplay.style.display = 'none';
            }
        }
        // 检查元素是否存在
        const resultPrepaidTaxElement = document.getElementById('result-prepaid-tax');
        if (resultPrepaidTaxElement) {
            resultPrepaidTaxElement.textContent = '¥' + prepaidTax.toFixed(2);
        }
        
        const refundTaxElement = document.getElementById('result-refund-tax');
        if (refundTaxElement) {
            refundTaxElement.textContent = (refundTax >= 0 ? '应补 ¥' : '应退 ¥') + Math.abs(refundTax).toFixed(2);
            refundTaxElement.className = refundTax >= 0 ? 'font-medium text-lg text-danger' : 'font-medium text-lg text-success';
        }
        
        const resultNetIncomeElement = document.getElementById('result-net-income');
        if (resultNetIncomeElement) {
            resultNetIncomeElement.textContent = '¥' + netIncome.toFixed(2);
        }
    } catch (error) {
        console.error('计算过程中出现错误:', error);
        alert('计算过程中出现错误：' + error.message);
    }
}

// 计算反向个人所得税
function calculateReverseTax() {
    try {
        // 获取所得类型
        const incomeType = document.getElementById('reverse-income-type').value;
        
        // 获取税额数据
        const totalTax = parseFloat(document.getElementById('reverse-total-tax').value) || 0;
        
        // 验证税额必须是非负数
        if (totalTax < 0) {
            alert('税额不能为负数');
            return;
        }
        
        // 获取年工作总月数
        const workMonths = parseInt(document.getElementById('reverse-work-months').value) || 12;
        
        // 验证工作月数必须在合理范围内
        if (workMonths < 1 || workMonths > 12) {
            alert('工作月数必须在1-12之间');
            return;
        }
        
        // 获取年终奖数据
        const bonusIncome = parseFloat(document.getElementById('reverse-bonus-income').value) || 0;
        const bonusInclude = document.getElementById('reverse-bonus-include').checked;
        
        // 获取税率选择
        const taxRateChoice = document.getElementById('reverse-tax-rate').value;
        
        // 获取扣除项数据（年度）
        const annualBasicDeduction = parseFloat(document.getElementById('reverse-basic-deduction').value) || 0;
        
        // 检查各扣除项是否显示
        const isSpecialDeductionVisible = document.getElementById('reverse-special-deduction-checkbox').checked;
        const isSpecialAdditionalDeductionVisible = document.getElementById('reverse-special-additional-deduction-checkbox').checked;
        const isOtherDeductionVisible = document.getElementById('reverse-other-deduction-checkbox').checked;
        
        // 计算专项扣除
        let annualSpecialDeduction = 0;
        if (isSpecialDeductionVisible) {
            const annualPensionInsurance = parseFloat(document.getElementById('reverse-pension-insurance').value) || 0;
            const annualMedicalInsurance = parseFloat(document.getElementById('reverse-medical-insurance').value) || 0;
            const annualUnemploymentInsurance = parseFloat(document.getElementById('reverse-unemployment-insurance').value) || 0;
            const annualHousingFund = parseFloat(document.getElementById('reverse-housing-fund').value) || 0;
            annualSpecialDeduction = annualPensionInsurance + annualMedicalInsurance + annualUnemploymentInsurance + annualHousingFund;
        }
        
        // 计算专项附加扣除
        let annualSpecialAdditionalDeduction = 0;
        let actualMedicalDeduction = 0;
        if (isSpecialAdditionalDeductionVisible) {
            const annualChildrenInfantDeduction = parseFloat(document.getElementById('reverse-children-infant-deduction').value) || 0;
            const annualElderlyDeduction = parseFloat(document.getElementById('reverse-elderly-deduction').value) || 0;
            
            // 住房扣除（二选一）
            let annualHousingDeduction = 0;
            const housingType = document.getElementById('reverse-housing-type').value;
            if (housingType === 'rent') {
                annualHousingDeduction = parseFloat(document.getElementById('reverse-rent-deduction').value) || 0;
            } else if (housingType === 'loan') {
                annualHousingDeduction = parseFloat(document.getElementById('reverse-housing-loan-deduction').value) || 0;
            }
            
            const annualEducationDeduction = parseFloat(document.getElementById('reverse-education-deduction').value) || 0;
            
            // 计算大病医疗实际可扣除额
            const medicalDeduction = parseFloat(document.getElementById('reverse-medical-deduction').value) || 0;
            actualMedicalDeduction = medicalDeduction > 15000 ? Math.min(medicalDeduction - 15000, 80000) : 0;
            
            // 不包含大病医疗的专项附加扣除
            annualSpecialAdditionalDeduction = annualChildrenInfantDeduction + annualElderlyDeduction + annualHousingDeduction + annualEducationDeduction;
        }
        
        // 计算其他扣除
        let annualOtherDeduction = 0;
        // 无论复选框是否勾选，都计算其他扣除，因为用户可能已经输入了金额
        const annualPensionDeduction = parseFloat(document.getElementById('reverse-pension-deduction').value) || 0;
        const annualInsuranceOtherDeduction = parseFloat(document.getElementById('reverse-insurance-other-deduction').value) || 0;
        annualOtherDeduction = annualPensionDeduction + annualInsuranceOtherDeduction;
        
        // 根据工作月数调整扣除额
        const basicDeduction = (annualBasicDeduction / 12) * workMonths;
        const specialDeduction = (annualSpecialDeduction / 12) * workMonths;
        // 不包含大病医疗的专项附加扣除按工作月数调整
        const specialAdditionalDeduction = (annualSpecialAdditionalDeduction / 12) * workMonths + actualMedicalDeduction;
        const otherDeduction = (annualOtherDeduction / 12) * workMonths;
        
        // 计算总扣除额
        const totalDeduction = basicDeduction + specialDeduction + specialAdditionalDeduction + otherDeduction;
        
        // 计算年终奖税额
        let bonusTax = 0;
        if (bonusIncome > 0 && !bonusInclude) {
            // 年终奖单独计税
            if (bonusIncome <= 36000) {
                bonusTax = bonusIncome * 0.03;
            } else if (bonusIncome <= 144000) {
                bonusTax = bonusIncome * 0.1 - 2520;
            } else if (bonusIncome <= 300000) {
                bonusTax = bonusIncome * 0.2 - 16920;
            } else if (bonusIncome <= 420000) {
                bonusTax = bonusIncome * 0.25 - 31920;
            } else if (bonusIncome <= 660000) {
                bonusTax = bonusIncome * 0.3 - 52920;
            } else if (bonusIncome <= 960000) {
                bonusTax = bonusIncome * 0.35 - 85920;
            } else {
                bonusTax = bonusIncome * 0.45 - 181920;
            }
        }
        
        // 调整综合所得税额
        const comprehensiveTax = totalTax - bonusTax;
        
        // 根据税额计算应纳税所得额和税率
        let taxableIncome = 0;
        let applicableRate = 0;
        let applicableDeduction = 0;
        
        if (incomeType === 'comprehensive') {
            // 综合所得反向倒算
            if (taxRateChoice === 'auto') {
                // 自动判断税率级别
                if (comprehensiveTax <= 1080) { // 36000 * 0.03
                    taxableIncome = comprehensiveTax / 0.03;
                    applicableRate = 0.03;
                    applicableDeduction = 0;
                } else if (comprehensiveTax <= 14100) { // 144000 * 0.1 - 2520
                    taxableIncome = (comprehensiveTax + 2520) / 0.1;
                    applicableRate = 0.1;
                    applicableDeduction = 2520;
                } else if (comprehensiveTax <= 30180) { // 300000 * 0.2 - 16920
                    taxableIncome = (comprehensiveTax + 16920) / 0.2;
                    applicableRate = 0.2;
                    applicableDeduction = 16920;
                } else if (comprehensiveTax <= 55080) { // 420000 * 0.25 - 31920
                    taxableIncome = (comprehensiveTax + 31920) / 0.25;
                    applicableRate = 0.25;
                    applicableDeduction = 31920;
                } else if (comprehensiveTax <= 96080) { // 660000 * 0.3 - 52920
                    taxableIncome = (comprehensiveTax + 52920) / 0.3;
                    applicableRate = 0.3;
                    applicableDeduction = 52920;
                } else if (comprehensiveTax <= 142880) { // 960000 * 0.35 - 85920
                    taxableIncome = (comprehensiveTax + 85920) / 0.35;
                    applicableRate = 0.35;
                    applicableDeduction = 85920;
                } else { // ＞960000元
                    taxableIncome = (comprehensiveTax + 181920) / 0.45;
                    applicableRate = 0.45;
                    applicableDeduction = 181920;
                }
            } else {
                // 根据选择的税率计算
                const rate = parseFloat(taxRateChoice) / 100;
                let deduction = 0;
                
                switch (taxRateChoice) {
                    case '3':
                        deduction = 0;
                        break;
                    case '10':
                        deduction = 2520;
                        break;
                    case '20':
                        deduction = 16920;
                        break;
                    case '25':
                        deduction = 31920;
                        break;
                    case '30':
                        deduction = 52920;
                        break;
                    case '35':
                        deduction = 85920;
                        break;
                    case '45':
                        deduction = 181920;
                        break;
                }
                
                taxableIncome = (comprehensiveTax + deduction) / rate;
                applicableRate = rate;
                applicableDeduction = deduction;
            }
        } else if (incomeType === 'business') {
            // 经营所得反向倒算
            // 根据经营所得税率表倒算
            if (totalTax <= 1500) { // 30000 * 0.05
                taxableIncome = totalTax / 0.05;
                applicableRate = 0.05;
                applicableDeduction = 0;
            } else if (totalTax <= 7500) { // 90000 * 0.1 - 1500
                taxableIncome = (totalTax + 1500) / 0.1;
                applicableRate = 0.1;
                applicableDeduction = 1500;
            } else if (totalTax <= 40500) { // 300000 * 0.2 - 10500
                taxableIncome = (totalTax + 10500) / 0.2;
                applicableRate = 0.2;
                applicableDeduction = 10500;
            } else if (totalTax <= 90500) { // 500000 * 0.3 - 40500
                taxableIncome = (totalTax + 40500) / 0.3;
                applicableRate = 0.3;
                applicableDeduction = 40500;
            } else { // ＞500000元
                taxableIncome = (totalTax + 65500) / 0.35;
                applicableRate = 0.35;
                applicableDeduction = 65500;
            }
        } else {
            // 默认使用综合所得税率表
            if (comprehensiveTax <= 1080) { // 36000 * 0.03
                taxableIncome = comprehensiveTax / 0.03;
                applicableRate = 0.03;
                applicableDeduction = 0;
            } else if (comprehensiveTax <= 14100) { // 144000 * 0.1 - 2520
                taxableIncome = (comprehensiveTax + 2520) / 0.1;
                applicableRate = 0.1;
                applicableDeduction = 2520;
            } else if (comprehensiveTax <= 30180) { // 300000 * 0.2 - 16920
                taxableIncome = (comprehensiveTax + 16920) / 0.2;
                applicableRate = 0.2;
                applicableDeduction = 16920;
            } else if (comprehensiveTax <= 55080) { // 420000 * 0.25 - 31920
                taxableIncome = (comprehensiveTax + 31920) / 0.25;
                applicableRate = 0.25;
                applicableDeduction = 31920;
            } else if (comprehensiveTax <= 96080) { // 660000 * 0.3 - 52920
                taxableIncome = (comprehensiveTax + 52920) / 0.3;
                applicableRate = 0.3;
                applicableDeduction = 52920;
            } else if (comprehensiveTax <= 142880) { // 960000 * 0.35 - 85920
                taxableIncome = (comprehensiveTax + 85920) / 0.35;
                applicableRate = 0.35;
                applicableDeduction = 85920;
            } else { // ＞960000元
                taxableIncome = (comprehensiveTax + 181920) / 0.45;
                applicableRate = 0.45;
                applicableDeduction = 181920;
            }
        }
        
        // 计算税前收入
        const totalIncome = taxableIncome + totalDeduction;
        
        // 保存计算结果
        reverseCalculationResults = {
            incomeType: incomeType,
            workMonths: workMonths,
            totalTax: totalTax,
            totalDeduction: totalDeduction,
            taxableIncome: taxableIncome,
            applicableRate: applicableRate,
            applicableDeduction: applicableDeduction,
            totalIncome: totalIncome,
            deductionDetails: {
                actualMedical: actualMedicalDeduction
            },
            calculationDate: new Date().toISOString()
        };
        
        // 更新结果显示
        document.getElementById('reverse-result-total-tax').textContent = '¥' + totalTax.toFixed(2);
        document.getElementById('reverse-result-bonus').textContent = '¥' + bonusIncome.toFixed(2);
        document.getElementById('reverse-result-bonus-tax').textContent = '¥' + bonusTax.toFixed(2);
        document.getElementById('reverse-result-taxable-income').textContent = '¥' + taxableIncome.toFixed(2);
        document.getElementById('reverse-result-total-deduction').textContent = '¥' + totalDeduction.toFixed(2);
        document.getElementById('reverse-result-total-income').textContent = '¥' + totalIncome.toFixed(2);
        document.getElementById('reverse-result-tax-rate').textContent = (applicableRate * 100).toFixed(0) + '%';
        document.getElementById('reverse-result-deduction').textContent = '¥' + applicableDeduction.toFixed(2);
        
        // 更新税率级数显示
        let taxLevel = '';
        if (incomeType === 'comprehensive') {
            if (taxableIncome <= 36000) {
                taxLevel = '级数1';
            } else if (taxableIncome <= 144000) {
                taxLevel = '级数2';
            } else if (taxableIncome <= 300000) {
                taxLevel = '级数3';
            } else if (taxableIncome <= 420000) {
                taxLevel = '级数4';
            } else if (taxableIncome <= 660000) {
                taxLevel = '级数5';
            } else if (taxableIncome <= 960000) {
                taxLevel = '级数6';
            } else {
                taxLevel = '级数7';
            }
        } else if (incomeType === 'business') {
            if (taxableIncome <= 30000) {
                taxLevel = '级数1';
            } else if (taxableIncome <= 90000) {
                taxLevel = '级数2';
            } else if (taxableIncome <= 300000) {
                taxLevel = '级数3';
            } else if (taxableIncome <= 500000) {
                taxLevel = '级数4';
            } else {
                taxLevel = '级数5';
            }
        }
        document.getElementById('reverse-result-tax-level').textContent = taxLevel;
    } catch (error) {
        console.error('反向倒算计算过程中出现错误:', error);
        alert('计算过程中出现错误，请检查输入数据后重试。错误信息：' + error.message);
    }
}

// 计算经营所得税
function calculateBusinessTax() {
    try {
        // 获取经营收入和成本数据
        const businessIncome = parseFloat(document.getElementById('business-income').value) || 0;
        const businessCost = parseFloat(document.getElementById('business-cost').value) || 0;
        const businessExpenses = parseFloat(document.getElementById('business-expenses').value) || 0;
        const businessTaxes = parseFloat(document.getElementById('business-taxes').value) || 0;
        const businessLosses = parseFloat(document.getElementById('business-losses').value) || 0;
        const businessOtherExpenses = parseFloat(document.getElementById('business-other-expenses').value) || 0;
        const businessPreviousLosses = parseFloat(document.getElementById('business-previous-losses').value) || 0;
        
        // 计算经营利润
        const businessProfit = businessIncome - businessCost - businessExpenses - businessTaxes - businessLosses - businessOtherExpenses;
        
        // 计算应纳税所得额（考虑以前年度亏损弥补）
        const taxableIncome = Math.max(0, businessProfit - businessPreviousLosses);
        
        // 获取扣除项数据
        const investorDeduction = parseFloat(document.getElementById('business-investor-deduction').value) || 0;
        const otherDeduction = parseFloat(document.getElementById('business-other-deduction').value) || 0;
        
        // 计算最终应纳税所得额
        const finalTaxableIncome = Math.max(0, taxableIncome - investorDeduction - otherDeduction);
        
        // 计算应纳税额
        let totalTax = 0;
        let applicableRate = 0;
        let applicableDeduction = 0;
        
        for (const bracket of businessTaxRates) {
            if (finalTaxableIncome <= bracket.max) {
                totalTax = finalTaxableIncome * bracket.rate - bracket.deduction;
                applicableRate = bracket.rate;
                applicableDeduction = bracket.deduction;
                break;
            }
        }
        
        // 获取已预缴税额
        const prepaidTax = parseFloat(document.getElementById('business-prepaid-tax').value) || 0;
        
        // 计算应退/应补税额
        const refundTax = totalTax - prepaidTax;
        
        // 计算税后经营所得
        const netIncome = businessProfit - totalTax;
        
        // 保存计算结果
        businessCalculationResults = {
            incomeDetails: {
                businessIncome: businessIncome,
                businessCost: businessCost,
                businessExpenses: businessExpenses,
                businessTaxes: businessTaxes,
                businessLosses: businessLosses,
                businessOtherExpenses: businessOtherExpenses,
                businessPreviousLosses: businessPreviousLosses,
                businessProfit: businessProfit
            },
            deductionDetails: {
                investorDeduction: investorDeduction,
                otherDeduction: otherDeduction
            },
            taxDetails: {
                taxableIncome: finalTaxableIncome,
                totalTax: totalTax,
                applicableRate: applicableRate,
                applicableDeduction: applicableDeduction,
                prepaidTax: prepaidTax,
                refundTax: refundTax,
                netIncome: netIncome
            },
            calculationDate: new Date().toISOString()
        };
        
        // 更新结果显示
        document.getElementById('business-result-income').textContent = '¥' + businessIncome.toFixed(2);
        document.getElementById('business-result-costs').textContent = '¥' + (businessCost + businessExpenses + businessTaxes + businessLosses + businessOtherExpenses).toFixed(2);
        document.getElementById('business-result-profit').textContent = '¥' + businessProfit.toFixed(2);
        document.getElementById('business-result-taxable-income').textContent = '¥' + finalTaxableIncome.toFixed(2);
        document.getElementById('business-result-tax-rate').textContent = (applicableRate * 100).toFixed(0) + '%';
        document.getElementById('business-result-deduction').textContent = '¥' + applicableDeduction.toFixed(2);
        document.getElementById('business-result-total-tax').textContent = '¥' + totalTax.toFixed(2);
        document.getElementById('business-result-prepaid-tax').textContent = '¥' + prepaidTax.toFixed(2);
        document.getElementById('business-result-refund-tax').textContent = (refundTax >= 0 ? '应补 ¥' : '应退 ¥') + Math.abs(refundTax).toFixed(2);
        document.getElementById('business-result-net-income').textContent = '¥' + netIncome.toFixed(2);
    } catch (error) {
        console.error('经营所得税计算过程中出现错误:', error);
        alert('计算过程中出现错误，请检查输入数据后重试。错误信息：' + error.message);
    }
}

// 计算分类所得税
function calculateClassificationTax() {
    try {
        // 计算所有条目的总税额
        let totalIncome = 0;
        let totalTaxableIncome = 0;
        let totalTax = 0;
        
        // 保存所有条目的详细信息
        const itemsDetails = [];
        
        for (const item of classificationItems) {
            totalIncome += item.income;
            totalTaxableIncome += item.taxableIncome;
            totalTax += item.totalTax;
            itemsDetails.push(item);
        }
        
        // 保存计算结果
        classificationCalculationResults = {
            items: itemsDetails,
            totalIncome: totalIncome,
            totalTaxableIncome: totalTaxableIncome,
            totalTax: totalTax,
            calculationDate: new Date().toISOString()
        };
        
        // 更新结果显示
        document.getElementById('classification-result-type').textContent = '汇总计算';
        document.getElementById('classification-result-income').textContent = '¥' + totalIncome.toFixed(2);
        document.getElementById('classification-result-taxable-income').textContent = '¥' + totalTaxableIncome.toFixed(2);
        document.getElementById('classification-result-total-tax').textContent = '¥' + totalTax.toFixed(2);
        
        // 更新扣除项目显示
        const deductionDisplay = document.getElementById('classification-result-deductions');
        if (deductionDisplay) {
            // 计算总扣除额
            let totalDeduction = 0;
            for (const item of classificationItems) {
                if (item.type === 'rent' || item.type === 'transfer') {
                    totalDeduction += (item.income - item.taxableIncome);
                }
            }
            
            if (totalDeduction > 0) {
                deductionDisplay.classList.remove('hidden');
                deductionDisplay.querySelector('span:last-child').textContent = '¥' + totalDeduction.toFixed(2);
            } else {
                deductionDisplay.classList.add('hidden');
            }
        }
        
        // 更新分类所得计税表
        console.log('调用updateClassificationBudgetTable函数');
        updateClassificationBudgetTable();
    } catch (error) {
        console.error('分类所得税计算过程中出现错误:', error);
        alert('计算过程中出现错误，请检查输入数据后重试。错误信息：' + error.message);
    }
}

// 添加分类所得条目
function addClassificationItem() {
    try {
        // 获取所得类型
        const classificationType = document.getElementById('classification-type').value;
        
        // 获取收入数据
        const classificationIncome = parseFloat(document.getElementById('classification-income').value) || 0;
        
        // 计算应纳税所得额
        let taxableIncome = 0;
        let deductionAmount = 0;
        
        switch (classificationType) {
            case 'interest':
                // 利息、股息、红利所得：全额计税
                taxableIncome = classificationIncome;
                break;
            case 'rent':
                // 财产租赁所得：扣除相关费用
                const rentDeductions = parseFloat(document.getElementById('rent-deductions').value) || 0;
                const rentRepair = parseFloat(document.getElementById('rent-repair').value) || 0;
                deductionAmount = rentDeductions + rentRepair;
                taxableIncome = classificationIncome - deductionAmount;
                break;
            case 'transfer':
                // 财产转让所得：扣除原值和合理费用
                const transferOriginal = parseFloat(document.getElementById('transfer-original').value) || 0;
                const transferExpenses = parseFloat(document.getElementById('transfer-expenses').value) || 0;
                deductionAmount = transferOriginal + transferExpenses;
                taxableIncome = classificationIncome - deductionAmount;
                break;
            case 'accidental':
                // 偶然所得：全额计税
                taxableIncome = classificationIncome;
                break;
            default:
                taxableIncome = classificationIncome;
        }
        
        // 确保应纳税所得额不为负数
        taxableIncome = Math.max(0, taxableIncome);
        
        // 计算应纳税额
        const totalTax = taxableIncome * classificationTaxRate;
        
        // 创建条目对象
        const item = {
            id: Date.now(),
            type: classificationType,
            typeName: getClassificationTypeName(classificationType),
            income: classificationIncome,
            deduction: deductionAmount,
            taxableIncome: taxableIncome,
            totalTax: totalTax
        };
        
        // 添加到条目数组
        classificationItems.push(item);
        console.log('添加分类所得条目:', item);
        console.log('当前分类所得条目数量:', classificationItems.length);
        
        // 更新条目列表显示
        updateClassificationItemsList();
        
        // 重置表单
        resetClassificationForm();
    } catch (error) {
        console.error('添加分类所得条目过程中出现错误:', error);
        alert('添加条目过程中出现错误，请检查输入数据后重试。错误信息：' + error.message);
    }
}

// 更新分类所得条目列表
function updateClassificationItemsList() {
    const itemsList = document.getElementById('classification-items-list');
    if (!itemsList) return;
    
    // 清空列表
    itemsList.innerHTML = '';
    
    // 添加每个条目
    classificationItems.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';
        itemElement.innerHTML = `
            <div>
                <div class="font-medium">${item.typeName}</div>
                <div class="text-sm text-gray-600">收入：¥${item.income.toFixed(2)} | 税额：¥${item.totalTax.toFixed(2)}</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="removeClassificationItem(${item.id})">
                <i class="fa fa-trash"></i>
            </button>
        `;
        itemsList.appendChild(itemElement);
    });
}

// 删除分类所得条目
function removeClassificationItem(id) {
    classificationItems = classificationItems.filter(item => item.id !== id);
    updateClassificationItemsList();
}

// 重置分类所得表单
function resetClassificationForm() {
    document.getElementById('classification-income').value = 0;
    document.getElementById('rent-deductions').value = 0;
    document.getElementById('rent-repair').value = 0;
    document.getElementById('transfer-original').value = 0;
    document.getElementById('transfer-expenses').value = 0;
}

// 更新分类所得计税表
function updateClassificationBudgetTable() {
    console.log('更新分类所得计税表');
    
    // 检查分类所得条目
    console.log('分类所得条目:', classificationItems);
    console.log('分类所得条目数量:', classificationItems.length);
    
    // 获取表格元素
    const tableBody = document.getElementById('classification-budget-table-body');
    console.log('表格体元素:', tableBody);
    
    if (!tableBody) {
        console.error('表格体元素不存在');
        return;
    }
    
    // 清空表格
    tableBody.innerHTML = '';
    console.log('表格已清空');
    
    // 直接设置表格HTML内容
    let tableHTML = '';
    
    // 添加每个条目
    classificationItems.forEach((item, index) => {
        console.log('处理条目:', item);
        
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
        if (index < classificationItems.length - 1) {
            tableHTML += '<tr>';
            tableHTML += '<td colspan="3"><hr></td>';
            tableHTML += '</tr>';
        }
    });
    
    // 添加合计行
    if (classificationItems.length > 0) {
        console.log('添加合计行');
        const totalIncome = classificationItems.reduce((sum, item) => sum + item.income, 0);
        const totalDeduction = classificationItems.reduce((sum, item) => sum + item.deduction, 0);
        const totalTaxableIncome = classificationItems.reduce((sum, item) => sum + item.taxableIncome, 0);
        const totalTax = classificationItems.reduce((sum, item) => sum + item.totalTax, 0);
        
        // 总收入行
        tableHTML += '<tr>';
        tableHTML += '<td>总收入</td>';
        tableHTML += '<td>¥' + totalIncome.toFixed(2) + '</td>';
        tableHTML += '<td>所有分类所得的收入合计</td>';
        tableHTML += '</tr>';
        
        // 总扣除行（如果有）
        if (totalDeduction > 0) {
            tableHTML += '<tr>';
            tableHTML += '<td>总扣除</td>';
            tableHTML += '<td>¥' + totalDeduction.toFixed(2) + '</td>';
            tableHTML += '<td>所有分类所得的扣除合计</td>';
            tableHTML += '</tr>';
        }
        
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
    
    console.log('生成的表格HTML:', tableHTML);
    
    // 设置表格内容
    tableBody.innerHTML = tableHTML;
    console.log('表格内容已设置');
    
    // 更新生成日期
    const dateElement = document.getElementById('classification-budget-table-date');
    console.log('日期元素:', dateElement);
    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString();
        console.log('更新生成日期');
    }
    
    console.log('分类所得计税表更新完成');
}

// 获取分类所得类型名称
function getClassificationTypeName(type) {
    switch (type) {
        case 'interest':
            return '利息、股息、红利所得';
        case 'rent':
            return '财产租赁所得';
        case 'transfer':
            return '财产转让所得';
        case 'accidental':
            return '偶然所得';
        default:
            return '其他所得';
    }
}