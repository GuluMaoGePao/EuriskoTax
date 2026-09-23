// 离职补偿金的完整测算（阶段17 17D-4）的回归网
//
// 它守护的是四件速算器做不到、而用户真正需要的事：
//   ① **按款项分类计税**：速算器 `severance` 只有 `economic` / `other` 两个框，而 compareOf 里写的是
//      `legalPart = legalEconomic + other` —— 「其他一次性补助」被**全额认可为可享免税**。真实的
//      补偿包是多笔构成的：竞业限制补偿 / 未休年休假折算 / 代通知金**不属于**解除劳动关系取得的
//      一次性补偿，把它们算进补偿包就会**少算税**（这里量化那个差额）；
//   ② **法定应得的精确折算**：《劳动合同法》第 47 条是「满一年一个月、六个月以上不满一年按一年、
//      不满六个月按半个月」，速算器直接把「年限」当月数用，8 年 7 个月会被算成 8.58 个月而不是 9 个月；
//   ③ **代扣的社保公积金可以在计征时扣除**（财税〔2001〕157 号第二条）—— 速算器**没有这一栏**，
//      用户会多算税；
//   ④ **免税额度是按「一次性补偿收入」整体给一次**，分次 / 跨年支付不能重复扣。
// 另有一条算出来才知道的反直觉结论：月工资超过社平 3 倍时，经济补偿受「3 倍 × 12 年」双封顶，
// 封顶值 **恰好等于免税额度**（月均×3×12 = 年均×3）—— 按法定上限足额支付的经济补偿一分钱税都不用交。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');       // 并入综合所得的部分走内核
    loadSource('src/js/calculation/severance-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoSeveranceQuick;

function compute(values) {
    return R().get('severance-deep').compute(Object.assign({
        avgWage: 120000, monthlyWage: 15000, years: 8, extraMonths: 0,
        items: [{ kind: 'economic', amount: 300000 }],
        socialDeduction: 0, otherTaxable: 0, installments: false, times: 2
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：单笔输入下逐点相等', () => {
    test('应税 / 税额 / 免税额度 / 法定上限 —— 一律调同一个 quick 模块', () => {
        const out = compute({});
        const quick = Q().compareOf({
            economic: 300000, other: 0, avgWage: 120000, monthlyWage: 15000, years: 8, otherTaxable: 0
        });
        expect(quick.taxable).toBe(180000);                    // 30 万 − 法定上限 12 万
        expect(row(out, '一次性补偿应纳税所得额')).toBe(quick.taxable);
        expect(row(out, '一次性补偿应纳个税')).toBe(quick.tax);
        expect(row(out, '免税额度（社平年工资 ×3）')).toBe(quick.exemptCap);
        expect(row(out, '实际使用免税额度')).toBe(quick.exemptUsed);
        expect(out.primary.value).toBe(quick.tax);
    });

    test('多组入参逐点对拍（换社平、换月工资、换年限、换金额）', () => {
        [
            { avgWage: 120000, monthlyWage: 15000, years: 8, amount: 300000 },
            { avgWage: 90000, monthlyWage: 20000, years: 5, amount: 100000 },
            { avgWage: 150000, monthlyWage: 45000, years: 15, amount: 500000 },
            { avgWage: 120000, monthlyWage: 8000, years: 3, amount: 24000 }
        ].forEach((c) => {
            const out = compute({
                avgWage: c.avgWage, monthlyWage: c.monthlyWage, years: c.years,
                items: [{ kind: 'economic', amount: c.amount }]
            });
            const quick = Q().compareOf({
                economic: c.amount, other: 0, avgWage: c.avgWage,
                monthlyWage: c.monthlyWage, years: c.years, otherTaxable: 0
            });
            expect(row(out, '一次性补偿应纳税所得额')).toBe(quick.taxable);
            expect(row(out, '一次性补偿应纳个税')).toBe(quick.tax);
            expect(out.primary.value).toBe(quick.tax);
        });
    });

    test('医疗 / 生活补助费仍是 157 号文的「其他补助费」，也享受免税额度', () => {
        const out = compute({ items: [{ kind: 'economic', amount: 100000 }, { kind: 'subsidy', amount: 50000 }] });
        const quick = Q().compareOf({
            economic: 100000, other: 50000, avgWage: 120000, monthlyWage: 15000, years: 8, otherTaxable: 0
        });
        expect(row(out, '其中：一次性补偿收入（可享免税）')).toBe(150000);
        expect(row(out, '一次性补偿应纳个税')).toBe(quick.tax);
    });
});

describe('按款项分类：不能免税的钱塞进补偿包会少算税', () => {
    test('12 万经济补偿 + 18 万竞业限制：分类计税 27600，混着填 19080 —— 少算 8520', () => {
        const out = compute({
            items: [{ kind: 'economic', amount: 120000 }, { kind: 'noncompete', amount: 180000 }],
            otherTaxable: 60000
        });
        expect(row(out, '一次性补偿应纳个税')).toBe(0);            // 12 万全在免税额度内
        expect(row(out, '并入部分的增量税')).toBe(31080 - 3480);   // T(24万) − T(6万) = 27600
        expect(row(out, '应纳个税合计')).toBe(27600);
        expect(row(out, '若全按一次性补偿（错误口径）')).toBe(19080);
        expect(row(out, '混着填会少算')).toBe(8520);
        expect(out.note).toContain('不属于');
        expect(out.note).toContain('8520');
    });

    test('并入永远不比单独更省（年度表超额累进 → T(a+b) ≥ T(a)+T(b)）', () => {
        [0, 60000, 200000, 500000].forEach((other) => {
            [50000, 180000, 400000].forEach((merge) => {
                const out = compute({
                    items: [{ kind: 'economic', amount: 120000 }, { kind: 'noncompete', amount: merge }],
                    otherTaxable: other
                });
                expect(row(out, '并入部分的增量税'))
                    .toBeGreaterThanOrEqual(Q().taxSeparateOf(merge) - 1e-9);
            });
        });
    });

    test('代通知金 / 未休年休假折算同样不享受免税额度', () => {
        const out = compute({
            items: [{ kind: 'economic', amount: 120000 }, { kind: 'notice', amount: 15000 },
                { kind: 'leave', amount: 10000 }],
            otherTaxable: 60000
        });
        expect(row(out, '其中：并入综合所得')).toBe(25000);
        expect(row(out, '混着填会少算')).toBeGreaterThan(0);
    });

    test('构成明细表逐笔给出税务处理与「能否享受免税额度」', () => {
        const table = compute({
            items: [{ kind: 'economic', amount: 120000 }, { kind: 'noncompete', amount: 60000 }]
        }).extras[0].table;
        expect(table.head).toEqual(['款项', '金额', '税务处理', '可享免税额度', '说明']);
        expect(table.rows[0][3]).toBe('是');
        expect(table.rows[1][0]).toBe('竞业限制补偿');
        expect(table.rows[1][2]).toBe('并入当年综合所得');
        expect(table.rows[1][3]).toBe('否');
    });
});

describe('破产企业的一次性安置费：全额免税，不受 3 倍限制', () => {
    test('10 万安置费不计税、也不占用免税额度', () => {
        const out = compute({ items: [{ kind: 'economic', amount: 400000 }, { kind: 'placement', amount: 100000 }] });
        expect(row(out, '补偿包合计')).toBe(500000);
        expect(row(out, '其中：全额免税（破产安置费）')).toBe(100000);
        expect(row(out, '一次性补偿应纳税所得额')).toBe(280000);   // 40 万 − 法定上限 12 万
        expect(row(out, '一次性补偿应纳个税')).toBe(Q().taxSeparateOf(280000));
        expect(out.extras[0].table.rows[1][3]).toBe('全额免税');
    });
});

describe('法定经济补偿：封顶值恰好等于免税额度（反直觉）', () => {
    test('月工资超社平 3 倍 + 年限 15 年 → 封顶 36 万 = 社平年工资 × 3，足额支付零税', () => {
        const out = compute({
            avgWage: 120000, monthlyWage: 45000, years: 15,
            items: [{ kind: 'economic', amount: 360000 }]
        });
        expect(row(out, '法定应得经济补偿（12 个月）')).toBe(360000);
        expect(row(out, '免税额度（社平年工资 ×3）')).toBe(360000);
        expect(row(out, '一次性补偿应纳个税')).toBe(0);
        expect(out.note).toContain('恰好等于免税额度');
    });

    test('低薪长年限：法条上年限**不封顶** —— 20 年应得 30 万，速算器口径只认 18 万', () => {
        const out = compute({ monthlyWage: 15000, years: 20, items: [{ kind: 'economic', amount: 200000 }] });
        expect(row(out, '法定应得经济补偿（20 个月）')).toBe(300000);   // 15000 × 20，不封 12 年
        expect(Q().legalCapOf({ avgWage: 120000, monthlyWage: 15000, years: 20 }).amount).toBe(180000);
        expect(out.note).toContain('不封顶');
        expect(out.note).toContain('20 个月');
    });

    test('年限折算：六个月以上按一年、不满六个月按半个月（速算器直接把年限当月数）', () => {
        expect(compute({ years: 8, extraMonths: 7 })
            .rows.find((r) => r.label.indexOf('法定应得') === 0).value).toBe(15000 * 9);
        expect(compute({ years: 3, extraMonths: 2 })
            .rows.find((r) => r.label.indexOf('法定应得') === 0).value).toBe(15000 * 3.5);
        // 速算器用连续年限会算成 8 年 / 3 年，比法定少
        expect(Q().legalCapOf({ avgWage: 120000, monthlyWage: 15000, years: 8 }).amount).toBe(120000);
    });

    test('拿到的补偿低于法定应得时点出来（先核实基数与年限，再谈税）', () => {
        const out = compute({ monthlyWage: 15000, years: 8, items: [{ kind: 'economic', amount: 90000 }] });
        expect(row(out, '经济补偿低于法定应得')).toBe(30000);
        expect(out.note).toContain('比它少');
    });
});

describe('代扣的社保公积金可以在计征时扣除：速算器没有这一栏', () => {
    test('扣 3 万社保公积金 → 税基 18 万降到 15 万，少交 6000', () => {
        expect(row(compute({ socialDeduction: 0 }), '一次性补偿应纳个税')).toBe(19080);
        const out = compute({ socialDeduction: 30000 });
        expect(row(out, '扣除：补偿款中代扣的社保公积金')).toBe(30000);
        expect(row(out, '一次性补偿应纳税所得额')).toBe(150000);
        expect(row(out, '一次性补偿应纳个税')).toBe(150000 * 0.2 - 16920);   // 13080
    });

    test('扣除额不会把税基压成负数', () => {
        const out = compute({ socialDeduction: 999999 });
        expect(row(out, '一次性补偿应纳税所得额')).toBe(0);
        expect(row(out, '一次性补偿应纳个税')).toBe(0);
    });
});

describe('免税额度只给一次：分次 / 跨年支付不能重复扣', () => {
    test('30 万分 2 次支付、每次各扣免税额度 → 一次税都不用交（少算 19080）', () => {
        const out = compute({ installments: true, times: 2 });
        expect(row(out, '一次性补偿应纳个税')).toBe(19080);
        expect(row(out, '若分 2 次支付、每次各扣免税额度')).toBe(0);
        expect(row(out, '分次各扣会少算')).toBe(19080);
        expect(out.extras[1].table.rows).toHaveLength(3);
    });

    test('不开开关时没有分次那两行', () => {
        const out = compute({ installments: false });
        expect(row(out, '分次各扣会少算')).toBeUndefined();
        expect(out.extras[1].table.rows).toHaveLength(2);
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：当地口径与年限 → 补偿构成 → 扣除与对照 → 结果', () => {
        const tool = R().get('severance-deep');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        expect(W().stepsOf(tool).map((s) => s.title))
            .toEqual(['当地口径与年限', '补偿构成', '扣除与对照', '计算结果']);
    });

    test('自带 spec，没有被孪生速算器覆盖', () => {
        const deep = R().get('severance-deep');
        const quick = R().get('severance');
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.fields.map((f) => f.key)).toEqual([
            'avgWage', 'monthlyWage', 'years', 'extraMonths', 'items',
            'socialDeduction', 'otherTaxable', 'installments', 'times'
        ]);
        expect(deep.fields.find((f) => f.key === 'items').type).toBe('repeater');
        expect(deep.steps).toHaveLength(3);
        expect(deep.policyKey).toBe('severance');   // 时效提醒仍指向同一条登记
    });

    test('走完向导：主结果、构成明细表、免责声明、结果归属都在', () => {
        W().open('severance-deep', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('补偿构成与税务处理');
        expect(card.textContent).toContain('口径对照');
        expect(card.getAttribute('data-tool-id')).toBe('severance-deep');
    });
});
