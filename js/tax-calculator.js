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

// 临界点提醒函数
function checkTaxBracketThreshold(taxableIncome) {
    for (let i = 0; i < comprehensiveTaxRates.length - 1; i++) {
        const currentBracket = comprehensiveTaxRates[i];
        const nextBracket = comprehensiveTaxRates[i + 1];
        
        const threshold = nextBracket.min - 10000;
        if (taxableIncome > threshold && taxableIncome < nextBracket.min) {
            return {
                warning: true,
                currentRate: currentBracket.rate,
                nextRate: nextBracket.rate,
                threshold: nextBracket.min,
                remaining: nextBracket.min - taxableIncome,
                message: `您的应纳税所得额接近${(nextBracket.rate * 100).toFixed(0)}%税率临界点，再增加${(nextBracket.min - taxableIncome).toFixed(2)}元将进入更高税率区间`
            };
        }
    }
    return { warning: false };
}

// 年终奖最优分配计算函数（优化版：基于税率表临界点）
function calculateOptimalBonusAllocation(totalIncome, totalDeduction) {
    const bonusCriticalPoints = [0, 36000, 144000, 300000, 420000, 660000, 960000];
    
    let minTax = Infinity;
    let optimalBonus = 0;
    
    for (const criticalPoint of bonusCriticalPoints) {
        const bonus = Math.min(criticalPoint, totalIncome);
        const salaryIncome = totalIncome - bonus;
        const salaryTaxable = Math.max(0, salaryIncome - totalDeduction);
        
        let salaryTax = 0;
        for (const bracket of comprehensiveTaxRates) {
            if (salaryTaxable <= bracket.max) {
                salaryTax = salaryTaxable * bracket.rate - bracket.deduction;
                break;
            }
        }
        
        let bonusTax = 0;
        if (bonus > 0) {
            const monthlyBonus = bonus / 12;
            for (const bracket of bonusMonthlyTaxRates) {
                if (monthlyBonus <= bracket.max) {
                    bonusTax = bonus * bracket.rate - bracket.deduction;
                    break;
                }
            }
        }
        
        const totalTax = Math.max(0, salaryTax) + Math.max(0, bonusTax);
        
        if (totalTax < minTax) {
            minTax = totalTax;
            optimalBonus = bonus;
        }
    }
    
    const allInTaxable = Math.max(0, totalIncome - totalDeduction);
    let allInTax = 0;
    for (const bracket of comprehensiveTaxRates) {
        if (allInTaxable <= bracket.max) {
            allInTax = allInTaxable * bracket.rate - bracket.deduction;
            break;
        }
    }
    allInTax = Math.max(0, allInTax);
    
    if (allInTax < minTax) {
        return {
            optimalBonus: 0,
            optimalSalary: totalIncome,
            minTax: allInTax,
            taxSavings: 0,
            allInTax: allInTax,
            optimalMethod: 'include'
        };
    }
    
    return {
        optimalBonus: optimalBonus,
        optimalSalary: totalIncome - optimalBonus,
        minTax: minTax,
        taxSavings: allInTax - minTax,
        allInTax: allInTax,
        optimalMethod: 'separate'
    };
}

// 公益捐赠限额校验函数
function validateCharitableDonation(donationAmount, taxableIncome) {
    const maxDeduction = taxableIncome * 0.3;
    const actualDeduction = Math.min(donationAmount, maxDeduction);
    const excessAmount = donationAmount - actualDeduction;
    
    return {
        actualDeduction: actualDeduction,
        excessAmount: excessAmount,
        maxDeduction: maxDeduction,
        isExcess: excessAmount > 0,
        message: excessAmount > 0 ? `捐赠额超过应纳税所得额30%的部分(${excessAmount.toFixed(2)}元)不能享受税前扣除` : '捐赠额在允许扣除范围内'
    };
}

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
        const monthlyTaxable = monthlySalaryIncome - monthlyBasicDeduction - 
            monthlyInsuranceDeduction - monthlySpecialAdditionalTotal - monthlyPensionDeduction - 
            monthlyEnterpriseAnnuity - monthlyInsuranceOtherDeduction - monthlyTaxDeferredPension;
        cumulativeTaxableIncome += Math.max(0, monthlyTaxable);
    }
    
    for (const bracket of comprehensiveTaxRates) {
        if (cumulativeTaxableIncome <= bracket.max) {
            return cumulativeTaxableIncome * bracket.rate - bracket.deduction;
        }
    }
    
    const topBracket = comprehensiveTaxRates[comprehensiveTaxRates.length - 1];
    return cumulativeTaxableIncome * topBracket.rate - topBracket.deduction;
}

function collectTaxInputData() {
    const prepaidTaxElement = document.getElementById('prepaid-tax');
    const userInputPrepaidTax = prepaidTaxElement ? parseFloat(prepaidTaxElement.value) : undefined;
    
    return {
        workMonths: parseInt(document.getElementById('work-months').value) || 12,
        monthlySalaryIncome: parseFloat(document.getElementById('salary-income').value) || 0,
        annualLaborIncome: parseFloat(document.getElementById('labor-income').value) || 0,
        annualAuthorIncome: parseFloat(document.getElementById('author-income').value) || 0,
        annualRoyaltyIncome: parseFloat(document.getElementById('royalty-income').value) || 0,
        bonusIncome: parseFloat(document.getElementById('bonus-income').value) || 0,
        bonusInclude: document.getElementById('bonus-include').checked,
        userInputPrepaidTax: !isNaN(userInputPrepaidTax) ? userInputPrepaidTax : undefined
    };
}

function calculateTotalIncome(monthlySalaryIncome, workMonths, otherIncome, bonusIncome, bonusInclude) {
    let totalIncome = monthlySalaryIncome * workMonths + otherIncome.laborTaxableIncome + 
        otherIncome.authorTaxableIncome + otherIncome.royaltyTaxableIncome;
    
    if (bonusIncome > 0 && bonusInclude) {
        totalIncome += bonusIncome;
    }
    
    return totalIncome;
}

function calculateIncomeTax(taxableIncome) {
    for (const bracket of comprehensiveTaxRates) {
        if (taxableIncome <= bracket.max) {
            return {
                totalTax: taxableIncome * bracket.rate - bracket.deduction,
                applicableRate: bracket.rate,
                applicableDeduction: bracket.deduction
            };
        }
    }
    const topBracket = comprehensiveTaxRates[comprehensiveTaxRates.length - 1];
    return {
        totalTax: taxableIncome * topBracket.rate - topBracket.deduction,
        applicableRate: topBracket.rate,
        applicableDeduction: topBracket.deduction
    };
}

function determinePrepaidTax(userInputPrepaidTax, cumulativeTax, otherIncome, bonusTax) {
    if (userInputPrepaidTax !== undefined && !isNaN(userInputPrepaidTax)) {
        return userInputPrepaidTax;
    }
    return cumulativeTax + otherIncome.laborTax + otherIncome.authorTax + otherIncome.royaltyTax + bonusTax;
}

function calculatePreTaxIncome(monthlySalaryIncome, workMonths, annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome, bonusIncome) {
    return monthlySalaryIncome * workMonths + annualLaborIncome + 
        annualAuthorIncome + annualRoyaltyIncome + bonusIncome;
}

function performTaxCalculation(inputData) {
    const { workMonths, monthlySalaryIncome, annualLaborIncome, annualAuthorIncome, 
            annualRoyaltyIncome, bonusIncome, bonusInclude, userInputPrepaidTax } = inputData;
    
    const otherIncome = calculateOtherIncome(annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome);
    const deductions = calculateComprehensiveDeductions(workMonths);
    
    const totalIncome = calculateTotalIncome(
        monthlySalaryIncome, workMonths, otherIncome, bonusIncome, bonusInclude
    );
    
    const taxableIncome = Math.max(0, totalIncome - deductions.totalDeduction);
    const donationBeforeTaxableIncome = Math.max(0, totalIncome - (deductions.totalDeduction - deductions.annualCharitableDonation));
    
    const taxResult = calculateIncomeTax(taxableIncome);
    
    const cumulativeTax = calculateCumulativePrepaidTax(workMonths, monthlySalaryIncome, 
        deductions.monthlyBasicDeduction, deductions.monthlyInsuranceDeduction, 
        deductions.monthlySpecialAdditionalTotal, deductions.monthlyPensionDeduction, 
        deductions.monthlyEnterpriseAnnuity, deductions.monthlyInsuranceOtherDeduction, 
        deductions.monthlyTaxDeferredPension);
    
    const bonusTax = calculateBonusTax(bonusIncome, bonusInclude);
    const prepaidTax = determinePrepaidTax(userInputPrepaidTax, cumulativeTax, otherIncome, bonusTax);
    
    const refundTax = taxResult.totalTax - prepaidTax;
    const preTaxIncome = calculatePreTaxIncome(monthlySalaryIncome, workMonths, annualLaborIncome, 
        annualAuthorIncome, annualRoyaltyIncome, bonusIncome);
    const netIncome = preTaxIncome - taxResult.totalTax;
    
    return {
        workMonths,
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
            totalTax: taxResult.totalTax,
            applicableRate: taxResult.applicableRate,
            applicableDeduction: taxResult.applicableDeduction,
            prepaidTax: prepaidTax,
            refundTax: refundTax,
            netIncome: netIncome
        },
        donationBeforeTaxableIncome: donationBeforeTaxableIncome,
        calculationDate: new Date().toISOString()
    };
}

function updateBasicResults(results) {
    document.getElementById('result-total-income').textContent = '¥' + results.incomeDetails.total.toFixed(2);
    document.getElementById('result-total-deduction').textContent = '¥' + results.deductionDetails.total.toFixed(2);
    document.getElementById('result-taxable-income').textContent = '¥' + results.taxDetails.taxableIncome.toFixed(2);
    document.getElementById('result-tax-rate').textContent = (results.taxDetails.applicableRate * 100).toFixed(0) + '%';
    document.getElementById('result-deduction-amount').textContent = '¥' + results.taxDetails.applicableDeduction.toFixed(2);
    document.getElementById('result-total-tax').textContent = '¥' + results.taxDetails.totalTax.toFixed(2);
}

function updateBonusDisplay(results) {
    const bonusDisplay = document.getElementById('bonus-tax-display');
    if (!bonusDisplay) return;
    
    if (results.incomeDetails.bonus > 0) {
        bonusDisplay.style.display = 'block';
        const bonusTaxAmountElement = document.getElementById('bonus-tax-amount');
        const bonusMethodElement = document.getElementById('bonus-method');
        
        if (bonusTaxAmountElement) {
            bonusTaxAmountElement.textContent = '¥' + results.incomeDetails.bonusTax.toFixed(2);
        }
        if (bonusMethodElement) {
            bonusMethodElement.textContent = results.incomeDetails.bonusInclude ? '并入综合所得计税' : '单独计税';
        }
    } else {
        bonusDisplay.style.display = 'none';
    }
}

function updateThresholdWarning(results) {
    const thresholdWarningDisplay = document.getElementById('threshold-warning-display');
    if (!thresholdWarningDisplay) return;
    
    const thresholdResult = checkTaxBracketThreshold(results.taxDetails.taxableIncome);
    
    if (thresholdResult.warning) {
        thresholdWarningDisplay.style.display = 'block';
        safeSetTextContent('threshold-warning-message', thresholdResult.message);
        safeSetTextContent('threshold-current-rate', (thresholdResult.currentRate * 100).toFixed(0) + '%');
        safeSetTextContent('threshold-next-rate', (thresholdResult.nextRate * 100).toFixed(0) + '%');
        safeSetTextContent('threshold-remaining', '¥' + thresholdResult.remaining.toFixed(2));
    } else {
        thresholdWarningDisplay.style.display = 'none';
    }
}

function updateDonationWarning(results) {
    const donationWarningDisplay = document.getElementById('donation-warning-display');
    if (!donationWarningDisplay) return;
    
    const donationResult = validateCharitableDonation(
        results.deductionDetails.charitableDonation, 
        results.donationBeforeTaxableIncome
    );
    
    if (donationResult.isExcess) {
        donationWarningDisplay.style.display = 'block';
        safeSetTextContent('donation-warning-message', donationResult.message);
        safeSetTextContent('donation-max-amount', '¥' + donationResult.maxDeduction.toFixed(2));
        safeSetTextContent('donation-actual-amount', '¥' + donationResult.actualDeduction.toFixed(2));
        safeSetTextContent('donation-excess-amount', '¥' + donationResult.excessAmount.toFixed(2));
    } else {
        donationWarningDisplay.style.display = 'none';
    }
}

function updateOptimalBonusDisplay(results) {
    const optimalBonusDisplay = document.getElementById('optimal-bonus-display');
    if (!optimalBonusDisplay) return;
    
    const optimalResult = calculateOptimalBonusAllocation(
        results.incomeDetails.total, 
        results.deductionDetails.total
    );
    
    if (optimalResult.taxSavings >= 0 && optimalResult.optimalMethod === 'include') {
        optimalBonusDisplay.style.display = 'block';
        safeSetTextContent('optimal-bonus-amount', '¥0（并入综合所得）');
        safeSetTextContent('optimal-salary-amount', '¥' + optimalResult.optimalSalary.toFixed(2));
        safeSetTextContent('optimal-tax-savings', '¥0（已是最佳方案）');
        safeSetTextContent('optimal-original-tax', '¥' + optimalResult.allInTax.toFixed(2));
        safeSetTextContent('optimal-new-tax', '¥' + optimalResult.minTax.toFixed(2));
    } else if (optimalResult.taxSavings > 0) {
        optimalBonusDisplay.style.display = 'block';
        safeSetTextContent('optimal-bonus-amount', '¥' + optimalResult.optimalBonus.toFixed(2));
        safeSetTextContent('optimal-salary-amount', '¥' + optimalResult.optimalSalary.toFixed(2));
        safeSetTextContent('optimal-tax-savings', '¥' + optimalResult.taxSavings.toFixed(2));
        safeSetTextContent('optimal-original-tax', '¥' + optimalResult.allInTax.toFixed(2));
        safeSetTextContent('optimal-new-tax', '¥' + optimalResult.minTax.toFixed(2));
    } else {
        optimalBonusDisplay.style.display = 'none';
    }
}

function updatePrepaidAndRefundTax(results) {
    const resultPrepaidTaxElement = document.getElementById('result-prepaid-tax');
    if (resultPrepaidTaxElement) {
        resultPrepaidTaxElement.textContent = '¥' + results.taxDetails.prepaidTax.toFixed(2);
    }
    
    const refundTaxElement = document.getElementById('result-refund-tax');
    if (refundTaxElement) {
        const refundTax = results.taxDetails.refundTax;
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
}

function updateNetIncome(results) {
    const resultNetIncomeElement = document.getElementById('result-net-income');
    if (resultNetIncomeElement) {
        resultNetIncomeElement.textContent = '¥' + results.taxDetails.netIncome.toFixed(2);
    }
}

function updateTaxResultsUI(results) {
    updateBasicResults(results);
    updateBonusDisplay(results);
    updateThresholdWarning(results);
    updateDonationWarning(results);
    updateOptimalBonusDisplay(results);
    updatePrepaidAndRefundTax(results);
    updateNetIncome(results);
}

function handleCalculationError(error) {
    console.error('计算过程中出现错误:', error);
    showAlert('计算过程中出现错误：' + error.message);
}

// 计算综合所得应纳税额
function calculateTax() {
    try {
        const inputData = collectTaxInputData();
        const calculationData = performTaxCalculation(inputData);
        calculationResults = calculationData;
        updateTaxResultsUI(calculationResults);
    } catch (error) {
        handleCalculationError(error);
    }
}

// 计算反向倒算扣除项
function calculateReverseDeductions(inputData) {
    const basicDeduction = 5000;
    
    const isSpecialDeductionVisible = document.getElementById('reverse-special-deduction-checkbox')?.checked;
    const isSpecialAdditionalDeductionVisible = document.getElementById('reverse-special-additional-deduction-checkbox')?.checked;
    const isOtherDeductionVisible = document.getElementById('reverse-other-deduction-checkbox')?.checked;
    
    let monthlyPensionInsurance = 0;
    let monthlyMedicalInsurance = 0;
    let monthlyUnemploymentInsurance = 0;
    let monthlyHousingFund = 0;
    let specialDeduction = 0;
    if (isSpecialDeductionVisible) {
        monthlyPensionInsurance = parseFloat(document.getElementById('reverse-pension-insurance')?.value) || 0;
        monthlyMedicalInsurance = parseFloat(document.getElementById('reverse-medical-insurance')?.value) || 0;
        monthlyUnemploymentInsurance = parseFloat(document.getElementById('reverse-unemployment-insurance')?.value) || 0;
        monthlyHousingFund = parseFloat(document.getElementById('reverse-housing-fund')?.value) || 0;
        specialDeduction = monthlyPensionInsurance + monthlyMedicalInsurance + 
            monthlyUnemploymentInsurance + monthlyHousingFund;
    }
    
    let monthlyChildrenInfantDeduction = 0;
    let monthlyElderlyDeduction = 0;
    let monthlyHousingDeduction = 0;
    let annualEducationDeduction = 0;
    let medicalDeduction = 0;
    let actualMedicalDeduction = 0;
    let annualProfessionalDeduction = 0;
    let educationDegreeAmount = 0;
    let monthlyEducationDeduction = 0;
    let specialAdditionalDeduction = 0;
    if (isSpecialAdditionalDeductionVisible) {
        monthlyChildrenInfantDeduction = parseFloat(document.getElementById('reverse-children-infant-deduction')?.value) || 0;
        monthlyElderlyDeduction = parseFloat(document.getElementById('reverse-elderly-deduction')?.value) || 0;
        
        const housingType = document.getElementById('reverse-housing-type')?.value;
        if (housingType === 'rent') {
            monthlyHousingDeduction = parseFloat(document.getElementById('reverse-rent-deduction')?.value) || 0;
        } else if (housingType === 'loan') {
            monthlyHousingDeduction = parseFloat(document.getElementById('reverse-housing-loan-deduction')?.value) || 0;
        }

        annualEducationDeduction = parseFloat(document.getElementById('reverse-education-deduction')?.value) || 0;
        medicalDeduction = parseFloat(document.getElementById('reverse-medical-deduction')?.value) || 0;
        actualMedicalDeduction = medicalDeduction > 15000 ? Math.min(medicalDeduction - 15000, 80000) : 0;
        
        if (document.getElementById('reverse-education-professional-checkbox')?.checked) {
            annualProfessionalDeduction = 3600;
        }
        
        educationDegreeAmount = annualEducationDeduction - annualProfessionalDeduction;
        monthlyEducationDeduction = educationDegreeAmount / inputData.workMonths;
        specialAdditionalDeduction = monthlyChildrenInfantDeduction + monthlyElderlyDeduction + 
            monthlyHousingDeduction + monthlyEducationDeduction;
    }
    
    let monthlyPensionDeduction = 0;
    let monthlyEnterpriseAnnuity = 0;
    let monthlyInsuranceOtherDeduction = 0;
    let monthlyTaxDeferredPension = 0;
    let otherDeduction = 0;
    const isPensionDeductionChecked = isOtherDeductionVisible && 
        document.getElementById('reverse-pension-deduction-checkbox')?.checked;
    monthlyPensionDeduction = isPensionDeductionChecked ? 
        (parseFloat(document.getElementById('reverse-pension-deduction')?.value) || 0) : 0;
    const isEnterpriseAnnuityChecked = isOtherDeductionVisible && 
        document.getElementById('reverse-enterprise-annuity-checkbox')?.checked;
    monthlyEnterpriseAnnuity = isEnterpriseAnnuityChecked ? 
        (parseFloat(document.getElementById('reverse-enterprise-annuity')?.value) || 0) : 0;
    const isInsuranceOtherDeductionChecked = isOtherDeductionVisible && 
        document.getElementById('reverse-insurance-other-deduction-checkbox')?.checked;
    monthlyInsuranceOtherDeduction = isInsuranceOtherDeductionChecked ? 
        (parseFloat(document.getElementById('reverse-insurance-other-deduction')?.value) || 0) : 0;
    const isTaxDeferredPensionChecked = isOtherDeductionVisible && 
        document.getElementById('reverse-tax-deferred-pension-checkbox')?.checked;
    monthlyTaxDeferredPension = isTaxDeferredPensionChecked ? 
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
        monthlyBasicDeduction: basicDeduction,
        monthlyPensionInsurance,
        monthlyMedicalInsurance,
        monthlyUnemploymentInsurance,
        monthlyHousingFund,
        monthlyElderlyDeduction,
        monthlyChildrenInfantDeduction,
        monthlyHousingDeduction,
        annualEducationDeduction,
        annualMedicalDeduction: medicalDeduction,
        annualProfessionalDeduction,
        actualMedicalDeduction,
        educationDegreeAmount,
        monthlyEducationDeduction,
        monthlyPensionDeduction,
        monthlyEnterpriseAnnuity,
        monthlyInsuranceOtherDeduction,
        monthlyTaxDeferredPension,
        annualCharitableDonation,
        monthlySpecialAdditionalTotal: specialAdditionalDeduction,
        annualSpecialAdditionalTotal: specialAdditionalDeduction * inputData.workMonths + annualProfessionalDeduction + actualMedicalDeduction,
        annualOtherDeductionTotal: otherDeduction * inputData.workMonths + annualCharitableDonation,
        monthlyInsuranceDeduction: specialDeduction,
        annualSpecialDeductionTotal: specialDeduction * inputData.workMonths,
        basicDeduction,
        specialDeduction,
        specialAdditionalDeduction,
        otherDeduction,
        monthlyTotalDeduction,
        totalDeduction
    };
}

// 计算经营所得反向倒算扣除项
function calculateBusinessReverseDeductions(inputData) {
    const hasComprehensiveIncome = document.getElementById('reverse-business-has-comprehensive-income')?.checked ?? false;
    const investorDeduction = hasComprehensiveIncome ? 0 : 60000;
    
    let businessIncome = 0;
    let businessCost = 0;
    let businessExpenses = 0;
    let businessTaxes = 0;
    let businessLosses = 0;
    let businessOtherExpenses = 0;
    let businessPreviousLosses = 0;
    
    const isBusinessDeductionVisible = document.getElementById('reverse-business-deduction-checkbox')?.checked;
    if (isBusinessDeductionVisible) {
        businessCost = parseFloat(document.getElementById('reverse-business-cost')?.value) || 0;
        businessExpenses = parseFloat(document.getElementById('reverse-business-expenses')?.value) || 0;
        businessTaxes = parseFloat(document.getElementById('reverse-business-taxes')?.value) || 0;
        businessLosses = parseFloat(document.getElementById('reverse-business-losses')?.value) || 0;
        businessOtherExpenses = parseFloat(document.getElementById('reverse-business-other-expenses')?.value) || 0;
        businessPreviousLosses = parseFloat(document.getElementById('reverse-business-previous-losses')?.value) || 0;
    }
    
    let specialAdditionalDeduction = 0;
    let otherDeduction = 0;
    const isSpecialAdditionalDeductionVisible = document.getElementById('reverse-special-additional-deduction-checkbox')?.checked;
    if (isSpecialAdditionalDeductionVisible) {
        specialAdditionalDeduction = parseFloat(document.getElementById('reverse-business-special-additional-deduction')?.value) || 0;
    }
    
    const isOtherDeductionVisible = document.getElementById('reverse-other-deduction-checkbox')?.checked;
    if (isOtherDeductionVisible) {
        otherDeduction = parseFloat(document.getElementById('reverse-business-other-deduction')?.value) || 0;
    }
    
    const annualBusinessDeduction = businessCost + businessExpenses + businessTaxes + 
        businessLosses + businessOtherExpenses + businessPreviousLosses + 
        investorDeduction + specialAdditionalDeduction + otherDeduction;
    
    return {
        hasComprehensiveIncome,
        investorDeduction,
        businessCost,
        businessExpenses,
        businessTaxes,
        businessLosses,
        businessOtherExpenses,
        businessPreviousLosses,
        specialAdditionalDeduction,
        otherDeduction,
        annualBusinessDeduction,
        totalDeduction: annualBusinessDeduction
    };
}

// 计算经营所得年终奖税额（经营所得不涉及年终奖，返回0）
function calculateBusinessReverseBonusTax(inputData) {
    return 0;
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
function calculateFromTargetRate(inputData, deductionData, bonusTax, mode = 'conservative') {
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
    
    // 步骤5：根据计算模式确定参考应纳税所得额
    // 保守模式（conservative）：最低值+1，确保达到目标税率（仅对最低档位设置小额最低值）
    // 均衡模式（balanced）：区间中间值，反映平均税负水平
    // 进取模式（aggressive）：最高值，接近上限的税负水平
    let middleTaxableIncome;
    // 仅对最低税率档位设置合理最低值，保持对所有收入群体的适用性
    // 3%档位设置1元作为最低基准（应纳税所得额1-36000元适用3%税率）
    // 其他档位使用原值+1，确保精确性和适用性
    const minimumTaxableIncome = minTaxableIncome === 0 ? 1 : minTaxableIncome + 1;
    
    if (maxTaxableIncome === Infinity) {
        // 最高档位：根据模式调整
        switch(mode) {
            case 'conservative':
                middleTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                break;
            case 'balanced':
                middleTaxableIncome = minTaxableIncome + 100000;
                break;
            case 'aggressive':
                middleTaxableIncome = minTaxableIncome + 200000;
                break;
            default:
                middleTaxableIncome = minTaxableIncome + 100000;
        }
    } else {
        switch(mode) {
            case 'conservative':
                middleTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                break;
            case 'balanced':
                middleTaxableIncome = (minTaxableIncome + maxTaxableIncome) / 2;
                break;
            case 'aggressive':
                middleTaxableIncome = maxTaxableIncome;
                break;
            default:
                middleTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
        }
    }
    
    // 确保应纳税所得额非负
    middleTaxableIncome = Math.max(0, middleTaxableIncome);
    
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
        taxableIncomeRange: {
            min: minTaxableIncome,
            max: maxTaxableIncome
        },
        applicableRate: targetBracket.rate,
        applicableDeduction: targetBracket.deduction,
        isRateMode: true,
        modeName: '税率倒算',
        calculationMode: mode,
        bracketInfo: {
            rate: targetBracket.rate,
            min: minTaxableIncome,
            max: maxTaxableIncome,
            deduction: targetBracket.deduction
        }
    };
}

// 方式2：按月度税后收入倒算（给定税后收入，计算税前收入）
// 核心逻辑：
// 已知：税后收入 = 税前收入 - 应纳税额 - 年终奖税额
// 使用二分法求解税前收入，支持三种计算模式
function calculateFromMonthlyNet(inputData, deductionData, bonusTax, mode = 'balanced') {
    const monthlyNet = inputData.monthlyNet;
    const workMonths = inputData.workMonths;
    
    // 步骤1：计算年度目标税后收入
    // 公式：年度税后收入 = 月度税后收入 × 工作月数
    const annualNetTarget = monthlyNet * workMonths;
    
    // 步骤2：使用二分法求解基准应纳税所得额
    // 搜索范围：[扣除总额, 扣除总额 + 10,000,000]
    let left = deductionData.totalDeduction;
    let right = deductionData.totalDeduction + 10000000;
    const precision = 0.01;
    
    let baseTaxableIncome = 0;
    
    while (right - left > precision) {
        const mid = (left + right) / 2;
        const taxableIncome = mid - deductionData.totalDeduction;
        
        if (taxableIncome <= 0) {
            left = mid;
            continue;
        }
        
        const taxResult = calculateTaxByTaxableIncome(taxableIncome);
        const comprehensiveTax = taxResult.tax;
        const netIncome = mid - comprehensiveTax - bonusTax;
        
        if (netIncome < annualNetTarget) {
            left = mid;
        } else {
            right = mid;
        }
    }
    
    baseTaxableIncome = (left + right) / 2 - deductionData.totalDeduction;
    baseTaxableIncome = Math.max(0, baseTaxableIncome);
    
    // 步骤3：确定基准应纳税所得额所在的税率档位
    let targetBracket = null;
    for (const bracket of comprehensiveTaxRates) {
        if (baseTaxableIncome <= bracket.max) {
            targetBracket = bracket;
            break;
        }
    }
    if (!targetBracket) {
        targetBracket = comprehensiveTaxRates[comprehensiveTaxRates.length - 1];
    }
    
    // 步骤4：根据计算模式确定应纳税所得额
    // 保守模式：档位下限+1
    // 均衡模式：档位中间值
    // 进取模式：档位上限（或最大值）
    const minTaxableIncome = targetBracket.min || 0;
    const maxTaxableIncome = targetBracket.max === Infinity ? 10000000 : targetBracket.max;
    
    let modeTaxableIncome;
    // 3%档位设置1元作为最低基准（应纳税所得额1-36000元适用3%税率）
    const minimumTaxableIncome = minTaxableIncome === 0 ? 1 : minTaxableIncome + 1;
    
    if (maxTaxableIncome === Infinity) {
        // 最高档位：基于基准应纳税所得额调整
        switch(mode) {
            case 'conservative':
                modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                break;
            case 'balanced':
                // 均衡模式：使用二分法算出的基准值
                modeTaxableIncome = baseTaxableIncome;
                break;
            case 'aggressive':
                // 进取模式：确保不低于基准值，且至少比下限高20万
                modeTaxableIncome = Math.max(baseTaxableIncome, minTaxableIncome + 200000);
                break;
            default:
                modeTaxableIncome = baseTaxableIncome;
        }
    } else {
        switch(mode) {
            case 'conservative':
                modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                break;
            case 'balanced':
                modeTaxableIncome = (minTaxableIncome + maxTaxableIncome) / 2;
                break;
            case 'aggressive':
                modeTaxableIncome = maxTaxableIncome;
                break;
            default:
                modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
        }
    }
    
    // 确保应纳税所得额非负
    modeTaxableIncome = Math.max(0, modeTaxableIncome);
    
    // 步骤5：计算对应的税前收入
    const preTaxIncome = modeTaxableIncome + deductionData.totalDeduction;
    let totalIncome;
    
    if (inputData.bonusIncome > 0) {
        totalIncome = preTaxIncome + inputData.bonusIncome;
    } else {
        totalIncome = preTaxIncome;
    }
    
    // 步骤6：计算税额
    const taxResult = calculateTaxByTaxableIncome(modeTaxableIncome);
    const comprehensiveTax = taxResult.tax;
    const finalTotalTax = comprehensiveTax + bonusTax;
    const calculatedNetIncome = totalIncome - finalTotalTax;
    
    return {
        totalIncome: totalIncome,
        monthlyIncome: totalIncome / workMonths,
        finalTotalTax: finalTotalTax,
        calculatedNetIncome: calculatedNetIncome,
        monthlyNet: calculatedNetIncome / workMonths,
        taxableIncome: modeTaxableIncome,
        applicableRate: taxResult.rate,
        applicableDeduction: taxResult.deduction,
        isMonthlyMode: true,
        modeName: '月度税后倒算',
        calculationMode: mode,
        bracketInfo: {
            rate: targetBracket.rate,
            min: minTaxableIncome,
            max: maxTaxableIncome,
            deduction: targetBracket.deduction
        }
    };
}

// 方式3：按目标税额倒算（给定目标税额，计算所需税前收入）
// 核心逻辑：
// 已知：税额 = 应纳税所得额 × 税率 - 速算扣除数
// 使用二分法求解应纳税所得额，然后计算税前收入，支持三种计算模式
function calculateFromTargetTax(inputData, deductionData, bonusTax, mode = 'balanced') {
    const targetTax = inputData.fixedTax;
    const targetNet = inputData.fixedNet;
    
    // 情况A：仅输入目标税额
    if (targetTax > 0 && targetNet === 0) {
        // 步骤1：使用二分法求解基准应纳税所得额
        let left = deductionData.totalDeduction;
        let right = deductionData.totalDeduction + 10000000;
        const precision = 0.01;
        
        let baseTaxableIncome = 0;
        
        while (right - left > precision) {
            const mid = (left + right) / 2;
            const taxable = mid - deductionData.totalDeduction;
            
            if (taxable <= 0) {
                left = mid;
                continue;
            }
            
            const taxResult = calculateTaxByTaxableIncome(taxable);
            const currentTax = taxResult.tax + bonusTax;
            
            if (currentTax < targetTax) {
                left = mid;
            } else {
                right = mid;
            }
        }
        
        baseTaxableIncome = (left + right) / 2 - deductionData.totalDeduction;
        baseTaxableIncome = Math.max(0, baseTaxableIncome);
        
        // 步骤2：确定基准应纳税所得额所在的税率档位
        let targetBracket = null;
        for (const bracket of comprehensiveTaxRates) {
            if (baseTaxableIncome <= bracket.max) {
                targetBracket = bracket;
                break;
            }
        }
        if (!targetBracket) {
            targetBracket = comprehensiveTaxRates[comprehensiveTaxRates.length - 1];
        }
        
        // 步骤3：根据计算模式确定应纳税所得额
        const minTaxableIncome = targetBracket.min || 0;
        const maxTaxableIncome = targetBracket.max === Infinity ? 10000000 : targetBracket.max;
        
        let modeTaxableIncome;
        // 3%档位设置1元作为最低基准（应纳税所得额1-36000元适用3%税率）
        const minimumTaxableIncome = minTaxableIncome === 0 ? 1 : minTaxableIncome + 1;
        
        if (maxTaxableIncome === Infinity) {
            // 最高档位：基于基准应纳税所得额调整
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                    break;
                case 'balanced':
                    // 均衡模式：使用二分法算出的基准值
                    modeTaxableIncome = baseTaxableIncome;
                    break;
                case 'aggressive':
                    // 进取模式：确保不低于基准值，且至少比下限高20万
                    modeTaxableIncome = Math.max(baseTaxableIncome, minTaxableIncome + 200000);
                    break;
                default:
                    modeTaxableIncome = baseTaxableIncome;
            }
        } else {
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                    break;
                case 'balanced':
                    modeTaxableIncome = (minTaxableIncome + maxTaxableIncome) / 2;
                    break;
                case 'aggressive':
                    modeTaxableIncome = maxTaxableIncome;
                    break;
                default:
                    modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
            }
        }
        
        modeTaxableIncome = Math.max(0, modeTaxableIncome);
        
        // 步骤4：计算对应的税前收入
        const preTaxIncome = modeTaxableIncome + deductionData.totalDeduction;
        let totalIncome;
        
        if (inputData.bonusIncome > 0) {
            totalIncome = preTaxIncome + inputData.bonusIncome;
        } else {
            totalIncome = preTaxIncome;
        }
        
        // 步骤5：计算实际税额
        const taxResult = calculateTaxByTaxableIncome(modeTaxableIncome);
        const actualTax = taxResult.tax + bonusTax;
        
        return {
            totalIncome: totalIncome,
            finalTotalTax: actualTax,
            calculatedNetIncome: totalIncome - actualTax,
            taxableIncome: modeTaxableIncome,
            applicableRate: taxResult.rate,
            applicableDeduction: taxResult.deduction,
            isTaxMode: true,
            modeName: '税额倒算',
            calculationMode: mode,
            bracketInfo: {
                rate: targetBracket.rate,
                min: minTaxableIncome,
                max: maxTaxableIncome,
                deduction: targetBracket.deduction
            },
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
        
        let deductionData;
        if (inputData.incomeType === 'business') {
            deductionData = calculateBusinessReverseDeductions(inputData);
        } else {
            deductionData = calculateReverseDeductions(inputData);
        }
        
        let result;
        let allModeResults = {}; // 存储三种模式的结果
        
        if (inputData.incomeType === 'business') {
            if (inputData.reverseType === 'rate') {
                // 计算三种模式的结果
                allModeResults.conservative = calculateBusinessFromTargetRate(inputData, deductionData, 'conservative');
                allModeResults.balanced = calculateBusinessFromTargetRate(inputData, deductionData, 'balanced');
                allModeResults.aggressive = calculateBusinessFromTargetRate(inputData, deductionData, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    // 全部模式：使用均衡模式作为默认显示，但保存所有结果
                    result = allModeResults.balanced;
                } else {
                    // 使用用户选择的模式
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            } else if (inputData.reverseType === 'monthly') {
                // 计算三种模式的结果
                allModeResults.conservative = calculateBusinessFromMonthlyNet(inputData, deductionData, 'conservative');
                allModeResults.balanced = calculateBusinessFromMonthlyNet(inputData, deductionData, 'balanced');
                allModeResults.aggressive = calculateBusinessFromMonthlyNet(inputData, deductionData, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    result = allModeResults.balanced;
                } else {
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            } else {
                // 计算三种模式的结果
                allModeResults.conservative = calculateBusinessFromTargetTax(inputData, deductionData, 'conservative');
                allModeResults.balanced = calculateBusinessFromTargetTax(inputData, deductionData, 'balanced');
                allModeResults.aggressive = calculateBusinessFromTargetTax(inputData, deductionData, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    result = allModeResults.balanced;
                } else {
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            }
        } else {
            const bonusTax = calculateReverseBonusTax(inputData);
            if (inputData.reverseType === 'rate') {
                // 计算三种模式的结果
                allModeResults.conservative = calculateFromTargetRate(inputData, deductionData, bonusTax, 'conservative');
                allModeResults.balanced = calculateFromTargetRate(inputData, deductionData, bonusTax, 'balanced');
                allModeResults.aggressive = calculateFromTargetRate(inputData, deductionData, bonusTax, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    // 全部模式：使用均衡模式作为默认显示，但保存所有结果
                    result = allModeResults.balanced;
                } else {
                    // 使用用户选择的模式
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            } else if (inputData.reverseType === 'monthly') {
                // 计算三种模式的结果
                allModeResults.conservative = calculateFromMonthlyNet(inputData, deductionData, bonusTax, 'conservative');
                allModeResults.balanced = calculateFromMonthlyNet(inputData, deductionData, bonusTax, 'balanced');
                allModeResults.aggressive = calculateFromMonthlyNet(inputData, deductionData, bonusTax, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    result = allModeResults.balanced;
                } else {
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            } else {
                // 计算三种模式的结果
                allModeResults.conservative = calculateFromTargetTax(inputData, deductionData, bonusTax, 'conservative');
                allModeResults.balanced = calculateFromTargetTax(inputData, deductionData, bonusTax, 'balanced');
                allModeResults.aggressive = calculateFromTargetTax(inputData, deductionData, bonusTax, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    result = allModeResults.balanced;
                } else {
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            }
        }
        
        // 保存结果（包含所有模式的结果和用户选择的模式）
        saveReverseCalculationResult(result, inputData, deductionData, result.finalTotalTax, allModeResults);
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
    const calcMode = document.getElementById('reverse-calc-mode')?.value || 'conservative';
    
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
        calcMode,
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
function saveReverseCalculationResult(result, inputData, deductionData, bonusTax, allModeResults = {}) {
    reverseCalculationResults = {
        incomeType: inputData.incomeType,
        reverseType: inputData.reverseType,
        workMonths: inputData.workMonths,
        calcMode: inputData.calcMode,
        totalIncome: result.totalIncome,
        totalDeduction: deductionData.totalDeduction,
        totalTax: result.finalTotalTax,
        allModeResults: allModeResults, // 保存所有模式的结果
        incomeDetails: {
            total: result.totalIncome,
            minTotal: result.minTotalIncome,
            maxTotal: result.maxTotalIncome,
            monthly: result.monthlyIncome
        },
        deductionDetails: {
            basic: deductionData.monthlyBasicDeduction,
            pensionInsurance: deductionData.monthlyPensionInsurance,
            medicalInsurance: deductionData.monthlyMedicalInsurance,
            unemploymentInsurance: deductionData.monthlyUnemploymentInsurance,
            housingFund: deductionData.monthlyHousingFund,
            elderly: deductionData.monthlyElderlyDeduction,
            childrenInfant: deductionData.monthlyChildrenInfantDeduction,
            housing: deductionData.monthlyHousingDeduction,
            education: deductionData.annualEducationDeduction,
            medical: deductionData.annualMedicalDeduction,
            professional: deductionData.annualProfessionalDeduction,
            actualMedical: deductionData.actualMedicalDeduction,
            educationDegree: deductionData.monthlyEducationDeduction,
            pension: deductionData.monthlyPensionDeduction,
            enterpriseAnnuity: deductionData.monthlyEnterpriseAnnuity,
            insuranceOther: deductionData.monthlyInsuranceOtherDeduction,
            taxDeferredPension: deductionData.monthlyTaxDeferredPension,
            charitableDonation: deductionData.annualCharitableDonation,
            specialAdditionalTotal: deductionData.annualSpecialAdditionalTotal,
            specialDeductionTotal: deductionData.annualSpecialDeductionTotal,
            otherTotal: deductionData.annualOtherDeductionTotal,
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
        // 按目标税率倒算：显示范围
        if (result.isRateMode && result.minTotalIncome !== undefined) {
            const minStr = isFinite(result.minTotalIncome) ? '¥' + result.minTotalIncome.toFixed(2) : '¥0';
            const maxStr = isFinite(result.maxTotalIncome) ? '¥' + result.maxTotalIncome.toFixed(2) : '无上限';
            const midStr = isFinite(result.totalIncome) ? '¥' + result.totalIncome.toFixed(2) : '¥0';
            totalIncomeEl.innerHTML = 
                `${minStr} - ${maxStr}` +
                `<br><span style="font-size: 14px; color: #666;">(中间值: ${midStr})</span>`;
        } else {
            // 月度税后倒算、目标税额倒算：只显示数值
            const incomeValue = isFinite(result.totalIncome) ? result.totalIncome : 0;
            totalIncomeEl.textContent = '¥' + incomeValue.toFixed(2);
        }
    }
    if (netIncomeEl) {
        const netValue = isFinite(result.calculatedNetIncome) ? result.calculatedNetIncome : 0;
        netIncomeEl.textContent = '¥' + netValue.toFixed(2);
    }
    if (rateEl) {
        rateEl.textContent = (result.applicableRate * 100).toFixed(0) + '%';
    }
    if (deductionEl) {
        deductionEl.textContent = '¥' + result.applicableDeduction.toFixed(2);
    }
    if (taxableIncomeEl) {
        const taxableValue = isFinite(result.taxableIncome) ? result.taxableIncome : 0;
        taxableIncomeEl.textContent = '¥' + taxableValue.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
    if (totalDeductionEl) {
        totalDeductionEl.textContent = '¥' + data.deductionDetails.total.toFixed(2);
    }
    
    // 更新三种计算模式对比表格
    updateReverseModeComparisonTable(data);
}

// 更新三种计算模式对比表格
function updateReverseModeComparisonTable(data) {
    const comparisonSection = document.getElementById('reverse-mode-comparison-section');
    const singleModeSection = document.getElementById('reverse-single-mode-section');
    const tableBody = document.getElementById('reverse-mode-comparison-body');
    const singleTaxSection = document.getElementById('reverse-single-tax-section');
    
    if (!comparisonSection || !singleModeSection || !tableBody) return;
    
    const allModeResults = data.allModeResults || {};
    const selectedMode = data.calcMode || 'all';
    
    const modeNames = {
        all: '📊 全部模式',
        conservative: '🌱 保守模式',
        balanced: '⚖️ 均衡模式',
        aggressive: '🚀 进取模式'
    };
    
    // 根据用户选择决定显示内容
    if (selectedMode === 'all') {
        // 全部模式：显示对比表格，隐藏单个模式显示和顶部税额行
        comparisonSection.classList.remove('hidden');
        singleModeSection.classList.add('hidden');
        if (singleTaxSection) {
            singleTaxSection.classList.add('hidden');
        }
        
        // 清空表格
        tableBody.innerHTML = '';
        
        if (Object.keys(allModeResults).length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-4">正在计算...</td></tr>';
            return;
        }
        
        // 添加三种模式的数据
        const modeOrder = ['conservative', 'balanced', 'aggressive'];
        const modeDescriptions = {
            conservative: '最低门槛',
            balanced: '区间均值',
            aggressive: '接近上限'
        };
        
        modeOrder.forEach((mode, index) => {
            const modeResult = allModeResults[mode];
            if (!modeResult) return;
            
            const netIncome = modeResult.totalIncome - modeResult.finalTotalTax;
            
            const row = document.createElement('tr');
            row.className = index % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-white';
            
            row.innerHTML = `
                <td class="px-3 py-2">
                    <div class="flex flex-col">
                        <span class="font-medium text-gray-800">${modeNames[mode]}</span>
                        <span class="text-xs text-gray-500">${modeDescriptions[mode]}</span>
                    </div>
                </td>
                <td class="px-3 py-2 text-right font-medium text-gray-700">
                    ¥${isFinite(modeResult.taxableIncome) ? modeResult.taxableIncome.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}
                </td>
                <td class="px-3 py-2 text-right font-medium text-blue-600">
                    ¥${isFinite(modeResult.totalIncome) ? modeResult.totalIncome.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}
                </td>
                <td class="px-3 py-2 text-right font-medium text-red-600">
                    ¥${isFinite(modeResult.finalTotalTax) ? modeResult.finalTotalTax.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}
                </td>
                <td class="px-3 py-2 text-right font-medium text-green-600">
                    ¥${isFinite(netIncome) ? netIncome.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    } else {
        // 单个模式：隐藏对比表格，显示单个模式结果和顶部税额行
        comparisonSection.classList.add('hidden');
        singleModeSection.classList.remove('hidden');
        if (singleTaxSection) {
            singleTaxSection.classList.remove('hidden');
        }
    }
}

// 辅助函数：根据应纳税所得额和税率表计算经营所得税额
function calculateBusinessTaxByTaxableIncome(taxableIncome) {
    if (taxableIncome <= 0) return { tax: 0, rate: 0, deduction: 0 };
    
    for (const bracket of businessTaxRates) {
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

// 经营所得反向倒算：按目标税率倒算
function calculateBusinessFromTargetRate(inputData, deductionData, mode = 'conservative') {
    const targetRate = inputData.targetRate / 100;
    
    const targetBracket = businessTaxRates.find(
        bracket => Math.abs(bracket.rate - targetRate) < 0.001
    );
    
    if (!targetBracket) {
        throw new Error('找不到对应的经营所得税率级距');
    }
    
    const minTaxableIncome = targetBracket.min || 0;
    const maxTaxableIncome = targetBracket.max;
    
    // 根据计算模式确定参考应纳税所得额
    // 保守模式（conservative）：最低值+1，确保达到目标税率（仅对最低档位设置小额最低值）
    // 均衡模式（balanced）：区间中间值，反映平均税负水平
    // 进取模式（aggressive）：最高值-1，接近上限的税负水平
    let middleTaxableIncome;
    // 仅对最低税率档位设置合理最低值，保持对所有收入群体的适用性
    // 5%档位设置12,000元（每月1,000元）作为最低基准，避免1元等不合理数值
    // 其他档位使用原值+1，确保精确性和适用性
    const minimumTaxableIncome = minTaxableIncome === 0 ? 12000 : minTaxableIncome + 1;
    
    if (maxTaxableIncome === Infinity) {
        // 最高档位：根据模式调整
        switch(mode) {
            case 'conservative':
                middleTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                break;
            case 'balanced':
                middleTaxableIncome = minTaxableIncome + 100000;
                break;
            case 'aggressive':
                middleTaxableIncome = minTaxableIncome + 200000;
                break;
            default:
                middleTaxableIncome = minTaxableIncome + 100000;
        }
    } else {
        switch(mode) {
            case 'conservative':
                middleTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                break;
            case 'balanced':
                middleTaxableIncome = (minTaxableIncome + maxTaxableIncome) / 2;
                break;
            case 'aggressive':
                middleTaxableIncome = maxTaxableIncome;
                break;
            default:
                middleTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
        }
    }
    
    // 确保应纳税所得额非负
    middleTaxableIncome = Math.max(0, middleTaxableIncome);
    
    // 经营所得：应纳税额 = 应纳税所得额 × 税率 - 速算扣除数
    const taxResult = calculateBusinessTaxByTaxableIncome(middleTaxableIncome);
    
    // 计算减半征收
    const halvingThreshold = 2000000;
    const halvingTaxable = Math.min(middleTaxableIncome, halvingThreshold);
    const halvingTax = halvingTaxable > 0 ? (halvingTaxable * targetBracket.rate - targetBracket.deduction) * 0.5 : 0;
    
    // 实际税额（考虑减半征收）
    const actualTax = taxResult.tax > 0 ? Math.max(0, taxResult.tax - halvingTax) : 0;
    
    // 税前收入 = 应纳税所得额 + 扣除总额
    const preTaxIncome = middleTaxableIncome + deductionData.totalDeduction;
    const netIncome = preTaxIncome - actualTax;
    
    return {
        totalIncome: preTaxIncome,
        minTotalIncome: minTaxableIncome + deductionData.totalDeduction,
        maxTotalIncome: maxTaxableIncome === Infinity ? Infinity : maxTaxableIncome + deductionData.totalDeduction,
        finalTotalTax: actualTax,
        calculatedNetIncome: netIncome,
        taxableIncome: middleTaxableIncome,
        taxableIncomeRange: {
            min: minTaxableIncome,
            max: maxTaxableIncome
        },
        applicableRate: targetBracket.rate,
        applicableDeduction: targetBracket.deduction,
        isRateMode: true,
        modeName: '经营所得税率倒算',
        calculationMode: mode,
        bracketInfo: {
            rate: targetBracket.rate,
            min: minTaxableIncome,
            max: maxTaxableIncome,
            deduction: targetBracket.deduction
        },
        hasHalvingDiscount: halvingTax > 0,
        halvingTaxAmount: halvingTax
    };
}

// 经营所得反向倒算：按目标税后收入倒算，支持三种计算模式
function calculateBusinessFromMonthlyNet(inputData, deductionData, mode = 'balanced') {
    const monthlyNet = inputData.monthlyNet;
    const workMonths = inputData.workMonths;
    const annualNetTarget = monthlyNet * workMonths;
    
    // 步骤1：使用二分法求解基准应纳税所得额
    let left = deductionData.totalDeduction;
    let right = deductionData.totalDeduction + 10000000;
    const precision = 0.01;
    
    let baseTaxableIncome = 0;
    
    while (right - left > precision) {
        const mid = (left + right) / 2;
        const taxableIncome = mid - deductionData.totalDeduction;
        
        if (taxableIncome <= 0) {
            left = mid;
            continue;
        }
        
        const taxResult = calculateBusinessTaxByTaxableIncome(taxableIncome);
        const halvingThreshold = 2000000;
        const halvingTaxable = Math.min(taxableIncome, halvingThreshold);
        const halvingTax = taxResult.tax > 0 ? (halvingTaxable * taxResult.rate - taxResult.deduction) * 0.5 : 0;
        const actualTax = Math.max(0, taxResult.tax - halvingTax);
        
        const netIncome = mid - actualTax;
        
        if (netIncome < annualNetTarget) {
            left = mid;
        } else {
            right = mid;
        }
    }
    
    baseTaxableIncome = (left + right) / 2 - deductionData.totalDeduction;
    baseTaxableIncome = Math.max(0, baseTaxableIncome);
    
    // 步骤2：确定基准应纳税所得额所在的税率档位
    let targetBracket = null;
    for (const bracket of businessTaxRates) {
        if (baseTaxableIncome <= bracket.max) {
            targetBracket = bracket;
            break;
        }
    }
    if (!targetBracket) {
        targetBracket = businessTaxRates[businessTaxRates.length - 1];
    }
    
    // 步骤3：根据计算模式确定应纳税所得额
    const minTaxableIncome = targetBracket.min || 0;
    const maxTaxableIncome = targetBracket.max === Infinity ? 10000000 : targetBracket.max;
    
    let modeTaxableIncome;
    const minimumTaxableIncome = minTaxableIncome === 0 ? 30000 : minTaxableIncome + 1;
    
    if (maxTaxableIncome === Infinity) {
        // 最高档位：基于基准应纳税所得额调整
        switch(mode) {
            case 'conservative':
                modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                break;
            case 'balanced':
                // 均衡模式：使用二分法算出的基准值
                modeTaxableIncome = baseTaxableIncome;
                break;
            case 'aggressive':
                // 进取模式：确保不低于基准值，且至少比下限高10万
                modeTaxableIncome = Math.max(baseTaxableIncome, minTaxableIncome + 100000);
                break;
            default:
                modeTaxableIncome = baseTaxableIncome;
        }
    } else {
        switch(mode) {
            case 'conservative':
                modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                break;
            case 'balanced':
                modeTaxableIncome = (minTaxableIncome + maxTaxableIncome) / 2;
                break;
            case 'aggressive':
                modeTaxableIncome = maxTaxableIncome;
                break;
            default:
                modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
        }
    }
    
    modeTaxableIncome = Math.max(0, modeTaxableIncome);
    
    // 步骤4：计算对应的收入
    const totalIncome = modeTaxableIncome + deductionData.totalDeduction;
    
    // 步骤5：计算税额
    const taxResult = calculateBusinessTaxByTaxableIncome(modeTaxableIncome);
    const halvingThreshold = 2000000;
    const halvingTaxable = Math.min(modeTaxableIncome, halvingThreshold);
    const halvingTax = taxResult.tax > 0 ? (halvingTaxable * taxResult.rate - taxResult.deduction) * 0.5 : 0;
    const actualTax = Math.max(0, taxResult.tax - halvingTax);
    const calculatedNetIncome = totalIncome - actualTax;
    
    return {
        totalIncome: totalIncome,
        monthlyIncome: totalIncome / workMonths,
        finalTotalTax: actualTax,
        calculatedNetIncome: calculatedNetIncome,
        monthlyNet: calculatedNetIncome / workMonths,
        taxableIncome: modeTaxableIncome,
        applicableRate: taxResult.rate,
        applicableDeduction: taxResult.deduction,
        isMonthlyMode: true,
        modeName: '经营所得月度税后倒算',
        calculationMode: mode,
        bracketInfo: {
            rate: targetBracket.rate,
            min: minTaxableIncome,
            max: maxTaxableIncome,
            deduction: targetBracket.deduction
        },
        hasHalvingDiscount: halvingTax > 0,
        halvingTaxAmount: halvingTax
    };
}

// 经营所得反向倒算：按目标税额倒算，支持三种计算模式
function calculateBusinessFromTargetTax(inputData, deductionData, mode = 'balanced') {
    const targetTax = inputData.fixedTax;
    const targetNet = inputData.fixedNet;
    
    if (targetTax > 0 && targetNet === 0) {
        // 步骤1：使用二分法求解基准应纳税所得额
        let left = deductionData.totalDeduction;
        let right = deductionData.totalDeduction + 10000000;
        const precision = 0.01;
        
        let baseTaxableIncome = 0;
        
        while (right - left > precision) {
            const mid = (left + right) / 2;
            const taxable = mid - deductionData.totalDeduction;
            
            if (taxable <= 0) {
                left = mid;
                continue;
            }
            
            const taxResult = calculateBusinessTaxByTaxableIncome(taxable);
            const halvingThreshold = 2000000;
            const halvingTaxable = Math.min(taxable, halvingThreshold);
            const halvingTax = taxResult.tax > 0 ? (halvingTaxable * taxResult.rate - taxResult.deduction) * 0.5 : 0;
            const actualTax = Math.max(0, taxResult.tax - halvingTax);
            
            if (actualTax < targetTax) {
                left = mid;
            } else {
                right = mid;
            }
        }
        
        baseTaxableIncome = (left + right) / 2 - deductionData.totalDeduction;
        baseTaxableIncome = Math.max(0, baseTaxableIncome);
        
        // 步骤2：确定基准应纳税所得额所在的税率档位
        let targetBracket = null;
        for (const bracket of businessTaxRates) {
            if (baseTaxableIncome <= bracket.max) {
                targetBracket = bracket;
                break;
            }
        }
        if (!targetBracket) {
            targetBracket = businessTaxRates[businessTaxRates.length - 1];
        }
        
        // 步骤3：根据计算模式确定应纳税所得额
        const minTaxableIncome = targetBracket.min || 0;
        const maxTaxableIncome = targetBracket.max === Infinity ? 10000000 : targetBracket.max;
        
        let modeTaxableIncome;
        const minimumTaxableIncome = minTaxableIncome === 0 ? 30000 : minTaxableIncome + 1;
        
        if (maxTaxableIncome === Infinity) {
            // 最高档位：基于基准应纳税所得额调整
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                    break;
                case 'balanced':
                    // 均衡模式：使用二分法算出的基准值
                    modeTaxableIncome = baseTaxableIncome;
                    break;
                case 'aggressive':
                    // 进取模式：确保不低于基准值，且至少比下限高10万
                    modeTaxableIncome = Math.max(baseTaxableIncome, minTaxableIncome + 100000);
                    break;
                default:
                    modeTaxableIncome = baseTaxableIncome;
            }
        } else {
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
                    break;
                case 'balanced':
                    modeTaxableIncome = (minTaxableIncome + maxTaxableIncome) / 2;
                    break;
                case 'aggressive':
                    modeTaxableIncome = maxTaxableIncome;
                    break;
                default:
                    modeTaxableIncome = Math.max(minTaxableIncome + 1, minimumTaxableIncome);
            }
        }
        
        modeTaxableIncome = Math.max(0, modeTaxableIncome);
        
        // 步骤4：计算对应的收入
        const totalIncome = modeTaxableIncome + deductionData.totalDeduction;
        
        // 步骤5：计算税额
        const taxResult = calculateBusinessTaxByTaxableIncome(modeTaxableIncome);
        const halvingThreshold = 2000000;
        const halvingTaxable = Math.min(modeTaxableIncome, halvingThreshold);
        const halvingTax = taxResult.tax > 0 ? (halvingTaxable * taxResult.rate - taxResult.deduction) * 0.5 : 0;
        const actualTax = Math.max(0, taxResult.tax - halvingTax);
        
        return {
            totalIncome: totalIncome,
            finalTotalTax: actualTax,
            calculatedNetIncome: totalIncome - actualTax,
            taxableIncome: modeTaxableIncome,
            applicableRate: taxResult.rate,
            applicableDeduction: taxResult.deduction,
            isTaxMode: true,
            modeName: '经营所得税额倒算',
            calculationMode: mode,
            bracketInfo: {
                rate: targetBracket.rate,
                min: minTaxableIncome,
                max: maxTaxableIncome,
                deduction: targetBracket.deduction
            },
            targetTax: targetTax,
            taxDifference: actualTax - targetTax,
            hasHalvingDiscount: halvingTax > 0,
            halvingTaxAmount: halvingTax
        };
    }
    
    const targetTotalIncome = targetTax + targetNet;
    const targetTaxableIncome = targetTotalIncome - deductionData.totalDeduction;
    
    const taxResult = calculateBusinessTaxByTaxableIncome(targetTaxableIncome);
    const halvingThreshold = 2000000;
    const halvingTaxable = Math.min(targetTaxableIncome, halvingThreshold);
    const halvingTax = taxResult.tax > 0 ? (halvingTaxable * taxResult.rate - taxResult.deduction) * 0.5 : 0;
    const actualTax = Math.max(0, taxResult.tax - halvingTax);
    
    return {
        totalIncome: targetTotalIncome,
        finalTotalTax: targetTax,
        actualTax: actualTax,
        calculatedNetIncome: targetNet,
        taxableIncome: targetTaxableIncome,
        applicableRate: taxResult.rate,
        applicableDeduction: taxResult.deduction,
        isTaxMode: true,
        modeName: '经营所得税额+到手倒算',
        targetTax: targetTax,
        targetNet: targetNet,
        taxDifference: targetTax - actualTax,
        hasHalvingDiscount: halvingTax > 0,
        halvingTaxAmount: halvingTax
    };
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
