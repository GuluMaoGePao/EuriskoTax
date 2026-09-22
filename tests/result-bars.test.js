// v1.99.0 · 结果页「各项数额」条（阶段19-4 顺延）
//
// plan 原文要的是「收入构成 → 扣除 → 应税 → 税额」四段瀑布 + 引入 Chart.js。
// 落地时改成"不猜语义、只比大小"的一张条（理由见 src/js/ui/result-bars.js 文件头），
// 这里钉的是改完之后的三条纪律：
//   ① 画不出就不画（少于两根没有"比"的对象）；
//   ② 负数与 0 不上条 —— 不拿 0 充一根条（这与 v1.98.0 方案库"不补 ¥0.00"是同一条）；
//   ③ 只认金额行：把「实际税负率 13%」和「销项税额 ¥3,000」画在同一根尺子上比大小，
//      是在制造一个不存在的比较。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    global.window = global;
    loadSource('src/js/ui/result-bars.js');
});

beforeEach(() => {
    document.body.innerHTML = '';
});

const B = () => window.EuriskoResultBars;
const yuan = (v) => '¥' + Number(v).toFixed(2);

function outOf(primary, rows) {
    return { primary: primary, rows: rows || [], note: '' };
}
const money = (label, value) => ({ label: label, value: value, kind: 'money' });

// ====== ① 画不出就不画 ======
describe('画不出就不画', () => {
    test('只有主结果一行：一根条没有"比"的对象，整块不出现', () => {
        const res = B().pure.buildBars(outOf(money('应纳增值税', 1200), []));
        expect(res.bars).toEqual([]);
        expect(B().html(outOf(money('应纳增值税', 1200), []))).toBe('');
    });

    test('一行都没有（或结果对象为空）：不画，也不抛', () => {
        expect(B().pure.buildBars(null).bars).toEqual([]);
        expect(B().pure.buildBars({}).bars).toEqual([]);
        expect(B().html({ rows: [] })).toBe('');
    });

    test('主结果以外只有一行非金额（税率）：仍凑不出两根', () => {
        const res = B().pure.buildBars(outOf(money('应纳增值税', 1200), [
            { label: '适用税率', value: 0.13, kind: 'percent' }
        ]));
        expect(res.bars).toEqual([]);
    });
});

// ====== ② 负数与 0 不上条 ======
describe('不上条的数', () => {
    test('0 不画：拿 0 充一根条，等于说"这一项算出来是零"', () => {
        const res = B().pure.buildBars(outOf(money('应纳增值税', 1200), [money('进项税额', 0)]));
        expect(res.bars).toEqual([]);
    });

    test('负数不画：条没有负长度，取绝对值就成了一个不存在的数', () => {
        const res = B().pure.buildBars(outOf(money('应纳增值税', 1200), [money('留抵税额', -800)]));
        expect(res.bars.map((b) => b.label)).toEqual([]);
    });

    // 主结果例外：它是这一页的主角。「这个季度不用交税」是一条结论，滤掉就是把它藏了
    // （实测：增值税小规模默认入参下主结果就是 0 —— 小微免征）。明细行里的 0 仍然不画。
    test('主结果为 0 仍上条：它是结论，不是噪音', () => {
        const res = B().pure.buildBars(outOf(money('应纳增值税', 0), [
            money('本季免征额度', 30000),
            money('城建税', 0)
        ]));
        expect(res.bars.map((b) => b.label)).toEqual(['应纳增值税', '本季免征额度']);
        expect(res.bars[0]).toMatchObject({ primary: true, value: 0, width: 2 });
    });

    test('负的主结果也不画（条没有负长度）—— 只剩一根时整块不出现', () => {
        const res = B().pure.buildBars(outOf(money('应退税额', -500), [
            money('已预缴', 2000),
            money('应纳税额', 1500)
        ]));
        expect(res.bars.map((b) => b.label)).toEqual(['已预缴', '应纳税额']);
        // 只剩一根（主结果为负被滤掉后）→ 凑不出两根，不画
        expect(B().pure.buildBars(outOf(money('应退税额', -500), [money('已预缴', 2000)]))).toEqual({
            bars: [], basis: 0, truncated: false
        });
    });

    test('非金额行（税率 / 月份数 / 文本）一律不上条', () => {
        const res = B().pure.buildBars(outOf(money('应纳增值税', 1200), [
            { label: '适用税率', value: 0.13, kind: 'percent' },
            { label: '月份数', value: 6, kind: 'number' },
            { label: '计税方法', value: '一般计税', kind: 'text' },
            money('销项税额', 3000)
        ]));
        expect(res.bars.map((b) => b.label)).toEqual(['应纳增值税', '销项税额']);
    });

    test('主结果本身不是金额（如「实际税负率」）：它不上条，条由金额行组成', () => {
        const res = B().pure.buildBars(outOf({ label: '实际税负率', value: 0.13, kind: 'percent' }, [
            money('销项税额', 3000),
            money('进项税额', 1800)
        ]));
        expect(res.bars.map((b) => b.label)).toEqual(['销项税额', '进项税额']);
    });
});

// ====== 排序与刻度 ======
describe('排序与刻度', () => {
    test('主结果固定排第一（它是这一页的主角），其余按金额从大到小', () => {
        const res = B().pure.buildBars(outOf(money('应纳增值税', 1200), [
            money('进项税额', 18000),
            money('销项税额', 30000),
            money('城建税', 84)
        ]));
        expect(res.bars.map((b) => b.label)).toEqual(['应纳增值税', '销项税额', '进项税额', '城建税']);
    });

    test('最长一项 = 100%，主结果标出来', () => {
        const res = B().pure.buildBars(outOf(money('应纳增值税', 1200), [
            money('销项税额', 3000),
            money('进项税额', 1800)
        ]));
        expect(res.basis).toBe(3000);
        expect(res.bars[0]).toMatchObject({ label: '应纳增值税', width: 40, primary: true });
        expect(res.bars[1]).toMatchObject({ label: '销项税额', width: 100, primary: false });
        expect(res.bars[2]).toMatchObject({ width: 60 });
    });

    test('极小的项也留 2% 可见（不至于退化成"看起来没画"）', () => {
        const res = B().pure.buildBars(outOf(money('应纳增值税', 1200), [money('印花税', 1)]));
        expect(res.bars[1].width).toBe(2);
    });

    test('主结果与明细行同名只留一根', () => {
        const res = B().pure.buildBars(outOf(money('应纳增值税', 1200), [
            money('应纳增值税', 1200),
            money('销项税额', 3000)
        ]));
        expect(res.bars.map((b) => b.label)).toEqual(['应纳增值税', '销项税额']);
    });

    test('最多 5 根，超出的在说明里写清楚（不静默截断）', () => {
        const rows = [];
        for (let i = 1; i <= 8; i++) rows.push(money('明细' + i, 100 * i));
        const res = B().pure.buildBars(outOf(money('应纳增值税', 1200), rows), { max: 5 });
        expect(res.bars.length).toBe(5);
        expect(res.truncated).toBe(true);
        expect(B().html(outOf(money('应纳增值税', 1200), rows), { max: 5, fmt: yuan }))
            .toContain('只列金额最大的 5 项');
    });
});

// ====== 渲染 ======
describe('渲染', () => {
    function htmlOf(out) {
        return B().html(out, { fmt: yuan });
    }

    test('主结果条用品牌色，其余用中性灰（不给"税额""扣除"各配一个色）', () => {
        const html = htmlOf(outOf(money('应纳增值税', 1200), [money('销项税额', 3000)]));
        expect(html).toContain('result-bar__fill"');
        expect(html).toContain('result-bar__fill--plain');
        // 主结果那根在前
        expect(html.indexOf('result-bar__fill"')).toBeLessThan(html.indexOf('result-bar__fill--plain'));
    });

    test('说明写清"不构成加减关系"：这张条只比大小，不是瀑布也不是构成图', () => {
        expect(htmlOf(outOf(money('应纳增值税', 1200), [money('销项税额', 3000)])))
            .toContain('不构成加减关系');
    });

    test('默认展开、可收起：折叠的本意是别占地方，藏起来则是把信息拿走', () => {
        const html = htmlOf(outOf(money('应纳增值税', 1200), [money('销项税额', 3000)]));
        expect(html).toContain('<details class="result-bars-box mt-4" open>');
        expect(html).toContain('可收起');
    });

    test('行名里的尖括号被转义（不拿用户输入拼 HTML）', () => {
        const html = htmlOf(outOf(money('<img src=x>', 1200), [money('销项<script>', 3000)]));
        expect(html).not.toContain('<img src=x>');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;');
    });

    test('格式化用传进来的那个：不在这里另起一套金额格式', () => {
        const html = B().html(outOf(money('应纳增值税', 1200), [money('销项税额', 3000)]), {
            fmt: () => 'FORMATTED'
        });
        expect(html).toContain('FORMATTED');
        expect(html).not.toContain('¥');
    });

    test('toolbox 不在时也有兜底格式（不至于把 undefined 画到页面上）', () => {
        const html = B().html(outOf(money('应纳增值税', 1200), [money('销项税额', 3000)]));
        expect(html).toContain('¥1,200.00');
        expect(html).not.toContain('undefined');
    });
});
