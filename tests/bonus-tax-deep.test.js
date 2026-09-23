// 年终奖择优的完整测算（阶段17 17D-2）的回归网
//
// 它守护的是三件速算器做不到、而用户真正需要的事：
//   ① **两套口径真比一次**：速算器 `bonus-tax` 收了「全年其他应纳税所得额」却在 compute 里
//      一行都没用到（subtitle 写着「单独计税还是并入综合所得更省」，实际只算了单独计税那一半）。
//      完整测算必须给出并入 / 单独两个数、差额与择优结论 —— 且两者都走**内核**，
//      不是「奖金 × 边际税率」那种线性估算；
//   ② **临界区（雷区）**：单独计税按「奖金 ÷ 12」定档、再全额乘税率，所以多发 1 元可能到手更少。
//      速算器只报一个「跳档多交」，不给「该定在多少」。这里要算出每一段的**出口金额**
//      （36000 → 38567、144000 → 160500、960000 → 1120000 是公开雷区表的已知值，
//      正好可以当独立手算的基准）；
//   ③ **最优分配点**：总额能在工资与年终奖之间切分时，f(x) = T(总额 − x) + 奖金税(x)
//      分段线性、只会在阈值处向上跳，最小值必落在端点 —— 最省的那个点常常既不是
//      全并入也不是全单独，这正是速算器完全没有的一层。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');       // 并入综合所得走内核 calculateTaxByTaxableIncome
    loadSource('src/js/calculation/bonus-tax-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoBonusQuick;

function compute(values) {
    return R().get('bonus-tax-deep').compute(Object.assign({
        otherTaxable: 60000, bonus: 36000, splittable: false
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：单独计税那一半必须逐点相等', () => {
    test('年终奖税额 / 适用税率 / 本档上限 —— 一律调同一个 quick 模块', () => {
        [36000, 36001, 50000, 144000, 300000, 1000000].forEach((bonus) => {
            const out = compute({ bonus: bonus, otherTaxable: 0 });
            expect(row(out, '单独计税：年终奖税额')).toBe(Q().taxOf(bonus));
            expect(row(out, '年终奖适用税率')).toBe(Q().bracketOf(bonus).rate);
            // 最高档 max 是 Infinity —— 那一行给的是文字，不是「0 元」（0 会被读成不能多发）
            const max = Q().bracketOf(bonus).max;
            if (isFinite(max)) expect(row(out, '本档上限（年终奖）')).toBe(max * 12);
            else expect(row(out, '本档上限（年终奖）')).toBe('最高档，无上限');
        });
    });

    // 独立手算的一份（不 import quick）：3.6 万 ÷ 12 = 3000，落 3% 档，全额乘税率 = 1080
    test('3.6 万：÷12 定 3% 档、全额乘税率 = 1080（不复制税率的独立核对）', () => {
        const out = compute({ bonus: 36000, otherTaxable: 0 });
        expect(row(out, '单独计税：年终奖税额')).toBe(1080);
        expect(row(out, '单独计税：全年个税合计')).toBe(1080);
    });
});

describe('速算器缺的那一半：两套口径真比一次', () => {
    test('全年只有年终奖且落在 3% 档：两套口径恰好相等（经典事实）', () => {
        const out = compute({ otherTaxable: 0, bonus: 36000 });
        expect(row(out, '单独计税：全年个税合计')).toBe(1080);
        expect(row(out, '并入综合所得：全年个税合计')).toBe(1080);   // 3.6 万 × 3%
        expect(row(out, '择优结论')).toBe('两种口径相同');
    });

    test('中高收入：单独计税更省（差额就是两种找档方式之差）', () => {
        const out = compute({ otherTaxable: 100000, bonus: 36000 });
        expect(row(out, '单独计税：综合所得部分')).toBe(100000 * 0.1 - 2520);        // 7480
        expect(row(out, '单独计税：年终奖税额')).toBe(1080);
        expect(row(out, '单独计税：全年个税合计')).toBe(7480 + 1080);
        expect(row(out, '并入综合所得：全年个税合计')).toBe(136000 * 0.1 - 2520);    // 11080
        expect(row(out, '两种口径差额（并入 − 单独）')).toBe(2520);
        expect(row(out, '择优结论')).toBe('单独计税更省');
        expect(out.primary.value).toBe(8560);
    });

    test('没什么其他收入、奖金很大：并入更省（年度表速算扣除远大于月度表）', () => {
        const out = compute({ otherTaxable: 0, bonus: 1000000 });
        expect(row(out, '单独计税：全年个税合计')).toBe(1000000 * 0.45 - 15160);      // 434840
        expect(row(out, '并入综合所得：全年个税合计')).toBe(1000000 * 0.45 - 181920); // 268080
        expect(row(out, '择优结论')).toBe('并入综合所得更省');
        expect(out.primary.value).toBe(268080);
    });

    test('结果区始终两套都在（对比表逐点可核对）', () => {
        const out = compute({ otherTaxable: 100000, bonus: 36000 });
        const table = out.extras[0].table;
        expect(table.head).toEqual(['计税口径', '综合所得部分', '年终奖部分', '全年个税合计']);
        expect(table.rows[0][3].value).toBe(8560);
        expect(table.rows[1][3].value).toBe(11080);
        expect(table.rows[1][2]).toBe('─');       // 并入时没有「单独的年终奖税额」这一项
    });
});

describe('临界区（雷区）：给出「该定在多少」而不只是「跳档多交」', () => {
    function dangerRow(edge) {
        const out = compute({ otherTaxable: 0, bonus: 36000 });
        return out.extras[1].table.rows.find((r) => r[0].value === edge);
    }

    test('六档雷区齐全，出口金额与公开雷区表一致', () => {
        const out = compute({ otherTaxable: 0, bonus: 36000 });
        const rows = out.extras[1].table.rows;
        expect(rows.map((r) => r[0].value)).toEqual([36000, 144000, 300000, 420000, 660000, 960000]);
        // 出口金额 = 跳档后「到手回到原来水平」的金额：x(1 − 高档税率) + 高档速算扣除 = 原到手
        expect(dangerRow(36000)[3].value).toBe(38567);     // (34920 − 210) ÷ 0.9
        expect(dangerRow(144000)[3].value).toBe(160500);   // (129810 − 1410) ÷ 0.8
        expect(dangerRow(960000)[3].value).toBe(1120000);  // (631160 − 15160) ÷ 0.55
    });

    test('3.6 万处多发 1 元多缴 2310 元：到手反而少了两千三', () => {
        expect(dangerRow(36000)[2].value).toBeCloseTo(2310.1, 6);
        // 手算核对：36000 到手 34920；36001 按 10% 档 → 税 3390.1，到手 32610.9
        expect(36001 - Q().taxOf(36001)).toBeCloseTo(32610.9, 6);
        expect(36001 - Q().taxOf(36001)).toBeLessThan(36000 - Q().taxOf(36000));
    });

    test('落在雷区里：结论区直接点名「该定在多少 / 该发到多少」', () => {
        const out = compute({ otherTaxable: 0, bonus: 36001 });
        expect(out.note).toContain('雷区');
        expect(out.note).toContain('38567');
        expect(out.note).toContain('36000');
    });

    test('不在雷区里：不误报（正好站在上沿是安全的）', () => {
        expect(compute({ otherTaxable: 0, bonus: 36000 }).note).not.toContain('雷区');
        expect(compute({ otherTaxable: 0, bonus: 40000 }).note).not.toContain('雷区');
    });
});

describe('最优分配点：总额固定时的切分（速算器完全没有这一层）', () => {
    test('20 万总额：最省的不是全并入也不是全单独，而是把 3.6 万放进年终奖', () => {
        const out = compute({ otherTaxable: 100000, bonus: 100000, splittable: true });
        expect(row(out, '最优：年终奖发')).toBe(36000);
        expect(row(out, '最优：工资部分应纳税所得额')).toBe(164000);
        expect(row(out, '最优：全年个税合计')).toBe(15880 + 1080);      // 16960
        // 现状（各 10 万）：7480 + 9790 = 17270 → 换个名目发就能省 310
        expect(row(out, '相对当前分配可省')).toBe(310);
    });

    test('候选表按税额升序，首行就是最优、当前那一行被标出来', () => {
        const out = compute({ otherTaxable: 100000, bonus: 100000, splittable: true });
        const table = out.extras[2].table;
        expect(table.head).toEqual(['年终奖', '工资部分应纳税所得额', '全年个税合计', '说明']);
        expect(table.rows[0][3]).toBe('最优');
        for (let i = 1; i < table.rows.length; i++) {
            expect(table.rows[i][2].value).toBeGreaterThanOrEqual(table.rows[i - 1][2].value - 1e-9);
        }
        expect(table.rows.some((r) => r[3] === '当前')).toBe(true);
        // 两端都在表里：全并入（年终奖 0）与全单独（年终奖 = 总额）
        expect(table.rows.some((r) => r[0].value === 0)).toBe(true);
        expect(table.rows.some((r) => Math.abs(r[0].value - 200000) < 0.005)).toBe(true);
    });

    test('最优一定不劣于现状（枚举端点 + 当前点，不会出现「越算越贵」）', () => {
        [[20000, 80000], [60000, 60000], [300000, 120000], [0, 500000]].forEach((pair) => {
            const out = compute({ otherTaxable: pair[0], bonus: pair[1], splittable: true });
            expect(row(out, '最优：全年个税合计')).toBeLessThanOrEqual(
                row(out, '单独计税：全年个税合计') + 1e-9
            );
        });
    });

    test('不能自由分配时：不给候选表，只给两套口径的比较', () => {
        const out = compute({ otherTaxable: 100000, bonus: 36000, splittable: false });
        expect(out.extras).toHaveLength(2);
        expect(row(out, '最优：年终奖发')).toBeUndefined();
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：全年口径 → 年终奖 → 分配方式 → 结果', () => {
        const tool = R().get('bonus-tax-deep');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        expect(W().stepsOf(tool).map((s) => s.title)).toEqual(['全年口径', '年终奖', '分配方式', '计算结果']);
    });

    test('自带 spec，没有被同名速算器的 fields / compute 覆盖', () => {
        const deep = R().get('bonus-tax-deep');
        const quick = R().get('bonus-tax');
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.fields.map((f) => f.key)).toEqual(['otherTaxable', 'bonus', 'splittable']);
        expect(deep.steps).toHaveLength(3);
        expect(deep.policyKey).toBe('bonus');     // 时效提醒仍指向同一条登记（单独计税 2027 到期）
    });

    test('走完向导：主结果、两套口径对比表与雷区表、免责声明、结果归属都在', () => {
        W().open('bonus-tax-deep', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('两套口径逐项对比');
        expect(card.textContent).toContain('临界区');
        expect(card.getAttribute('data-tool-id')).toBe('bonus-tax-deep');
    });
});
