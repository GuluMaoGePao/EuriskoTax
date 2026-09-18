/**
 * 反向倒算（reverse）扣除口径回归 —— 阶段17 17B-2
 *
 * 为什么现在写：17B-2 的第一步是把 `calculateReverseDeductions` 从「一边读 DOM 一边算」
 * 拆成纯函数（ded 字典进、扣除结构出）。这一步不改任何数字，但它是 spec 版向导唯一的入口，
 * 一旦拆歪了（比如把「专项附加」那个总开关读漏），页面还好好的、向导却会静默少扣一份钱。
 * 所以这里不快照数字，而是按税法口径自行重算一遍关键值。
 *
 * 与 business-income-core.test.js 同一套路：**常量在测试里单独写一份**（基本减除费用、
 * 学历教育折算、大病医疗 1.5 万起扣 8 万封顶、职业资格继续教育 3600）。这样一旦口径被改，
 * 红的是能说出理由的那条断言，不是一个孤零零的数。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

// 只加载被验的那一个源文件（loader 会自动带上 solver.js 前置）；扣除内核就在里面
const PATHS = ['src/js/calculation/tax-calculator.js'];

beforeAll(() => {
    PATHS.forEach(p => loadSource(p));
});

// ------- 独立口径常量（刻意不引用源码里的常量） -------
const BASIC = 5000;              // 基本减除费用 5000/月
const PROFESSIONAL = 3600;       // 职业资格继续教育 3600/年（在学历教育额度里先扣）
const MEDICAL_THRESHOLD = 15000; // 大病医疗起扣线
const MEDICAL_CAP = 80000;       // 大病医疗封顶

// 构造一份「总开关全勾」的 ded 字典；缺省值全部为 0 / false，避免手抄时漏字段。
// 「其他扣除」是两级开关：总开关之外每个分项（年金/商业健康险/税延养老/捐赠）还有自己的勾选。
function fullDed(overrides) {
    const ded = {
        'special-deduction-checkbox': true,
        'special-additional-deduction-checkbox': true,
        'other-deduction-checkbox': true,
        'pension-deduction-checkbox': true,
        'enterprise-annuity-checkbox': true,
        'insurance-other-deduction-checkbox': true,
        'tax-deferred-pension-checkbox': true,
        'housing-type': 'rent'
    };
    return Object.assign(ded, overrides || {});
}

const deductions = (ded, months) => global.calculateReverseDeductions(ded, months);

test('勾选了社保/公积金才计入专项扣除，未勾选时月缴额一律不参与', () => {
    const off = deductions(fullDed({ 'special-deduction-checkbox': false, 'pension-insurance': 800 }), 12);
    expect(off.monthlyInsuranceDeduction).toBe(0);
    expect(off.specialDeduction).toBe(0);

    const on = deductions(fullDed({
        'pension-insurance': 800, 'medical-insurance': 200,
        'unemployment-insurance': 50, 'housing-fund': 600
    }), 12);
    // 800 + 200 + 50 + 600
    expect(on.specialDeduction).toBe(1650);
    expect(on.monthlyInsuranceDeduction).toBe(1650);
    // 专项扣除按工作月数折年：1650 × 12
    expect(on.annualSpecialDeductionTotal).toBe(19800);
});

test('专项附加扣除 = 婴幼儿+赡养+住房+学历教育月均，其中学历教育先扣职业资格 3600 再折算月', () => {
    const d = deductions(fullDed({
        'children-infant-deduction': 2000,
        'elderly-deduction': 3000,
        'rent-deduction': 1500,
        'education-deduction': 4800,
        'education-professional-checkbox': true
    }), 12);
    // 学历余额 4800-3600=1200，按月摊 100
    expect(d.monthlyEducationDeduction).toBe(100);
    // 2000 + 3000 + 1500 + 100
    expect(d.monthlySpecialAdditionalTotal).toBe(6600);
    // 年度口径要把职业资格那 3600 加回来：6600×12 + 3600
    expect(d.annualSpecialAdditionalTotal).toBe(82800);
});

test('住房二选一：租金与房贷利息互斥，换 housing-type 只取对应一项', () => {
    const common = { 'rent-deduction': 1500, 'housing-loan-deduction': 1000 };
    const rent = deductions(fullDed(Object.assign({ 'housing-type': 'rent' }, common)), 12);
    const loan = deductions(fullDed(Object.assign({ 'housing-type': 'loan' }, common)), 12);
    expect(rent.monthlyHousingDeduction).toBe(1500);
    expect(loan.monthlyHousingDeduction).toBe(1000);
});

test('大病医疗超 1.5 万的部分据实扣除、8 万封顶，且不计入月度口径', () => {
    const below = deductions(fullDed({ 'education-deduction': 0, 'medical-deduction': 15000 }), 12);
    expect(below.actualMedicalDeduction).toBe(0);

    const mid = deductions(fullDed({ 'education-deduction': 0, 'medical-deduction': 30000 }), 12);
    expect(mid.actualMedicalDeduction).toBe(15000);

    const huge = deductions(fullDed({ 'education-deduction': 0, 'medical-deduction': 300000 }), 12);
    expect(huge.actualMedicalDeduction).toBe(MEDICAL_CAP);
});

test('「其他扣除」总开关未勾时，年金的各分项一律不计', () => {
    const off = deductions(fullDed({
        'other-deduction-checkbox': false,
        'pension-deduction': 1200,
        'enterprise-annuity': 300,
        'tax-deferred-pension': 1000
    }), 12);
    expect(off.otherDeduction).toBe(0);
    expect(off.monthlyPensionDeduction).toBe(0);

    const on = deductions(fullDed({
        'pension-deduction': 1200,
        'enterprise-annuity': 300,
        'tax-deferred-pension': 1000,
        'insurance-other-deduction': 100
    }), 12);
    // 1200 + 300 + 1000 + 100
    expect(on.otherDeduction).toBe(2600);
    // 年度口径：2600 × 12 + 捐赠 2000
    const withDonation = deductions(fullDed({
        'pension-deduction': 1200, 'enterprise-annuity': 300,
        'tax-deferred-pension': 1000, 'insurance-other-deduction': 100,
        'charitable-donation-checkbox': true, 'charitable-donation': 2000
    }), 12);
    expect(withDonation.annualOtherDeductionTotal).toBe(2600 * 12 + 2000);
});

test('工作月数只影响「年度折算」，其中学历教育是唯一的例外：年余额按工作月数摊，所以它也让月合计变', () => {
    const base = {
        'pension-insurance': 800,
        'children-infant-deduction': 2000,
        'education-deduction': 4800,
        'education-professional-checkbox': true
    };
    const half = deductions(fullDed(base), 6);
    const full = deductions(fullDed(base), 12);

    // 学历余额 1200：摊 6 个月 → 200/月，摊 12 个月 → 100/月
    expect(half.monthlyEducationDeduction).toBe(200);
    expect(full.monthlyEducationDeduction).toBe(100);
    // 因此月合计不同：5000 + 800 + (2000 + 200) = 8200；5000 + 800 + (2000 + 100) = 7900
    expect(half.monthlyTotalDeduction).toBe(BASIC + 800 + 2200);
    expect(full.monthlyTotalDeduction).toBe(BASIC + 800 + 2100);

    // 社保这类「本来就是月标准」的项，年度口径 = 月缴额 × 工作月数
    expect(half.annualSpecialDeductionTotal).toBe(800 * 6);
    expect(full.annualSpecialDeductionTotal).toBe(800 * 12);
    // 年度总扣除 = 月合计 × 工作月数 + 职业资格 3600（一次性，不摊月）
    expect(half.totalDeduction).toBe((BASIC + 800 + 2200) * 6 + PROFESSIONAL);
    expect(full.totalDeduction).toBe((BASIC + 800 + 2100) * 12 + PROFESSIONAL);
});

test('空字典也不能炸：总开关全关时只剩基本减除费用 5000/月', () => {
    const d = deductions({}, 12);
    expect(d.monthlyTotalDeduction).toBe(BASIC);
    expect(d.totalDeduction).toBe(BASIC * 12);
    expect(d.monthlyEducationDeduction).toBe(0);
});
