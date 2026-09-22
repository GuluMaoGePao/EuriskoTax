/**
 * 阶段19-10 · 效率层 E3（台账）守护测试
 *
 * 台账的坏法不是报错，是三种**悄悄的错**：
 *
 *   ① 悄悄变成第二个历史：本体必须是 taxCalculationHistory，台账只是它之上的一层索引。
 *      一旦开始往台账里抄一份"自己的记录"，用户删掉历史里的那条，台账里还留着一堆
 *      点开什么都没有的行 —— 那是把一件东西变成两件东西最常见的走法。
 *      守护：历史删了一条，台账里对应的行立刻消失（这一条同时在 data-management 里连了线）。
 *   ② 悄悄超过边界：台账往前一步就是"申报台"（要申报表、要回执、要对接税局）。
 *      本阶段只做记账：status 是**用户给自己看的进度**，系统不根据它做任何事。
 *      守护：索引写不进去 / 读坏了，历史一条不少、一个数都没改。
 *   ③ 悄悄改口径：期间默认从记录自己的 date 推，只有用户**显式改过**时才写覆盖值。
 *      若默认也写进索引，用户改了期间后就会出现"两边不一致时听谁的"这种永久难题。
 *      守护：attach 不写 periodKey；setPeriod 才写。
 *   ④ 权益在"视野"上，不在"数据"上：免费看近 3 个月，更老的**一条都不删**。
 *      守护：老期间的行从 visible 里消失、仍留在 rows / 存储里；升级后原地出现。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

const L = () => window.EuriskoLedger;
const ENT = () => window.EuriskoEntities;

beforeAll(() => {
    // 台账只依赖数据层与 entity 归属；不加载整套 quick —— 它是**历史之上的索引**，
    // 不该知道任何计税的事（这条本身也是边界：知道计税的台账就变成第二个向导）。
    loadSource('src/js/data/entity-store.js');
    loadSource('src/js/data/template-store.js');
    loadSource('src/js/data/ledger-store.js');
});

beforeEach(() => {
    localStorage.clear();
    delete window.EuriskoPlan;
    delete window.apiClient;   // 与 entity-template 同一处：ownerId 会串用例
});

// 两种历史写入形态都要覆盖（见 ledger-store.toolIdOf 的注释）：
//   · 速算器：type='quick'，toolId 写在 toolId 上
//   · 完整测算：toolId 写在 type 上
function seedHistory(list) {
    localStorage.setItem('taxCalculationHistory', JSON.stringify(list));
}

function historyId(at, toolId, source) {
    return {
        id: 'h_' + at.replace(/[^\d]/g, ''),
        date: at,
        title: (toolId || '测算') + ' - ' + at.slice(0, 10),
        type: source === 'quick' ? 'quick' : toolId,
        toolId: source === 'quick' ? toolId : undefined,
        source: source || 'deep',
        values: { salary: 10000 },
        results: { totalTax: 500 }
    };
}

const monthsAgo = (n) => {
    const d = new Date('2026-06-15T10:00:00.000Z');
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 15, 10, 0, 0));
    return t.toISOString();
};

// ====== ① 本体仍是历史：索引不是第二份记录 ======

test('台账索引里不存任何测算内容 —— 它只存历史里查不到的东西', () => {
    const rec = historyId(monthsAgo(0), 'salary-tax', 'quick');
    seedHistory([rec]);
    L().attach(rec.id);
    const raw = JSON.parse(localStorage.getItem(L().KEY));
    const str = JSON.stringify(raw);
    // 值 / 结果 / 标题 / 工具 id：一个都不许出现在索引文档里
    // （注：不拿 rec.date 当针 —— id 由它派生，撞在日期子串上属于自伤）
    ['"salary":', '"totalTax"', 'salary-tax', '"values"', '"results"', '"title"', '"date"'].forEach((needle) => {
        expect(str).not.toContain(needle);
    });
    // 索引里能有的就这么几样 —— 多一个字段都得有理由
    const owner = Object.keys(raw.owners)[0];
    expect(Object.keys(raw.owners[owner][rec.id]).sort())
        .toEqual(['entityId', 'historyId', 'status', 'updatedAt']);
    // 而它们必须还在历史里 —— 索引的存在不能改变本体一个字节
    expect(JSON.parse(localStorage.getItem('taxCalculationHistory'))[0].id).toBe(rec.id);
});

test('历史记录删掉后，台账里那一行跟着消失（不留指向空气的行）', () => {
    // 两条不能同一瞬间：id 由时间派生，撞了就是同一条记录，这条测试就成了自说自话
    const a = historyId(monthsAgo(0), 'salary-tax', 'quick');
    const b = historyId(monthsAgo(0).replace('T10', 'T11'), 'vat', 'quick');
    seedHistory([a, b]);
    L().attach(a.id);
    L().attach(b.id);
    expect(L().rows().map((r) => r.historyId).sort()).toEqual([a.id, b.id].sort());

    // data-management 的 deleteHistoryRecord 就是这么删的：过滤本体 + 写回 localStorage
    const list = JSON.parse(localStorage.getItem('taxCalculationHistory')).filter((r) => r.id !== a.id);
    localStorage.setItem('taxCalculationHistory', JSON.stringify(list));
    L().remove(a.id);

    expect(L().rows().map((r) => r.historyId)).toEqual([b.id]);
});

// ====== ② 坏数据不许连累历史 ======

test('索引文档读坏了，历史一条不少 —— 台账只是标注，不是数据', () => {
    const rec = historyId(monthsAgo(0), 'salary-tax', 'quick');
    seedHistory([rec]);
    localStorage.setItem(L().KEY, '{不是合法JSON');
    expect(L().rows().length).toBe(1);
    expect(L().rows()[0].historyId).toBe(rec.id);
    expect(JSON.parse(localStorage.getItem('taxCalculationHistory')).length).toBe(1);
});

test('存储不可用时 attach 不能把保存搞挂：历史已经写成功就得留着', () => {
    const rec = historyId(monthsAgo(0), 'salary-tax', 'quick');
    seedHistory([rec]);
    const real = window.localStorage.setItem;
    window.localStorage.setItem = jest.fn(() => { throw new Error('quota'); });
    expect(() => L().attach(rec.id)).not.toThrow();
    window.localStorage.setItem = real;
    // 历史已经写成功了 —— 台账写失败不能让它回滚到"没保存过"
    expect(JSON.parse(localStorage.getItem('taxCalculationHistory')).length).toBe(1);
});

// ====== ③ 期间：默认推导，改了才写 ======

test('attach 不覆盖期间：期间默认从记录的 date 推', () => {
    const rec = historyId(monthsAgo(1), 'salary-tax', 'quick');     // 上个月
    seedHistory([rec]);
    L().attach(rec.id);
    expect(L().rows()[0].periodKey).toBe(L().pure.prevPeriod(L().pure.periodKeyOf(monthsAgo(0))));
    const stored = JSON.parse(localStorage.getItem(L().KEY));
    const owner = Object.keys(stored.owners)[0];
    expect(stored.owners[owner][rec.id].periodKey).toBeUndefined();   // 没写 —— 覆盖值是例外
});

test('只有用户显式改期间才写覆盖值，且错误的期间被就地拦下', () => {
    const rec = historyId(monthsAgo(0), 'salary-tax', 'quick');
    seedHistory([rec]);
    L().attach(rec.id);
    expect(L().setPeriod(rec.id, '2025-11').ok).toBe(true);
    expect(L().rows()[0].periodKey).toBe('2025-11');
    expect(L().setPeriod(rec.id, '去年Q4').ok).toBe(false);
    expect(L().rows()[0].periodKey).toBe('2025-11');   // 拦下 = 保持原值，不是变成空
});

test('期间轴就是月：addMonths / prevPeriod 跨年不错位', () => {
    const p = L().pure;
    expect(p.prevPeriod('2026-01')).toBe('2025-12');
    expect(p.addMonths('2026-12', 1)).toBe('2027-01');
    expect(p.prevPeriod('2026-00')).toBe('');      // 非法的期间不猜
    expect(p.isValidPeriodKey('2026-13')).toBe(false);
    expect(p.monthLabel('2026-03')).toContain('2026 年 3 月');
});

// ====== ④ 归属：默认当前主体，且与 entity 卸载互不影响 ======

test('默认挂到当前主体；没建主体就挂全局（台账不是主体的附属品）', () => {
    const a = historyId(monthsAgo(0), 'salary-tax', 'quick');
    const b = historyId(monthsAgo(0), 'salary-tax', 'quick');
    seedHistory([a, b]);
    expect(L().attach(a.id).ok).toBe(true);
    expect(L().rows()[0].entityId).toBeNull();      // 没主体：照样能归档

    ENT().save({ name: '甲主体' });
    expect(L().attach(b.id).ok).toBe(true);
    expect(L().rows().filter((r) => r.historyId === b.id)[0].entityId).toBe(ENT().currentId());
});

test('删主体不删台账：原来挂它下面的记录转回全局，一条不少', () => {
    const rec = historyId(monthsAgo(0), 'salary-tax', 'quick');
    seedHistory([rec]);
    ENT().save({ name: '甲主体' });
    L().attach(rec.id);
    const eid = ENT().currentId();
    ENT().remove(eid);
    expect(L().rows().length).toBe(1);
    expect(L().rows()[0].entityId).toBe(eid);       // 索引不知道主体没了 —— 它是标注，不是财务数据
    // 界面那一侧要把不了实体的名字显示为「（主体已删）」，但**不能把这条账删掉**：
    // 删掉它等于把用户上个月算过这件事从世界上抹掉，只是因为改了一个标签。
});

// ====== ⑤ 权益在视野上，不在数据上 ======

test('免费只看近 3 个月，更老的一条都不删（升级后原地出现）', () => {
    const rows = [0, 1, 2, 3, 5].map((n) => historyId(monthsAgo(n), 'salary-tax', 'quick'));
    seedHistory(rows);
    rows.forEach((r) => L().attach(r.id));

    const nowKey = L().pure.periodKeyOf(monthsAgo(0));
    expect(L().retentionFloorKey(nowKey)).toBe(L().pure.addMonths(nowKey, -2));   // 近 3 个月
    expect(L().rows().length).toBe(5);        // 全部还在
    expect(L().visibleRows(nowKey).length).toBe(3);
    expect(L().hiddenCount(nowKey)).toBe(2);

    window.EuriskoPlan = { isPro: () => true };
    window.apiClient = { getCurrentUser: () => ({ id: 'u1', plan: 'pro' }) };
    expect(L().visibleRows(nowKey).length).toBe(5); // 没回填任何数据 —— 只是视野打开了
    expect(L().retentionFloorKey(nowKey)).toBe('');
});

// ====== ⑥ 「复制上月」：同一工具 + 同一主体，上一期最新那条 ======

test('复制上月取的是同一工具同一主体上一期最新那条', () => {
    const tool = 'salary-tax';
    ENT().save({ name: '甲主体' });
    const eid = ENT().currentId();
    const older = { id: 'old', date: monthsAgo(1), type: 'quick', toolId: tool, source: 'quick', values: { salary: 1 } };
    const newer = { id: 'new', date: monthsAgo(1).replace('T10', 'T22'), type: 'quick', toolId: tool, source: 'quick', values: { salary: 2 } };
    const otherTool = { id: 'oth', date: monthsAgo(1), type: 'quick', toolId: 'vat', source: 'quick', values: { salary: 3 } };
    seedHistory([older, newer, otherTool]);
    [older, newer, otherTool].forEach((r) => L().attach(r.id));

    const hit = L().prevMonthValues({ toolId: tool, entityId: eid, periodKey: L().pure.periodKeyOf(monthsAgo(0)) });
    expect(hit.record.id).toBe('new');            // 上一期里时间最新那条
    expect(hit.periodKey).toBe(L().pure.addMonths(L().pure.periodKeyOf(monthsAgo(0)), -1));

    // 换了工具就找不到：跨工具复制会把别的口径的参数塞过来
    expect(L().prevMonthValues({ toolId: 'net-salary', entityId: eid, periodKey: L().pure.periodKeyOf(monthsAgo(0)) })).toBeNull();
});

test('复制上月区分主体：代账几家客户的参数不能互相串', () => {
    const nowKey = L().pure.periodKeyOf(monthsAgo(0));
    const prevKey = L().pure.addMonths(nowKey, -1);
    ENT().save({ name: '甲' });
    const aId = ENT().currentId();
    const a = { id: 'a1', date: monthsAgo(1), type: 'quick', toolId: 'salary-tax', source: 'quick', values: { salary: 1 } };
    seedHistory([a]);
    L().attach(a.id, { entityId: aId });
    expect(L().prevMonthValues({ toolId: 'salary-tax', entityId: aId, periodKey: nowKey }).record.id).toBe('a1');
    expect(L().prevMonthValues({ toolId: 'salary-tax', entityId: null, periodKey: nowKey })).toBeNull();
    expect(prevKey).toBe(L().pure.prevPeriod(nowKey));
});

// ====== ⑦ 账户隔离（沿用 entity-store 的策略）======

test('换账号看不到别人的台账', () => {
    const rec = historyId(monthsAgo(0), 'salary-tax', 'quick');
    seedHistory([rec]);
    window.apiClient = { getCurrentUser: () => ({ id: 'u1' }) };
    L().attach(rec.id);
    expect(L().rows().length).toBe(1);

    window.apiClient = { getCurrentUser: () => ({ id: 'u2' }) };
    expect(L().entries().length).toBe(0);
    // 历史是共享的一件事，所以 row 会从历史补出来 —— 但它没有任何归档标注（没进过台账）
    const rows = L().rows();
    expect(rows.length).toBe(1);
    expect(rows[0].archived).toBe(false);
});

// ====== ⑧ 分组：默认视图是「这个月有哪些事」 ======

test('groupByPeriod 按期倒序，且给不出期间的行单列一组', () => {
    const withDate = historyId(monthsAgo(0), 'salary-tax', 'quick');
    const without = { id: 'nodate', title: '没日期的旧记录', type: 'quick', toolId: 'vat', source: 'quick' };
    seedHistory([withDate, without]);
    [withDate, without].forEach((r) => L().attach(r.id));
    const groups = L().groupByPeriod(L().rows());
    expect(groups[0].periodKey).toBe('2026-06');       // 新的在前
    expect(groups[groups.length - 1].label).toBe('未按期');
    expect(groups[groups.length - 1].rows[0].historyId).toBe('nodate');
});
