const comprehensiveTaxRates = [
    { min: 0, max: 36000, rate: 0.03, deduction: 0 },
    { min: 36000, max: 144000, rate: 0.10, deduction: 2520 },
    { min: 144000, max: 300000, rate: 0.20, deduction: 16920 },
    { min: 300000, max: 420000, rate: 0.25, deduction: 31920 },
    { min: 420000, max: 660000, rate: 0.30, deduction: 52920 },
    { min: 660000, max: 960000, rate: 0.35, deduction: 85920 },
    { min: 960000, max: Infinity, rate: 0.45, deduction: 181920 }
];

const bonusMonthlyTaxRates = [
    { max: 3000, rate: 0.03, deduction: 0 },
    { max: 12000, rate: 0.10, deduction: 210 },
    { max: 25000, rate: 0.20, deduction: 1410 },
    { max: 35000, rate: 0.25, deduction: 2660 },
    { max: 55000, rate: 0.30, deduction: 4410 },
    { max: 80000, rate: 0.35, deduction: 7160 },
    { max: Infinity, rate: 0.45, deduction: 15160 }
];

const businessTaxRates = [
    { max: 30000, rate: 0.05, deduction: 0 },
    { max: 90000, rate: 0.10, deduction: 1500 },
    { max: 300000, rate: 0.20, deduction: 10500 },
    { max: 500000, rate: 0.30, deduction: 40500 },
    { max: Infinity, rate: 0.35, deduction: 65500 }
];

const classificationTaxRates = {
    interest: { rate: 0.20, name: '利息、股息、红利所得' },
    rent: { rate: 0.20, name: '财产租赁所得' },
    transfer: { rate: 0.20, name: '财产转让所得' },
    accidental: { rate: 0.20, name: '偶然所得' }
};

function calculateOtherIncome(annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome) {
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

    const authorTaxableIncome = annualAuthorIncome <= 4000 
        ? Math.max(0, (annualAuthorIncome - 800) * 0.7) 
        : Math.max(0, annualAuthorIncome * 0.8 * 0.7);
    const authorTax = authorTaxableIncome * 0.2;

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

function calculateComprehensiveDeductions(inputData) {
    const workMonths = inputData.workMonths || 12;
    const basicDeduction = 5000;
    
    const specialDeduction = inputData.specialDeduction || {};
    const monthlyPensionInsurance = parseFloat(specialDeduction.pensionInsurance) || 0;
    const monthlyMedicalInsurance = parseFloat(specialDeduction.medicalInsurance) || 0;
    const monthlyUnemploymentInsurance = parseFloat(specialDeduction.unemploymentInsurance) || 0;
    const monthlyHousingFund = parseFloat(specialDeduction.housingFund) || 0;
    
    const specialAdditional = inputData.specialAdditional || {};
    const monthlyElderlyDeduction = parseFloat(specialAdditional.elderly) || 0;
    const monthlyChildrenInfantDeduction = parseFloat(specialAdditional.childrenInfant) || 0;
    const monthlyHousingDeduction = parseFloat(specialAdditional.housing) || 0;
    const annualEducationDeduction = parseFloat(specialAdditional.education) || 0;
    const annualMedicalDeduction = parseFloat(specialAdditional.medical) || 0;
    const annualProfessionalDeduction = specialAdditional.professional ? 3600 : 0;
    
    const otherDeduction = inputData.otherDeduction || {};
    const monthlyPensionDeduction = parseFloat(otherDeduction.pension) || 0;
    const monthlyEnterpriseAnnuity = parseFloat(otherDeduction.enterpriseAnnuity) || 0;
    const monthlyInsuranceOtherDeduction = parseFloat(otherDeduction.insuranceOther) || 0;
    const monthlyTaxDeferredPension = parseFloat(otherDeduction.taxDeferredPension) || 0;
    const annualCharitableDonation = parseFloat(otherDeduction.charitableDonation) || 0;

    const actualMedicalDeduction = annualMedicalDeduction > 15000 
        ? Math.min(annualMedicalDeduction - 15000, 80000) 
        : 0;

    const educationDegreeAmount = annualEducationDeduction - annualProfessionalDeduction;
    const monthlyEducationDeduction = educationDegreeAmount / workMonths;
    
    const monthlySpecialAdditionalTotal = monthlyElderlyDeduction + 
        monthlyChildrenInfantDeduction + monthlyHousingDeduction + monthlyEducationDeduction;

    const annualSpecialAdditionalTotal = monthlySpecialAdditionalTotal * workMonths + 
        annualProfessionalDeduction + actualMedicalDeduction;

    const annualOtherDeductionTotal = (monthlyPensionDeduction + monthlyEnterpriseAnnuity + 
        monthlyInsuranceOtherDeduction + monthlyTaxDeferredPension) * workMonths + 
        annualCharitableDonation;

    const monthlyInsuranceDeduction = monthlyPensionInsurance + monthlyMedicalInsurance + 
        monthlyUnemploymentInsurance + monthlyHousingFund;
    const annualSpecialDeductionTotal = monthlyInsuranceDeduction * workMonths;

    const totalDeduction = basicDeduction * workMonths + 
        annualSpecialDeductionTotal + annualSpecialAdditionalTotal + 
        annualOtherDeductionTotal;

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

function calculateComprehensiveTax(inputData) {
    const workMonths = inputData.workMonths || 12;
    const monthlySalaryIncome = parseFloat(inputData.salaryIncome) || 0;
    const annualLaborIncome = parseFloat(inputData.laborIncome) || 0;
    const annualAuthorIncome = parseFloat(inputData.authorIncome) || 0;
    const annualRoyaltyIncome = parseFloat(inputData.royaltyIncome) || 0;
    const bonusIncome = parseFloat(inputData.bonusIncome) || 0;
    const bonusInclude = inputData.bonusInclude || false;
    const userInputPrepaidTax = parseFloat(inputData.prepaidTax);

    const otherIncome = calculateOtherIncome(annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome);
    const deductions = calculateComprehensiveDeductions(inputData);

    let totalIncome = monthlySalaryIncome * workMonths + otherIncome.laborTaxableIncome + 
        otherIncome.authorTaxableIncome + otherIncome.royaltyTaxableIncome;
    
    if (bonusIncome > 0 && bonusInclude) {
        totalIncome += bonusIncome;
    }

    const taxableIncome = Math.max(0, totalIncome - deductions.totalDeduction);

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

    const cumulativeTax = calculateCumulativePrepaidTax(workMonths, monthlySalaryIncome, 
        deductions.monthlyBasicDeduction, deductions.monthlyInsuranceDeduction, 
        deductions.monthlySpecialAdditionalTotal, deductions.monthlyPensionDeduction, 
        deductions.monthlyEnterpriseAnnuity, deductions.monthlyInsuranceOtherDeduction, 
        deductions.monthlyTaxDeferredPension);
    
    const bonusTax = calculateBonusTax(bonusIncome, bonusInclude);
    
    const prepaidTax = (userInputPrepaidTax !== undefined && !isNaN(userInputPrepaidTax)) 
        ? userInputPrepaidTax 
        : (cumulativeTax + otherIncome.laborTax + otherIncome.authorTax + otherIncome.royaltyTax + bonusTax);
    
    const refundTax = totalTax - prepaidTax;
    
    const preTaxIncome = monthlySalaryIncome * workMonths + annualLaborIncome + 
        annualAuthorIncome + annualRoyaltyIncome + bonusIncome;
    
    const netIncome = preTaxIncome - totalTax;

    return {
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
}

function calculateReverseDeductions(inputData) {
    const workMonths = inputData.workMonths || 12;
    const basicDeduction = 5000;

    const specialDeduction = inputData.specialDeduction || {};
    const monthlyPensionInsurance = parseFloat(specialDeduction.pensionInsurance) || 0;
    const monthlyMedicalInsurance = parseFloat(specialDeduction.medicalInsurance) || 0;
    const monthlyUnemploymentInsurance = parseFloat(specialDeduction.unemploymentInsurance) || 0;
    const monthlyHousingFund = parseFloat(specialDeduction.housingFund) || 0;
    const specialDeductionTotal = monthlyPensionInsurance + monthlyMedicalInsurance + 
        monthlyUnemploymentInsurance + monthlyHousingFund;

    const specialAdditional = inputData.specialAdditional || {};
    const monthlyChildrenInfantDeduction = parseFloat(specialAdditional.childrenInfant) || 0;
    const monthlyElderlyDeduction = parseFloat(specialAdditional.elderly) || 0;
    const monthlyHousingDeduction = parseFloat(specialAdditional.housing) || 0;
    const annualEducationDeduction = parseFloat(specialAdditional.education) || 0;
    const medicalDeduction = parseFloat(specialAdditional.medical) || 0;
    const actualMedicalDeduction = medicalDeduction > 15000 ? Math.min(medicalDeduction - 15000, 80000) : 0;
    const annualProfessionalDeduction = specialAdditional.professional ? 3600 : 0;
    const educationDegreeAmount = annualEducationDeduction - annualProfessionalDeduction;
    const monthlyEducationDeduction = educationDegreeAmount / workMonths;
    const specialAdditionalDeduction = monthlyChildrenInfantDeduction + monthlyElderlyDeduction + 
        monthlyHousingDeduction + monthlyEducationDeduction;

    const otherDeduction = inputData.otherDeduction || {};
    const monthlyPensionDeduction = parseFloat(otherDeduction.pension) || 0;
    const monthlyEnterpriseAnnuity = parseFloat(otherDeduction.enterpriseAnnuity) || 0;
    const monthlyInsuranceOtherDeduction = parseFloat(otherDeduction.insuranceOther) || 0;
    const monthlyTaxDeferredPension = parseFloat(otherDeduction.taxDeferredPension) || 0;
    const otherDeductionTotal = monthlyPensionDeduction + monthlyEnterpriseAnnuity + 
        monthlyInsuranceOtherDeduction + monthlyTaxDeferredPension;
    
    const monthlyTotalDeduction = basicDeduction + specialDeductionTotal + specialAdditionalDeduction + otherDeductionTotal;
    const annualCharitableDonation = parseFloat(otherDeduction.charitableDonation) || 0;
    const totalDeduction = monthlyTotalDeduction * workMonths + annualProfessionalDeduction + 
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
        annualSpecialAdditionalTotal: specialAdditionalDeduction * workMonths + annualProfessionalDeduction + actualMedicalDeduction,
        annualOtherDeductionTotal: otherDeductionTotal * workMonths + annualCharitableDonation,
        monthlyInsuranceDeduction: specialDeductionTotal,
        annualSpecialDeductionTotal: specialDeductionTotal * workMonths,
        basicDeduction,
        specialDeduction: specialDeductionTotal,
        specialAdditionalDeduction,
        otherDeduction: otherDeductionTotal,
        monthlyTotalDeduction,
        totalDeduction
    };
}

function calculateReverseBonusTax(inputData) {
    const bonusIncome = parseFloat(inputData.bonusIncome) || 0;
    const bonusInclude = inputData.bonusInclude || false;
    
    if (bonusIncome <= 0 || bonusInclude) return 0;
    
    const monthlyBonus = bonusIncome / 12;
    for (const bracket of bonusMonthlyTaxRates) {
        if (monthlyBonus <= bracket.max) {
            return bonusIncome * bracket.rate - bracket.deduction;
        }
    }
    return 0;
}

function calculateFromTargetRate(inputData, deductionData, bonusTax) {
    const targetRate = parseFloat(inputData.targetRate) / 100;
    
    const targetBracket = comprehensiveTaxRates.find(
        bracket => Math.abs(bracket.rate - targetRate) < 0.001
    );
    
    if (!targetBracket) {
        throw new Error('找不到对应的税率级距');
    }
    
    const minTaxableIncome = targetBracket.min || 0;
    const maxTaxableIncome = targetBracket.max;
    
    const minPreTaxIncome = minTaxableIncome + deductionData.totalDeduction;
    const maxPreTaxIncome = maxTaxableIncome === Infinity 
        ? Infinity 
        : maxTaxableIncome + deductionData.totalDeduction;
    
    const bonusIncome = parseFloat(inputData.bonusIncome) || 0;
    let minTotalIncome, maxTotalIncome;
    
    if (bonusIncome > 0) {
        minTotalIncome = minPreTaxIncome + bonusIncome;
        maxTotalIncome = maxPreTaxIncome === Infinity 
            ? Infinity 
            : maxPreTaxIncome + bonusIncome;
    } else {
        minTotalIncome = minPreTaxIncome;
        maxTotalIncome = maxPreTaxIncome;
    }
    
    let middleTaxableIncome;
    if (maxTaxableIncome === Infinity) {
        middleTaxableIncome = minTaxableIncome + 100000;
    } else {
        middleTaxableIncome = (minTaxableIncome + maxTaxableIncome) / 2;
    }
    
    const middlePreTaxIncome = middleTaxableIncome + deductionData.totalDeduction;
    let middleTotalIncome;
    
    if (bonusIncome > 0) {
        middleTotalIncome = middlePreTaxIncome + bonusIncome;
    } else {
        middleTotalIncome = middlePreTaxIncome;
    }
    
    const middleComprehensiveTax = middleTaxableIncome * targetBracket.rate - targetBracket.deduction;
    const middleTotalTax = middleComprehensiveTax + bonusTax;
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

function calculateFromMonthlyNet(inputData, deductionData, bonusTax) {
    const monthlyNet = parseFloat(inputData.monthlyNet) || 0;
    const workMonths = inputData.workMonths || 12;
    
    const annualNetTarget = monthlyNet * workMonths;
    
    let left = deductionData.totalDeduction;
    let right = deductionData.totalDeduction + 10000000;
    const precision = 0.01;
    
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
    
    const totalIncome = (left + right) / 2;
    const taxableIncome = totalIncome - deductionData.totalDeduction;
    
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

function calculateFromTargetTax(inputData, deductionData, bonusTax) {
    const targetTax = parseFloat(inputData.fixedTax) || parseFloat(inputData.targetTax) || 0;
    const targetNet = parseFloat(inputData.fixedNet) || parseFloat(inputData.targetNet) || 0;
    
    if (targetTax > 0 && targetNet === 0) {
        let left = deductionData.totalDeduction;
        let right = deductionData.totalDeduction + 10000000;
        const precision = 0.01;
        
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
        
        const calculatedIncome = (left + right) / 2;
        const calculatedTaxable = calculatedIncome - deductionData.totalDeduction;
        
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
    
    const targetTotalIncome = targetTax + targetNet;
    const targetTaxableIncome = targetTotalIncome - deductionData.totalDeduction;
    
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

function calculateReverseTax(inputData) {
    const deductionData = calculateReverseDeductions(inputData);
    const bonusTax = calculateReverseBonusTax(inputData);
    
    let reverseType = inputData.reverseType;
    if (!reverseType) {
        if (inputData.targetTax || inputData.fixedTax) {
            reverseType = 'tax';
        } else if (inputData.targetNet || inputData.fixedNet) {
            reverseType = 'tax';
        } else if (inputData.targetRate) {
            reverseType = 'rate';
        } else if (inputData.targetMonthlyNet) {
            reverseType = 'monthly';
        } else {
            reverseType = 'tax';
        }
    }
    
    let result;
    if (reverseType === 'rate') {
        result = calculateFromTargetRate(inputData, deductionData, bonusTax);
    } else if (reverseType === 'monthly') {
        result = calculateFromMonthlyNet(inputData, deductionData, bonusTax);
    } else {
        result = calculateFromTargetTax(inputData, deductionData, bonusTax);
    }
    
    const bonusIncome = parseFloat(inputData.bonusIncome) || 0;
    
    return {
        incomeType: inputData.incomeType || 'comprehensive',
        reverseType: reverseType,
        workMonths: inputData.workMonths || 12,
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
        bonusIncome: bonusIncome,
        bonusTax: bonusTax,
        calculationDate: new Date().toISOString()
    };
}

function calculateBusinessTax(inputData) {
    const businessIncome = parseFloat(inputData.businessIncome) || 0;
    const businessCost = parseFloat(inputData.businessCost) || 0;
    const businessExpenses = parseFloat(inputData.businessExpenses) || 0;
    const businessTaxes = parseFloat(inputData.businessTaxes) || 0;
    const businessLosses = parseFloat(inputData.businessLosses) || 0;
    const businessOtherExpenses = parseFloat(inputData.businessOtherExpenses) || 0;
    const businessPreviousLosses = parseFloat(inputData.businessPreviousLosses) || 0;
    const hasComprehensiveIncome = inputData.hasComprehensiveIncome ?? true;
    const prepaidTax = parseFloat(inputData.prepaidTax) || 0;
    
    const businessProfit = Math.max(0, businessIncome - businessCost - businessExpenses - 
        businessTaxes - businessLosses - businessOtherExpenses);
    
    const netIncomeAfterLoss = Math.max(0, businessProfit - businessPreviousLosses);
    
    const investorDeduction = hasComprehensiveIncome ? 0 : 60000;
    
    // 专项扣除（社保/公积金）- 兼容新旧格式
    const specialDeduction = inputData.specialDeduction || {};
    const pensionInsurance = parseFloat(specialDeduction.pensionInsurance) || 0;
    const medicalInsurance = parseFloat(specialDeduction.medicalInsurance) || 0;
    const unemploymentInsurance = parseFloat(specialDeduction.unemploymentInsurance) || 0;
    const housingFund = parseFloat(specialDeduction.housingFund) || 0;
    const specialDeductionTotal = pensionInsurance + medicalInsurance + unemploymentInsurance + housingFund;
    
    // 专项附加扣除 - 兼容新旧格式
    const rawSpecialAdditional = inputData.specialAdditionalDeduction || {};
    let specialAdditionalDeductionTotal = 0;
    let specialAdditionalDetails = {
        childrenInfant: 0,
        elderly: 0,
        housing: 0,
        education: 0,
        medical: 0,
        actualMedical: 0,
        total: 0
    };
    
    if (typeof rawSpecialAdditional === 'number') {
        specialAdditionalDeductionTotal = rawSpecialAdditional;
        specialAdditionalDetails.total = rawSpecialAdditional;
    } else {
        const childrenInfant = parseFloat(rawSpecialAdditional.childrenInfant) || 0;
        const elderly = parseFloat(rawSpecialAdditional.elderly) || 0;
        const housing = parseFloat(rawSpecialAdditional.housing) || 0;
        const education = parseFloat(rawSpecialAdditional.education) || 0;
        const medical = parseFloat(rawSpecialAdditional.medical) || 0;
        
        const medicalThreshold = 15000;
        const actualMedical = medical > medicalThreshold ? medical - medicalThreshold : 0;
        
        specialAdditionalDeductionTotal = childrenInfant + elderly + housing + education + actualMedical;
        specialAdditionalDetails = {
            childrenInfant,
            elderly,
            housing,
            education,
            medical,
            actualMedical,
            total: specialAdditionalDeductionTotal
        };
    }
    
    // 其他扣除 - 兼容新旧格式
    const rawOtherDeduction = inputData.otherDeduction || {};
    let otherDeductionTotal = 0;
    let otherDeductionDetails = {
        pension: 0,
        enterpriseAnnuity: 0,
        insurance: 0,
        charitableDonation: 0,
        actualCharitableDonation: 0,
        total: 0
    };
    
    if (typeof rawOtherDeduction === 'number') {
        otherDeductionTotal = rawOtherDeduction;
        otherDeductionDetails.total = rawOtherDeduction;
    } else {
        const pension = parseFloat(rawOtherDeduction.pension) || 0;
        const enterpriseAnnuity = parseFloat(rawOtherDeduction.enterpriseAnnuity) || 0;
        const insurance = parseFloat(rawOtherDeduction.insurance) || 0;
        const charitableDonation = parseFloat(rawOtherDeduction.charitableDonation) || 0;
        
        const taxableIncomeBeforeDonation = Math.max(0, netIncomeAfterLoss - investorDeduction - specialDeductionTotal - specialAdditionalDeductionTotal);
        const charitableDonationLimit = taxableIncomeBeforeDonation * 0.3;
        const actualCharitableDonation = Math.min(charitableDonation, charitableDonationLimit);
        
        otherDeductionTotal = pension + enterpriseAnnuity + insurance + actualCharitableDonation;
        otherDeductionDetails = {
            pension,
            enterpriseAnnuity,
            insurance,
            charitableDonation,
            actualCharitableDonation,
            total: otherDeductionTotal
        };
    }
    
    const taxableIncome = Math.max(0, netIncomeAfterLoss - investorDeduction - specialDeductionTotal - specialAdditionalDeductionTotal - otherDeductionTotal);
    
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
    
    const halvingThreshold = 2000000;
    const halvingTaxable = Math.min(taxableIncome, halvingThreshold);
    const taxReduction = totalTaxBeforeHalving > 0 ? (halvingTaxable * applicableRate - applicableDeduction) * 0.5 : 0;
    
    const totalTax = Math.max(0, totalTaxBeforeHalving - taxReduction);
    
    const refundTax = totalTax - prepaidTax;
    
    const netIncomeAfterTax = netIncomeAfterLoss - totalTax;
    
    return {
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
            specialDeduction: {
                pensionInsurance,
                medicalInsurance,
                unemploymentInsurance,
                housingFund,
                total: specialDeductionTotal,
                deductible: hasComprehensiveIncome ? 0 : specialDeductionTotal
            },
            specialAdditionalDeduction: specialAdditionalDetails,
            otherDeduction: otherDeductionDetails
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
}

function calculateClassificationTax(inputData) {
    const results = [];
    let totalTax = 0;
    
    const incomeTypes = {
        interest: { income: parseFloat(inputData.interestIncome) || 0, name: '利息、股息、红利所得' },
        rent: { income: parseFloat(inputData.rentIncome) || 0, name: '财产租赁所得' },
        transfer: { income: parseFloat(inputData.transferIncome) || 0, cost: parseFloat(inputData.transferCost) || 0, name: '财产转让所得' },
        accidental: { income: parseFloat(inputData.accidentalIncome) || 0, name: '偶然所得' }
    };
    
    for (const [type, data] of Object.entries(incomeTypes)) {
        const rate = classificationTaxRates[type].rate;
        let taxableIncome = 0;
        let tax = 0;
        
        if (type === 'rent') {
            taxableIncome = data.income <= 4000 
                ? Math.max(0, data.income - 800) 
                : Math.max(0, data.income * 0.8);
        } else if (type === 'transfer') {
            taxableIncome = Math.max(0, data.income - data.cost);
        } else {
            taxableIncome = data.income;
        }
        
        tax = taxableIncome * rate;
        totalTax += tax;
        
        results.push({
            type: type,
            name: data.name,
            income: data.income,
            cost: data.cost || 0,
            taxableIncome: taxableIncome,
            rate: rate,
            tax: tax
        });
    }
    
    return {
        results: results,
        totalTax: totalTax,
        calculationDate: new Date().toISOString()
    };
}

module.exports = {
    calculateComprehensiveTax,
    calculateReverseTax,
    calculateBusinessTax,
    calculateClassificationTax
};
