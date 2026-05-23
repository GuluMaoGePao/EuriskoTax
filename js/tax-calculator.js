let calculationResults = {};
let reverseCalculationResults = {};
let businessCalculationResults = {};
let classificationCalculationResults = {};

// 综合所得税率表
const comprehensiveTaxRates = [
    { min: 0, max: 36000, rate: 0.03, deduction: 0 },
    { min: 36000, max: 144000, rate: 0.10, deduction: 2520 },
    { min: 144000, max: 300000, rate: 0.20, deduction: 16920 },
    { min: 300000, max: 420000, rate: 0.25, deduction: 31920 },
    { min: 420000, max: 660000, rate: 0.30, deduction: 52920 },
    { min: 660000, max: 960000, rate: 0.35, deduction: 85920 },
    { min: 960000, max: Infinity, rate: 0.45, deduction: 181920 }
];

// 月度税率表（用于年终奖单独计税）
const bonusMonthlyTaxRates = [
    { max: 3000, rate: 0.03, deduction: 0 },
    { max: 12000, rate: 0.10, deduction: 210 },
    { max: 25000, rate: 0.20, deduction: 1410 },
    { max: 35000, rate: 0.25, deduction: 2660 },
    { max: 55000, rate: 0.30, deduction: 4410 },
    { max: 80000, rate: 0.35, deduction: 7160 },
    { max: Infinity, rate: 0.45, deduction: 15160 }
];

// 经营所得税率表
const businessTaxRates = [
    { max: 30000, rate: 0.05, deduction: 0 },
    { max: 90000, rate: 0.10, deduction: 1500 },
    { max: 300000, rate: 0.20, deduction: 10500 },
    { max: 500000, rate: 0.30, deduction: 40500 },
    { max: Infinity, rate: 0.35, deduction: 65500 }
];

// 分类所得税率表（比例税率20%）
const classificationTaxRates = {
    interest: { rate: 0.20, name: '利息、股息、红利所得' },
    rent: { rate: 0.20, name: '财产租赁所得' },
    transfer: { rate: 0.20, name: '财产转让所得' },
    accidental: { rate: 0.20, name: '偶然所得' }
};

// 安全设置元素文本内容
function safeSetTextContent(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// 安全设置元素class
function safeSetClass(id, className) {
    const element = document.getElementById(id);
    if (element) {
        element.className = className;
    }
}

// 计算劳务报酬、稿酬、特许权使用费所得
function calculateOtherIncome(annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome) {
    // 计算劳务报酬所得
    const laborTaxableIncome = annualLaborIncome <= 4000 
        ? Math.max(0, annualLaborIncome - 800) 
        : Math.max(0, annualLaborIncome * 0.8);
    let laborTax = 0;
    if (laborTaxableIncome <= 20000) {
        laborTax = laborTaxableIncome * 0.2;
    } else if (laborTaxableIncome <= 50000) {
        laborTax = laborTaxableIncome * 0.3 - 2000;
    } else {
        laborTax = laborTaxableIncome * 0.4 - 7000;
    }

    // 计算稿酬所得
    const authorTaxableIncome = annualAuthorIncome <= 4000 
        ? Math.max(0, (annualAuthorIncome - 800) * 0.7) 
        : Math.max(0, annualAuthorIncome * 0.8 * 0.7);
    const authorTax = authorTaxableIncome * 0.2;

    // 计算特许权使用费所得
    const royaltyTaxableIncome = annualRoyaltyIncome <= 4000 
        ? Math.max(0, annualRoyaltyIncome - 800) 
        : Math.max(0, annualRoyaltyIncome * 0.8);
    const royaltyTax = royaltyTaxableIncome * 0.2;

    return {
        laborTaxableIncome,
        laborTax,
        authorTaxableIncome,
        authorTax,
        royaltyTaxableIncome,
        royaltyTax
    };
}

// 计算综合所得扣除项
function calculateComprehensiveDeductions(workMonths) {
    const monthlyBasicDeduction = parseFloat(document.getElementById('basic-deduction').value) || 5000;
    const monthlyPensionInsurance = parseFloat(document.getElementById('pension-insurance').value) || 0;
    const monthlyMedicalInsurance = parseFloat(document.getElementById('medical-insurance').value) || 0;
    const monthlyUnemploymentInsurance = parseFloat(document.getElementById('unemployment-insurance').value) || 0;
    const monthlyHousingFund = parseFloat(document.getElementById('housing-fund').value) || 0;
    const monthlyElderlyDeduction = parseFloat(document.getElementById('elderly-deduction').value) || 0;
    const monthlyChildrenInfantDeduction = parseFloat(document.getElementById('children-infant-deduction').value) || 0;

    const housingType = document.getElementById('housing-type').value;
    let monthlyHousingDeduction = 0;
    if (housingType === 'rent') {
        monthlyHousingDeduction = parseFloat(document.getElementById('rent-deduction').value) || 0;
    } else if (housingType === 'loan') {
        monthlyHousingDeduction = parseFloat(document.getElementById('housing-loan-deduction').value) || 0;
    }

    const annualEducationDeduction = parseFloat(document.getElementById('education-deduction').value) || 0;
    const annualMedicalDeduction = parseFloat(document.getElementById('medical-deduction').value) || 0;
    const annualProfessionalDeduction = document.getElementById('education-professional-checkbox')?.checked ? 3600 : 0;

    const monthlyPensionDeduction = parseFloat(document.getElementById('pension-deduction').value) || 0;
    const monthlyEnterpriseAnnuity = parseFloat(document.getElementById('enterprise-annuity').value) || 0;
    const monthlyInsuranceOtherDeduction = parseFloat(document.getElementById('insurance-other-deduction').value) || 0;
    const monthlyTaxDeferredPension = parseFloat(document.getElementById('tax-deferred-pension').value) || 0;
    const annualCharitableDonation = parseFloat(document.getElementById('charitable-donation').value) || 0;

    // 计算年度大病医疗实际可扣除额
    const actualMedicalDeduction = annualMedicalDeduction > 15000 
        ? Math.min(annualMedicalDeduction - 15000, 80000) 
        : 0;

    // 计算学历教育扣除
    const educationDegreeAmount = annualEducationDeduction - annualProfessionalDeduction;

    // 计算月度专项附加扣除
    const monthlyEducationDeduction = educationDegreeAmount / workMonths;
    const monthlySpecialAdditionalTotal = monthlyElderlyDeduction + 
        monthlyChildrenInfantDeduction + monthlyHousingDeduction + monthlyEducationDeduction;

    // 计算年度专项附加扣除合计
    const annualSpecialAdditionalTotal = monthlySpecialAdditionalTotal * workMonths + 
        annualProfessionalDeduction + actualMedicalDeduction;

    // 计算年度其他扣除
    const annualOtherDeductionTotal = (monthlyPensionDeduction + monthlyEnterpriseAnnuity + 
        monthlyInsuranceOtherDeduction + monthlyTaxDeferredPension) * workMonths + 
        annualCharitableDonation;

    // 计算年度专项扣除
    const monthlyInsuranceDeduction = monthlyPensionInsurance + monthlyMedicalInsurance + 
        monthlyUnemploymentInsurance + monthlyHousingFund;
    const annualSpecialDeductionTotal = monthlyInsuranceDeduction * workMonths;

    // 计算年度总扣除额
    const totalDeduction = monthlyBasicDeduction * workMonths + 
        annualSpecialDeductionTotal + annualSpecialAdditionalTotal + 
        annualOtherDeductionTotal;

    return {
        monthlyBasicDeduction,
        monthlyPensionInsurance,
        monthlyMedicalInsurance,
        monthlyUnemploymentInsurance,
        monthlyHousingFund,
        monthlyElderlyDeduction,
        monthlyChildrenInfantDeduction,
        monthlyHousingDeduction,
        annualEducationDeduction,
        annualMedicalDeduction,
        annualProfessionalDeduction,
        actualMedicalDeduction,
        educationDegreeAmount,
        monthlyPensionDeduction,
        monthlyEnterpriseAnnuity,
        monthlyInsuranceOtherDeduction,
        monthlyTaxDeferredPension,
        annualCharitableDonation,
        monthlySpecialAdditionalTotal,
        annualSpecialAdditionalTotal,
        annualOtherDeductionTotal,
        monthlyInsuranceDeduction,
        annualSpecialDeductionTotal,
        totalDeduction
    };
}

// 计算年终奖税额
function calculateBonusTax(bonusIncome, bonusInclude) {
    if (bonusIncome <= 0 || bonusInclude) return 0;
    
    const monthlyBonus = bonusIncome / 12;
    for (const bracket of bonusMonthlyTaxRates) {
        if (monthlyBonus <= bracket.max) {
            return bonusIncome * bracket.rate - bracket.deduction;
        }
    }
    return 0;
}

// 计算综合所得累计预缴税额
function calculateCumulativePrepaidTax(workMonths, monthlySalaryIncome, monthlyBasicDeduction, 
    monthlyInsuranceDeduction, monthlySpecialAdditionalTotal, monthlyPensionDeduction, 
    monthlyEnterpriseAnnuity, monthlyInsuranceOtherDeduction, monthlyTaxDeferredPension) {
    
    let cumulativeTaxableIncome = 0;
    
    for (let i = 1; i <= workMonths; i++) {
        const monthlyTaxable = (monthlySalaryIncome - monthlyBasicDeduction - 
            monthlyInsuranceDeduction - monthlySpecialAdditionalTotal - monthlyPensionDeduction - 
            monthlyEnterpriseAnnuity - monthlyInsuranceOtherDeduction - monthlyTaxDeferredPension) * i;
        cumulativeTaxableIncome = Math.max(0, monthlyTaxable);
    }
    
    for (const bracket of comprehensiveTaxRates) {
        if (cumulativeTaxableIncome <= bracket.max) {
            return cumulativeTaxableIncome * bracket.rate - bracket.deduction;
        }
    }
    
    const topBracket = comprehensiveTaxRates[comprehensiveTaxRates.length - 1];
    return cumulativeTaxableIncome * topBracket.rate - topBracket.deduction;
}

// 计算综合所得应纳税额
function calculateTax() {
    try {
        // 收集输入数据
        const workMonths = parseInt(document.getElementById('work-months').value) || 12;
        const monthlySalaryIncome = parseFloat(document.getElementById('salary-income').value) || 0;
        const annualLaborIncome = parseFloat(document.getElementById('labor-income').value) || 0;
        const annualAuthorIncome = parseFloat(document.getElementById('author-income').value) || 0;
        const annualRoyaltyIncome = parseFloat(document.getElementById('royalty-income').value) || 0;
        const bonusIncome = parseFloat(document.getElementById('bonus-income').value) || 0;
        const bonusInclude = document.getElementById('bonus-include').checked;

        // 使用统一函数计算其他收入（用于计算总收入）
        const otherIncome = calculateOtherIncome(annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome);
        
        // 使用统一函数计算扣除项
        const deductions = calculateComprehensiveDeductions(workMonths);

        // 计算总收入
        let totalIncome = monthlySalaryIncome * workMonths + otherIncome.laborTaxableIncome + 
            otherIncome.authorTaxableIncome + otherIncome.royaltyTaxableIncome;
        
        if (bonusIncome > 0 && bonusInclude) {
            totalIncome += bonusIncome;
        }

        // 计算应纳税所得额
        const taxableIncome = Math.max(0, totalIncome - deductions.totalDeduction);

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

        // 计算预缴税额（工资薪金所得）
        const cumulativeTax = calculateCumulativePrepaidTax(workMonths, monthlySalaryIncome, 
            deductions.monthlyBasicDeduction, deductions.monthlyInsuranceDeduction, 
            deductions.monthlySpecialAdditionalTotal, deductions.monthlyPensionDeduction, 
            deductions.monthlyEnterpriseAnnuity, deductions.monthlyInsuranceOtherDeduction, 
            deductions.monthlyTaxDeferredPension);
        
        // 计算其他收入的预缴税额（劳务报酬、稿酬、特许权使用费）- 复用上面已计算的 otherIncome
        // 计算年终奖税额
        const bonusTax = calculateBonusTax(bonusIncome, bonusInclude);
        
        // 获取用户输入的已纳税额
        const userInputPrepaidTax = parseFloat(document.getElementById('prepaid-tax')?.value);
        
        // 如果用户输入了已纳税额，使用用户输入值；否则使用计算的累积预缴税额 + 其他收入预缴税额 + 年终奖税额
        const prepaidTax = (userInputPrepaidTax !== undefined && !isNaN(userInputPrepaidTax)) 
            ? userInputPrepaidTax 
            : (cumulativeTax + otherIncome.laborTax + otherIncome.authorTax + otherIncome.royaltyTax + bonusTax);
        
        const refundTax = totalTax - prepaidTax;
        
        const preTaxIncome = monthlySalaryIncome * workMonths + annualLaborIncome + 
            annualAuthorIncome + annualRoyaltyIncome + bonusIncome;
        
        const netIncome = preTaxIncome - totalTax;

        calculationResults = {
            workMonths: workMonths,
            incomeDetails: {
                salary: monthlySalaryIncome,
                labor: annualLaborIncome,
                laborCalculated: otherIncome.laborTaxableIncome,
                laborTax: otherIncome.laborTax,
                author: annualAuthorIncome,
                authorCalculated: otherIncome.authorTaxableIncome,
                authorTax: otherIncome.authorTax,
                royalty: annualRoyaltyIncome,
                royaltyCalculated: otherIncome.royaltyTaxableIncome,
                royaltyTax: otherIncome.royaltyTax,
                bonus: bonusIncome,
                bonusInclude: bonusInclude,
                bonusTax: bonusTax,
                total: totalIncome,
                preTaxTotal: preTaxIncome
            },
            deductionDetails: {
                basic: deductions.monthlyBasicDeduction,
                pensionInsurance: deductions.monthlyPensionInsurance,
                medicalInsurance: deductions.monthlyMedicalInsurance,
                unemploymentInsurance: deductions.monthlyUnemploymentInsurance,
                housingFund: deductions.monthlyHousingFund,
                elderly: deductions.monthlyElderlyDeduction,
                childrenInfant: deductions.monthlyChildrenInfantDeduction,
                housing: deductions.monthlyHousingDeduction,
                education: deductions.annualEducationDeduction,
                medical: deductions.annualMedicalDeduction,
                actualMedical: deductions.actualMedicalDeduction,
                professional: deductions.annualProfessionalDeduction,
                educationDegree: deductions.educationDegreeAmount / workMonths,
                pension: deductions.monthlyPensionDeduction,
                enterpriseAnnuity: deductions.monthlyEnterpriseAnnuity,
                insuranceOther: deductions.monthlyInsuranceOtherDeduction,
                taxDeferredPension: deductions.monthlyTaxDeferredPension,
                charitableDonation: deductions.annualCharitableDonation,
                specialAdditionalTotal: deductions.annualSpecialAdditionalTotal,
                specialDeductionTotal: deductions.annualSpecialDeductionTotal,
                otherTotal: deductions.annualOtherDeductionTotal,
                total: deductions.totalDeduction
            },
            taxDetails: {
                taxableIncome: taxableIncome,
                totalTax: totalTax,
                applicableRate: applicableRate,
                applicableDeduction: applicableDeduction,
                prepaidTax: prepaidTax,
                refundTax: refundTax,
                netIncome: netIncome
            },
            calculationDate: new Date().toISOString()
        };

        document.getElementById('result-total-income').textContent = '¥' + totalIncome.toFixed(2);
        document.getElementById('result-total-deduction').textContent = '¥' + deductions.totalDeduction.toFixed(2);
        document.getElementById('result-taxable-income').textContent = '¥' + taxableIncome.toFixed(2);
        document.getElementById('result-tax-rate').textContent = (applicableRate * 100).toFixed(0) + '%';
        document.getElementById('result-deduction-amount').textContent = '¥' + applicableDeduction.toFixed(2);
        document.getElementById('result-total-tax').textContent = '¥' + totalTax.toFixed(2);
        
        if (bonusIncome > 0) {
            const bonusDisplay = document.getElementById('bonus-tax-display');
            if (bonusDisplay) {
                bonusDisplay.style.display = 'block';
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
        
        const resultPrepaidTaxElement = document.getElementById('result-prepaid-tax');
        if (resultPrepaidTaxElement) {
            resultPrepaidTaxElement.textContent = '¥' + prepaidTax.toFixed(2);
        }
        
        const refundTaxElement = document.getElementById('result-refund-tax');
        if (refundTaxElement) {
            if (refundTax === 0) {
                refundTaxElement.textContent = '不退不补 ¥0.00';
                refundTaxElement.className = 'font-medium text-lg';
            } else if (refundTax > 0) {
                refundTaxElement.textContent = '应补 ¥' + refundTax.toFixed(2);
                refundTaxElement.className = 'font-medium text-lg text-danger';
            } else {
                refundTaxElement.textContent = '应退 ¥' + Math.abs(refundTax).toFixed(2);
                refundTaxElement.className = 'font-medium text-lg text-success';
            }
        }
        
        const resultNetIncomeElement = document.getElementById('result-net-income');
        if (resultNetIncomeElement) {
            resultNetIncomeElement.textContent = '¥' + netIncome.toFixed(2);
        }
    } catch (error) {
        console.error('计算过程中出现错误:', error);
        showAlert('计算过程中出现错误：' + error.message);
    }
}

// 计算反向倒算扣除项
function calculateReverseDeductions(inputData) {
    const basicDeduction = 5000;
    
    const isSpecialDeductionVisible = document.getElementById('reverse-special-deduction-checkbox')?.checked;
    const isSpecialAdditionalDeductionVisible = document.getElementById('reverse-special-additional-deduction-checkbox')?.checked;
    const isOtherDeductionVisible = document.getElementById('reverse-other-deduction-checkbox')?.checked;
    
    let specialDeduction = 0;
    if (isSpecialDeductionVisible) {
        const monthlyPensionInsurance = parseFloat(document.getElementById('reverse-pension-insurance')?.value) || 0;
        const monthlyMedicalInsurance = parseFloat(document.getElementById('reverse-medical-insurance')?.value) || 0;
        const monthlyUnemploymentInsurance = parseFloat(document.getElementById('reverse-unemployment-insurance')?.value) || 0;
        const monthlyHousingFund = parseFloat(document.getElementById('reverse-housing-fund')?.value) || 0;
        specialDeduction = monthlyPensionInsurance + monthlyMedicalInsurance + 
            monthlyUnemploymentInsurance + monthlyHousingFund;
    }
    
    let specialAdditionalDeduction = 0;
    let actualMedicalDeduction = 0;
    let annualProfessionalDeduction = 0;
    if (isSpecialAdditionalDeductionVisible) {
        const monthlyChildrenInfantDeduction = parseFloat(document.getElementById('reverse-children-infant-deduction')?.value) || 0;
        const monthlyElderlyDeduction = parseFloat(document.getElementById('reverse-elderly-deduction')?.value) || 0;
        
        let monthlyHousingDeduction = 0;
        const housingType = document.getElementById('reverse-housing-type')?.value;
        if (housingType === 'rent') {
            monthlyHousingDeduction = parseFloat(document.getElementById('reverse-rent-deduction')?.value) || 0;
        } else if (housingType === 'loan') {
            monthlyHousingDeduction = parseFloat(document.getElementById('reverse-housing-loan-deduction')?.value) || 0;
        }

        const annualEducationDeduction = parseFloat(document.getElementById('reverse-education-deduction')?.value) || 0;
        const medicalDeduction = parseFloat(document.getElementById('reverse-medical-deduction')?.value) || 0;
        actualMedicalDeduction = medicalDeduction > 15000 ? Math.min(medicalDeduction - 15000, 80000) : 0;
        
        if (document.getElementById('reverse-education-professional-checkbox')?.checked) {
            annualProfessionalDeduction = 3600;
        }
        
        const educationDegreeAmount = annualEducationDeduction - annualProfessionalDeduction;
        const monthlyEducationDeduction = educationDegreeAmount / 12;
        specialAdditionalDeduction = monthlyChildrenInfantDeduction + monthlyElderlyDeduction + 
            monthlyHousingDeduction + monthlyEducationDeduction;
    }
    
    let otherDeduction = 0;
    const isPensionDeductionChecked = isOtherDeductionVisible && 
        document.getElementById('reverse-pension-deduction-checkbox')?.checked;
    const monthlyPensionDeduction = isPensionDeductionChecked ? 
        (parseFloat(document.getElementById('reverse-pension-deduction')?.value) || 0) : 0;
    const isEnterpriseAnnuityChecked = isOtherDeductionVisible && 
        document.getElementById('reverse-enterprise-annuity-checkbox')?.checked;
    const monthlyEnterpriseAnnuity = isEnterpriseAnnuityChecked ? 
        (parseFloat(document.getElementById('reverse-enterprise-annuity')?.value) || 0) : 0;
    const isInsuranceOtherDeductionChecked = isOtherDeductionVisible && 
        document.getElementById('reverse-insurance-other-deduction-checkbox')?.checked;
    const monthlyInsuranceOtherDeduction = isInsuranceOtherDeductionChecked ? 
        (parseFloat(document.getElementById('reverse-insurance-other-deduction')?.value) || 0) : 0;
    const isTaxDeferredPensionChecked = isOtherDeductionVisible && 
        document.getElementById('reverse-tax-deferred-pension-checkbox')?.checked;
    const monthlyTaxDeferredPension = isTaxDeferredPensionChecked ? 
        (parseFloat(document.getElementById('reverse-tax-deferred-pension')?.value) || 0) : 0;
    otherDeduction = monthlyPensionDeduction + monthlyEnterpriseAnnuity + 
        monthlyInsuranceOtherDeduction + monthlyTaxDeferredPension;
    
    const monthlyTotalDeduction = basicDeduction + specialDeduction + specialAdditionalDeduction + otherDeduction;
    
    const isCharitableDonationChecked = isOtherDeductionVisible && 
        document.getElementById('reverse-charitable-donation-checkbox')?.checked;
    const annualCharitableDonation = isCharitableDonationChecked ? 
        (parseFloat(document.getElementById('reverse-charitable-donation')?.value) || 0) : 0;
    const totalDeduction = monthlyTotalDeduction * inputData.workMonths + annualProfessionalDeduction + 
        actualMedicalDeduction + annualCharitableDonation;
    
    return {
        basicDeduction,
        specialDeduction,
        specialAdditionalDeduction,
        otherDeduction,
        monthlyTotalDeduction,
        totalDeduction,
        actualMedicalDeduction
    };
}

// 计算反向倒算年终奖税额
function calculateReverseBonusTax(inputData) {
    let bonusTax = 0;
    if (inputData.bonusIncome > 0 && !inputData.bonusInclude) {
        const monthlyBonus = inputData.bonusIncome / 12;
        for (const bracket of bonusMonthlyTaxRates) {
            if (monthlyBonus <= bracket.max) {
                bonusTax = inputData.bonusIncome * bracket.rate - bracket.deduction;
                break;
            }
        }
    }
    return bonusTax;
}

// 辅助函数：根据应纳税所得额计算税额
function calculateTaxByTaxableIncome(taxableIncome) {
    if (taxableIncome <= 0) return { tax: 0, rate: 0, deduction: 0 };
    
    for (const bracket of comprehensiveTaxRates) {
        if (taxableIncome <= bracket.max) {
            const tax = taxableIncome * bracket.rate - bracket.deduction;
            return {
                tax: Math.max(0, tax),
                rate: bracket.rate,
                deduction: bracket.deduction
            };
        }
    }
    return { tax: 0, rate: 0, deduction: 0 };
}

// 方式1：按目标税率倒算（给定税率，计算所需收入范围）
// 核心逻辑：
// 1. 根据目标税率找到对应的应纳税所得额范围 [min, max]
// 2. 税前收入 = 应纳税所得额 + 扣除总额
// 3. 总收入 = 综合所得税前收入 + 年终奖
function calculateFromTargetRate(inputData, deductionData, bonusTax) {
    const targetRate = inputData.targetRate / 100;
    
    // 步骤1：找到目标税率对应的级距
    const targetBracket = comprehensiveTaxRates.find(
        bracket => Math.abs(bracket.rate - targetRate) < 0.001
    );
    
    if (!targetBracket) {
        throw new Error('找不到对应的税率级距');
    }
    
    // 步骤2：获取该税率对应的应纳税所得额范围
    // 数据来源：中国个人所得税法综合所得税率表
    const minTaxableIncome = targetBracket.min || 0;
    const maxTaxableIncome = targetBracket.max;
    
    // 步骤3：计算综合所得税前收入范围
    // 公式：综合所得税前收入 = 应纳税所得额 + 扣除总额
    const minPreTaxIncome = minTaxableIncome + deductionData.totalDeduction;
    const maxPreTaxIncome = maxTaxableIncome === Infinity 
        ? Infinity 
        : maxTaxableIncome + deductionData.totalDeduction;
    
    // 步骤4：计算总收入范围
    // 总收入 = 综合所得税前收入 + 年终奖（年终奖是否并入只影响税额，不影响收入范围）
    let minTotalIncome, maxTotalIncome;
    
    if (inputData.bonusIncome > 0) {
        // 有年终奖：总收入 = 综合所得 + 年终奖
        minTotalIncome = minPreTaxIncome + inputData.bonusIncome;
        maxTotalIncome = maxPreTaxIncome === Infinity 
            ? Infinity 
            : maxPreTaxIncome + inputData.bonusIncome;
    } else {
        // 无年终奖
        minTotalIncome = minPreTaxIncome;
        maxTotalIncome = maxPreTaxIncome;
    }
    
    // 步骤5：计算参考中间值
    // 对于有上限的级距，使用级距中点
    // 对于无上限的级距（最高税率45%），使用 min + 100,000 作为参考值
    let middleTaxableIncome;
    if (maxTaxableIncome === Infinity) {
        middleTaxableIncome = minTaxableIncome + 100000;
    } else {
        middleTaxableIncome = (minTaxableIncome + maxTaxableIncome) / 2;
    }
    
    // 步骤6：计算中间值对应的税额和税后收入
    const middlePreTaxIncome = middleTaxableIncome + deductionData.totalDeduction;
    let middleTotalIncome;
    
    if (inputData.bonusIncome > 0) {
        middleTotalIncome = middlePreTaxIncome + inputData.bonusIncome;
    } else {
        middleTotalIncome = middlePreTaxIncome;
    }
    
    // 计算综合所得税额
    // 公式：应纳税额 = 应纳税所得额 × 税率 - 速算扣除数
    const middleComprehensiveTax = middleTaxableIncome * targetBracket.rate - targetBracket.deduction;
    // 总税额 = 综合所得税额 + 年终奖税额
    const middleTotalTax = middleComprehensiveTax + bonusTax;
    // 税后收入 = 税前收入 - 总税额
    const middleNetIncome = middleTotalIncome - middleTotalTax;
    
    return {
        totalIncome: middleTotalIncome,
        minTotalIncome: minTotalIncome,
        maxTotalIncome: maxTotalIncome,
        finalTotalTax: middleTotalTax,
        calculatedNetIncome: middleNetIncome,
        taxableIncome: middleTaxableIncome,
        applicableRate: targetBracket.rate,
        applicableDeduction: targetBracket.deduction,
        isRateMode: true,
        modeName: '税率倒算'
    };
}

// 方式2：按月度税后收入倒算（给定税后收入，计算税前收入）
// 核心逻辑：
// 已知：税后收入 = 税前收入 - 应纳税额 - 年终奖税额
// 使用二分法求解税前收入
function calculateFromMonthlyNet(inputData, deductionData, bonusTax) {
    const monthlyNet = inputData.monthlyNet;
    const workMonths = inputData.workMonths;
    
    // 步骤1：计算年度目标税后收入
    // 公式：年度税后收入 = 月度税后收入 × 工作月数
    const annualNetTarget = monthlyNet * workMonths;
    
    // 步骤2：使用二分法求解税前收入
    // 搜索范围：[扣除总额, 扣除总额 + 10,000,000]
    let left = deductionData.totalDeduction;
    let right = deductionData.totalDeduction + 10000000;
    const precision = 0.01;
    
    while (right - left > precision) {
        // 中间值：假设的税前收入
        const mid = (left + right) / 2;
        
        // 计算应纳税所得额
        // 公式：应纳税所得额 = 税前收入 - 扣除总额
        const taxableIncome = mid - deductionData.totalDeduction;
        
        if (taxableIncome <= 0) {
            // 应纳税所得额为0或负数，不需要交税
            left = mid;
            continue;
        }
        
        // 计算综合所得税额
        // 公式：应纳税额 = 应纳税所得额 × 税率 - 速算扣除数
        const taxResult = calculateTaxByTaxableIncome(taxableIncome);
        const comprehensiveTax = taxResult.tax;
        
        // 计算税后收入
        // 公式：税后收入 = 税前收入 - 综合所得税额 - 年终奖税额
        const netIncome = mid - comprehensiveTax - bonusTax;
        
        // 二分法调整
        if (netIncome < annualNetTarget) {
            // 税后收入不足，需要增加税前收入
            left = mid;
        } else {
            // 税后收入过多，需要减少税前收入
            right = mid;
        }
    }
    
    // 步骤3：得到最终结果
    const totalIncome = (left + right) / 2;
    const taxableIncome = totalIncome - deductionData.totalDeduction;
    
    // 计算实际税额
    const taxResult = calculateTaxByTaxableIncome(taxableIncome);
    const finalTotalTax = taxResult.tax + bonusTax;
    const calculatedNetIncome = totalIncome - finalTotalTax;
    
    return {
        totalIncome: totalIncome,
        monthlyIncome: totalIncome / workMonths,
        finalTotalTax: finalTotalTax,
        calculatedNetIncome: calculatedNetIncome,
        monthlyNet: calculatedNetIncome / workMonths,
        taxableIncome: taxableIncome,
        applicableRate: taxResult.rate,
        applicableDeduction: taxResult.deduction,
        isMonthlyMode: true,
        modeName: '月度税后倒算'
    };
}

// 方式3：按目标税额倒算（给定目标税额，计算所需税前收入）
// 核心逻辑：
// 已知：税额 = 应纳税所得额 × 税率 - 速算扣除数
// 使用二分法求解应纳税所得额，然后计算税前收入
function calculateFromTargetTax(inputData, deductionData, bonusTax) {
    const targetTax = inputData.fixedTax;
    const targetNet = inputData.fixedNet;
    
    // 情况A：仅输入目标税额
    if (targetTax > 0 && targetNet === 0) {
        // 步骤1：使用二分法求解税前收入
        // 搜索范围：[扣除总额, 扣除总额 + 10,000,000]
        let left = deductionData.totalDeduction;
        let right = deductionData.totalDeduction + 10000000;
        const precision = 0.01;
        
        while (right - left > precision) {
            // 中间值：假设的税前收入
            const mid = (left + right) / 2;
            
            // 计算应纳税所得额
            // 公式：应纳税所得额 = 税前收入 - 扣除总额
            const taxable = mid - deductionData.totalDeduction;
            
            if (taxable <= 0) {
                // 应纳税所得额为0或负数，税额为0
                left = mid;
                continue;
            }
            
            // 计算综合所得税额
            // 公式：应纳税额 = 应纳税所得额 × 税率 - 速算扣除数
            const taxResult = calculateTaxByTaxableIncome(taxable);
            const currentTax = taxResult.tax + bonusTax;
            
            // 二分法调整
            if (currentTax < targetTax) {
                // 税额不足，需要增加税前收入
                left = mid;
            } else {
                // 税额过多，需要减少税前收入
                right = mid;
            }
        }
        
        // 步骤2：得到最终结果
        const calculatedIncome = (left + right) / 2;
        const calculatedTaxable = calculatedIncome - deductionData.totalDeduction;
        
        // 计算实际税额
        const taxResult = calculateTaxByTaxableIncome(calculatedTaxable);
        const actualTax = taxResult.tax + bonusTax;
        
        return {
            totalIncome: calculatedIncome,
            finalTotalTax: actualTax,
            calculatedNetIncome: calculatedIncome - actualTax,
            taxableIncome: calculatedTaxable,
            applicableRate: taxResult.rate,
            applicableDeduction: taxResult.deduction,
            isTaxMode: true,
            modeName: '税额倒算',
            targetTax: targetTax,
            taxDifference: actualTax - targetTax
        };
    }
    
    // 情况B：同时输入税额和到手金额
    // 公式：税前收入 = 税额 + 到手金额
    const targetTotalIncome = targetTax + targetNet;
    const targetTaxableIncome = targetTotalIncome - deductionData.totalDeduction;
    
    // 计算实际应纳税额
    const taxResult = calculateTaxByTaxableIncome(targetTaxableIncome);
    const actualTax = taxResult.tax + bonusTax;
    
    return {
        totalIncome: targetTotalIncome,
        finalTotalTax: targetTax,
        actualTax: actualTax,
        calculatedNetIncome: targetNet,
        taxableIncome: targetTaxableIncome,
        applicableRate: taxResult.rate,
        applicableDeduction: taxResult.deduction,
        isTaxMode: true,
        modeName: '税额+到手倒算',
        targetTax: targetTax,
        targetNet: targetNet,
        taxDifference: targetTax - actualTax
    };
}

// 反向倒算主函数
function calculateReverseTax() {
    try {
        const inputData = collectReverseInputData();
        const deductionData = calculateReverseDeductions(inputData);
        const bonusTax = calculateReverseBonusTax(inputData);
        
        let result;
        if (inputData.reverseType === 'rate') {
            result = calculateFromTargetRate(inputData, deductionData, bonusTax);
        } else if (inputData.reverseType === 'monthly') {
            result = calculateFromMonthlyNet(inputData, deductionData, bonusTax);
        } else {
            result = calculateFromTargetTax(inputData, deductionData, bonusTax);
        }
        
        saveReverseCalculationResult(result, inputData, deductionData, bonusTax);
        updateReverseResultDisplay(result);
        
    } catch (error) {
        console.error('反向倒算计算过程中出现错误:', error);
        showAlert('计算过程中出现错误，请检查输入数据后重试。错误信息：' + error.message);
    }
}

// 收集反向倒算输入数据
function collectReverseInputData() {
    const reverseType = document.getElementById('reverse-type')?.value || 'rate';
    const incomeType = document.getElementById('reverse-income-type')?.value || 'comprehensive';
    
    let targetRate = 3;
    let monthlyNet = 0;
    let fixedTax = 0;
    let fixedNet = 0;
    
    if (reverseType === 'rate') {
        targetRate = parseFloat(document.getElementById('reverse-target-rate')?.value) || 3;
    } else if (reverseType === 'monthly') {
        monthlyNet = parseFloat(document.getElementById('reverse-monthly-net')?.value) || 0;
        if (monthlyNet < 0) {
            throw new Error('月度税后收入不能为负数');
        }
    } else {
        fixedTax = parseFloat(document.getElementById('reverse-fixed-tax')?.value) || 0;
        fixedNet = parseFloat(document.getElementById('reverse-fixed-net')?.value) || 0;
        if (fixedTax < 0) {
            throw new Error('希望缴纳的税额不能为负数');
        }
        if (fixedNet < 0) {
            throw new Error('希望到手的金额不能为负数');
        }
    }
    
    const workMonths = parseInt(document.getElementById('reverse-work-months')?.value) || 12;
    if (workMonths < 1 || workMonths > 12) {
        throw new Error('工作月数必须在1-12之间');
    }
    
    const bonusIncome = parseFloat(document.getElementById('reverse-bonus-income')?.value) || 0;
    const bonusInclude = document.getElementById('reverse-bonus-include')?.checked;
    
    return {
        reverseType,
        incomeType,
        targetRate,
        monthlyNet,
        fixedTax,
        fixedNet,
        workMonths,
        bonusIncome,
        bonusInclude
    };
}

// 保存反向倒算计算结果
function saveReverseCalculationResult(result, inputData, deductionData, bonusTax) {
    reverseCalculationResults = {
        incomeType: inputData.incomeType,
        reverseType: inputData.reverseType,
        workMonths: inputData.workMonths,
        totalIncome: result.totalIncome,
        totalDeduction: deductionData.totalDeduction,
        totalTax: result.finalTotalTax,
        incomeDetails: {
            total: result.totalIncome,
            minTotal: result.minTotalIncome,
            maxTotal: result.maxTotalIncome,
            monthly: result.monthlyIncome
        },
        deductionDetails: {
            actualMedical: deductionData.actualMedicalDeduction,
            total: deductionData.totalDeduction
        },
        taxDetails: {
            totalTax: result.finalTotalTax,
            netIncome: result.calculatedNetIncome,
            monthlyNet: result.monthlyNet,
            targetTax: result.targetTax,
            targetNet: result.targetNet,
            taxableIncome: result.taxableIncome,
            applicableRate: result.applicableRate,
            applicableDeduction: result.applicableDeduction
        },
        bonusIncome: inputData.bonusIncome,
        bonusTax: bonusTax,
        calculationDate: new Date().toISOString()
    };
}

// 更新反向倒算结果显示
function updateReverseResultDisplay(result) {
    const data = reverseCalculationResults;
    
    const totalTaxEl = document.getElementById('reverse-result-total-tax');
    const bonusEl = document.getElementById('reverse-result-bonus');
    const bonusTaxEl = document.getElementById('reverse-result-bonus-tax');
    const totalIncomeEl = document.getElementById('reverse-result-total-income');
    const netIncomeEl = document.getElementById('reverse-result-net-income');
    const rateEl = document.getElementById('reverse-result-tax-rate');
    const deductionEl = document.getElementById('reverse-result-deduction');
    const taxableIncomeEl = document.getElementById('reverse-result-taxable-income');
    const totalDeductionEl = document.getElementById('reverse-result-total-deduction');
    
    if (totalTaxEl) {
        const taxValue = isFinite(result.finalTotalTax) ? result.finalTotalTax : 0;
        totalTaxEl.textContent = '¥' + taxValue.toFixed(2);
    }
    if (bonusEl) {
        bonusEl.textContent = '¥' + (data.bonusIncome || 0).toFixed(2);
    }
    if (bonusTaxEl) {
        bonusTaxEl.textContent = '¥' + (data.bonusTax || 0).toFixed(2);
    }
    if (totalIncomeEl) {
        if (result.isRateMode && result.minTotalIncome !== undefined) {
            const minStr = isFinite(result.minTotalIncome) ? '¥' + result.minTotalIncome.toFixed(2) : '¥0';
            const maxStr = isFinite(result.maxTotalIncome) ? '¥' + result.maxTotalIncome.toFixed(2) : '无上限';
            const midStr = isFinite(result.totalIncome) ? '¥' + result.totalIncome.toFixed(2) : '¥0';
            totalIncomeEl.innerHTML = 
                `${minStr} - ${maxStr}` +
                `<br><span style="font-size: 14px; color: #666;">(中间值: ${midStr})</span>`;
        } else {
            const incomeValue = isFinite(result.totalIncome) ? result.totalIncome : 0;
            totalIncomeEl.textContent = '¥' + incomeValue.toFixed(2);
            if (result.isMonthlyMode && result.monthlyIncome) {
                const monthlyValue = isFinite(result.monthlyIncome) ? result.monthlyIncome : 0;
                totalIncomeEl.innerHTML += 
                    `<br><span style="font-size: 14px; color: #666;">(月均: ¥${monthlyValue.toFixed(2)})</span>`;
            }
        }
    }
    if (netIncomeEl) {
        const netValue = isFinite(result.calculatedNetIncome) ? result.calculatedNetIncome : 0;
        netIncomeEl.textContent = '¥' + netValue.toFixed(2);
        if (result.isMonthlyMode && result.monthlyNet) {
            const monthlyNetValue = isFinite(result.monthlyNet) ? result.monthlyNet : 0;
            netIncomeEl.innerHTML += 
                `<br><span style="font-size: 14px; color: #666;">(月均: ¥${monthlyNetValue.toFixed(2)})</span>`;
        }
    }
    if (rateEl) {
        rateEl.textContent = (result.applicableRate * 100).toFixed(0) + '%';
    }
    if (deductionEl) {
        deductionEl.textContent = '¥' + result.applicableDeduction.toFixed(2);
    }
    if (taxableIncomeEl) {
        const taxableValue = isFinite(result.taxableIncome) ? result.taxableIncome : 0;
        taxableIncomeEl.textContent = '¥' + taxableValue.toFixed(2);
    }
    if (totalDeductionEl) {
        totalDeductionEl.textContent = '¥' + data.deductionDetails.total.toFixed(2);
    }
}

// 计算经营所得
function calculateBusinessTax() {
    try {
        const businessIncome = parseFloat(document.getElementById('business-income')?.value) || 0;
        const businessCost = parseFloat(document.getElementById('business-cost')?.value) || 0;
        const businessExpenses = parseFloat(document.getElementById('business-expenses')?.value) || 0;
        const businessTaxes = parseFloat(document.getElementById('business-taxes')?.value) || 0;
        const businessLosses = parseFloat(document.getElementById('business-losses')?.value) || 0;
        const businessOtherExpenses = parseFloat(document.getElementById('business-other-expenses')?.value) || 0;
        const businessPreviousLosses = parseFloat(document.getElementById('business-previous-losses')?.value) || 0;
        const hasComprehensiveIncome = document.getElementById('business-has-comprehensive-income')?.checked ?? true;
        const specialAdditionalDeduction = parseFloat(document.getElementById('business-special-additional-deduction')?.value) || 0;
        const otherDeduction = parseFloat(document.getElementById('business-other-deduction')?.value) || 0;
        const prepaidTax = parseFloat(document.getElementById('business-prepaid-tax')?.value) || 0;
        
        // 计算经营利润
        const businessProfit = Math.max(0, businessIncome - businessCost - businessExpenses - 
            businessTaxes - businessLosses - businessOtherExpenses);
        
        // 扣除以前年度亏损
        const netIncomeAfterLoss = Math.max(0, businessProfit - businessPreviousLosses);
        
        // 计算投资者减除费用（60000元/年）
        const investorDeduction = hasComprehensiveIncome ? 0 : 60000;
        
        // 计算应纳税所得额
        const taxableIncome = Math.max(0, netIncomeAfterLoss - investorDeduction - specialAdditionalDeduction - otherDeduction);
        
        // 计算应纳税额（未减半）
        let totalTaxBeforeHalving = 0;
        let applicableRate = 0;
        let applicableDeduction = 0;
        
        for (const bracket of businessTaxRates) {
            if (taxableIncome <= bracket.max) {
                totalTaxBeforeHalving = taxableIncome * bracket.rate - bracket.deduction;
                applicableRate = bracket.rate;
                applicableDeduction = bracket.deduction;
                break;
            }
        }
        
        // 计算减半征收减免税额（年应纳税所得额不超过200万元的部分减半征收）
        const halvingThreshold = 2000000;
        const halvingTaxable = Math.min(taxableIncome, halvingThreshold);
        const taxReduction = totalTaxBeforeHalving > 0 ? (halvingTaxable * applicableRate - applicableDeduction) * 0.5 : 0;
        
        // 计算实际应纳税额
        const totalTax = Math.max(0, totalTaxBeforeHalving - taxReduction);
        
        // 计算应退/应补税额
        const refundTax = totalTax - prepaidTax;
        
        // 计算税后经营所得
        const netIncomeAfterTax = netIncomeAfterLoss - totalTax;
        
        businessCalculationResults = {
            incomeDetails: {
                businessIncome,
                businessCost,
                businessExpenses,
                businessTaxes,
                businessLosses,
                businessOtherExpenses,
                businessPreviousLosses,
                businessProfit
            },
            deductionDetails: {
                hasComprehensiveIncome,
                investorDeduction,
                specialAdditionalDeduction,
                otherDeduction
            },
            taxDetails: {
                netIncome: netIncomeAfterLoss,
                taxableIncome,
                applicableRate,
                applicableDeduction,
                totalTaxBeforeHalving,
                taxReduction,
                totalTax,
                prepaidTax,
                refundTax,
                netIncomeAfterTax
            },
            calculationDate: new Date().toISOString()
        };
        
        safeSetTextContent('business-result-net-income', '¥' + netIncomeAfterLoss.toFixed(2));
        safeSetTextContent('business-result-taxable-income', '¥' + taxableIncome.toFixed(2));
        safeSetTextContent('business-result-tax-rate', (applicableRate * 100).toFixed(0) + '%');
        safeSetTextContent('business-result-total-tax', '¥' + totalTax.toFixed(2));
        safeSetTextContent('business-result-prepaid-tax', '¥' + prepaidTax.toFixed(2));
        safeSetTextContent('business-result-refund-tax', (refundTax >= 0 ? '应补 ¥' : '应退 ¥') + Math.abs(refundTax).toFixed(2));
        safeSetClass('business-result-refund-tax', refundTax >= 0 ? 'font-medium text-lg text-danger' : 'font-medium text-lg text-success');
        safeSetTextContent('business-result-deduction', '¥' + applicableDeduction.toFixed(2));
        safeSetTextContent('business-result-tax-reduction', '¥' + taxReduction.toFixed(2));
        safeSetTextContent('business-result-deductions', '¥' + (investorDeduction + specialAdditionalDeduction + otherDeduction).toFixed(2));
        
    } catch (error) {
        console.error('经营所得计算过程中出现错误:', error);
        showAlert('计算过程中出现错误：' + error.message);
    }
}

// 保存经营所得计算结果到历史记录
function saveBusinessCalculation() {
    if (Object.keys(businessCalculationResults).length === 0) {
        showAlert('请先完成计算后再保存');
        return;
    }

    try {
        const id = Date.now().toString();
        const savedData = {
            id: id,
            type: 'business',
            title: '经营所得计税 - ' + new Date().toLocaleDateString(),
            results: businessCalculationResults,
            date: new Date().toISOString()
        };
        calculationHistory.unshift(savedData);
        if (calculationHistory.length > 50) {
            calculationHistory = calculationHistory.slice(0, 50);
        }
        localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));
        showSaveSuccessMessage();
    } catch (error) {
        console.error('保存计算结果失败:', error);
        showSaveErrorMessage();
    }
}

// 保存分类所得计算结果到历史记录
function saveClassificationCalculation() {
    if (Object.keys(classificationCalculationResults).length === 0) {
        showAlert('请先完成计算后再保存');
        return;
    }

    try {
        const id = Date.now().toString();
        const savedData = {
            id: id,
            type: 'classification',
            title: '分类所得计税 - ' + new Date().toLocaleDateString(),
            results: classificationCalculationResults,
            date: new Date().toISOString()
        };
        calculationHistory.unshift(savedData);
        if (calculationHistory.length > 50) {
            calculationHistory = calculationHistory.slice(0, 50);
        }
        localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));
        showSaveSuccessMessage();
    } catch (error) {
        console.error('保存计算结果失败:', error);
        showSaveErrorMessage();
    }
}

// 保存反向倒算计算结果到历史记录
function saveReverseCalculation() {
    if (Object.keys(reverseCalculationResults).length === 0) {
        showAlert('请先完成计算后再保存');
        return;
    }

    try {
        const id = Date.now().toString();
        const savedData = {
            id: id,
            type: 'reverse',
            title: '反向倒算计税 - ' + new Date().toLocaleDateString(),
            results: reverseCalculationResults,
            date: new Date().toISOString()
        };
        calculationHistory.unshift(savedData);
        if (calculationHistory.length > 50) {
            calculationHistory = calculationHistory.slice(0, 50);
        }
        localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));
        showSaveSuccessMessage();
    } catch (error) {
        console.error('保存计算结果失败:', error);
        showSaveErrorMessage();
    }
}

// 计算单个分类所得条目
function calculateSingleClassificationTax(type, income, deduction = 0) {
    const taxRate = classificationTaxRates[type]?.rate || 0.20;
    let taxableIncome = 0;
    
    if (type === 'interest' || type === 'accidental') {
        taxableIncome = income;
    } else if (type === 'rent') {
        taxableIncome = income <= 4000 
            ? Math.max(0, income - 800 - deduction)
            : Math.max(0, income * 0.8 - deduction);
    } else if (type === 'transfer') {
        taxableIncome = Math.max(0, income - deduction);
    }
    
    const totalTax = taxableIncome * taxRate;
    
    return {
        type: type,
        income: income,
        deduction: deduction,
        taxableIncome: taxableIncome,
        totalTax: totalTax,
        taxRate: taxRate
    };
}

// 计算分类所得税汇总
function calculateClassificationTaxTotal(items) {
    let totalIncome = 0;
    let totalTaxableIncome = 0;
    let totalTax = 0;
    
    items.forEach(item => {
        totalIncome += item.income;
        totalTaxableIncome += item.taxableIncome;
        totalTax += item.totalTax;
    });
    
    classificationCalculationResults = {
        items: [...items],
        totalIncome: totalIncome,
        totalTaxableIncome: totalTaxableIncome,
        totalTax: totalTax,
        calculationDate: new Date().toISOString()
    };
    
    return classificationCalculationResults;
}
