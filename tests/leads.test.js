// 阶段13 转化线索测试
//   1) buildLead 归一化契约：必填项 / 联系方式二选一 / 手机号格式 / consent 强校验 /
//      枚举白名单回落 / 长度上限 / trim（前后端字段契约，易静默失效）
//   2) 管理端纯函数契约：buildWhere 筛选构造、csvCell 转义与公式注入防护
//
// 说明：两个 controller 顶层都会 new PrismaClient()，这里 mock 掉，
//       使本测试只校验纯数据契约，不依赖 DATABASE_URL 与已生成的 Prisma Client。
//       virtual: 根目录解析不到 @prisma/client（它安装在 server/node_modules 下），占位实现即可。

jest.mock('@prisma/client', () => ({ PrismaClient: class { } }), { virtual: true });

const { _internal: leadInternals } = require('../server/src/controllers/leadController');
const { _internal: adminInternals } = require('../server/src/controllers/leadAdminController');

const { buildLead } = leadInternals;
const { buildWhere, csvCell } = adminInternals;

// 最小合法留资（游客：只有姓名 + 手机号 + 同意）
const BASE = { name: '王工', phone: '13800138000', consent: true };

describe('阶段13 转化线索 - buildLead 归一化契约', () => {
    test('最小合法入参 → 归一化为数据库行（选填字段回落默认）', () => {
        const { data, error } = buildLead(BASE);
        expect(error).toBeUndefined();
        expect(data.name).toBe('王工');
        expect(data.phone).toBe('13800138000');
        expect(data.wechat).toBeNull();
        expect(data.company).toBeNull();
        expect(data.entity_type).toBe('unknown');
        expect(data.need).toBe('other');
        expect(data.source).toBe('unknown');
        expect(data.scene).toBe('');
        expect(data.note).toBe('');
        expect(data.consent).toBe(true);
    });

    test('name 必填：空串 / 纯空白 / 非字符串 / 缺字段 均报错', () => {
        expect(buildLead({ ...BASE, name: '' }).error).toContain('name');
        expect(buildLead({ ...BASE, name: '   ' }).error).toContain('name');
        expect(buildLead({ ...BASE, name: 123 }).error).toContain('name');
        expect(buildLead({ phone: '13800138000', consent: true }).error).toContain('name');
        expect(buildLead(undefined).error).toContain('name');
    });

    test('name 超长（> 50）报错，边界值恰好通过', () => {
        expect(buildLead({ ...BASE, name: 'x'.repeat(leadInternals.NAME_MAX) }).error).toBeUndefined();
        expect(buildLead({ ...BASE, name: 'x'.repeat(leadInternals.NAME_MAX + 1) }).error).toContain('name');
    });

    test('phone 与 wechat 至少提供一个（只留微信的线索也必须能进来）', () => {
        expect(buildLead({ name: '王工', consent: true }).error).toContain('phone or wechat');
        expect(buildLead({ name: '王工', wechat: 'wxid_abc', consent: true }).error).toBeUndefined();
    });

    test('手机号必须匹配大陆 11 位格式（12x/短号/超长/非数字全部拒绝）', () => {
        ['12800138000', '1380013800', '138001380000', 'abcdefghijk', '138 0013 8000'].forEach((p) => {
            expect(buildLead({ ...BASE, phone: p }).error).toContain('Invalid phone');
        });
    });

    test('consent 必须严格为 true（个保法显式同意，字符串 "true" 不算）', () => {
        expect(buildLead({ ...BASE, consent: false }).error).toContain('consent');
        expect(buildLead({ ...BASE, consent: 'true' }).error).toContain('consent');
        expect(buildLead({ ...BASE, consent: 1 }).error).toContain('consent');
        expect(buildLead({ ...BASE, consent: undefined }).error).toContain('consent');
    });

    test('非法枚举值回落默认而非报错（不阻断留资，也不写脏数据）', () => {
        const { data, error } = buildLead({ ...BASE, entityType: 'hacker', need: 'x', source: 'y' });
        expect(error).toBeUndefined();
        expect(data.entity_type).toBe('unknown');
        expect(data.need).toBe('other');
        expect(data.source).toBe('unknown');
    });

    test('合法枚举值原样保留（顾问跟进依赖来源与主体类型分流）', () => {
        const { data } = buildLead({ ...BASE, entityType: 'sole', need: 'settlement', source: 'result_business' });
        expect(data.entity_type).toBe('sole');
        expect(data.need).toBe('settlement');
        expect(data.source).toBe('result_business');
    });

    test('字符串字段统一 trim（顾问复制手机号/公司名常带空格）', () => {
        const { data } = buildLead({ ...BASE, name: '  王工  ', phone: ' 13800138000 ', company: ' xx公司 ' });
        expect(data.name).toBe('王工');
        expect(data.phone).toBe('13800138000');
        expect(data.company).toBe('xx公司');
    });

    test('note 超长报错（防超长文本撑爆库容）', () => {
        expect(buildLead({ ...BASE, note: 'x'.repeat(leadInternals.NOTE_MAX) }).error).toBeUndefined();
        expect(buildLead({ ...BASE, note: 'x'.repeat(leadInternals.NOTE_MAX + 1) }).error).toContain('note');
    });

    test('scene 超长报错（情境快照来自端上，长度需受控）', () => {
        expect(buildLead({ ...BASE, scene: 'x'.repeat(leadInternals.SCENE_MAX + 1) }).error).toContain('scene');
    });

    test('source 白名单覆盖四条触点链路（结果页/内容中心/个人中心/分享）', () => {
        // 结果页只投三类（工资与谈薪刻意不出服务引导）
        ['result_business', 'result_settlement', 'result_budget'].forEach((s) => {
            expect(leadInternals.SOURCES).toContain(s);
        });
        ['home_banner', 'modal', 'notice_list', 'profile', 'share', 'unknown'].forEach((s) => {
            expect(leadInternals.SOURCES).toContain(s);
        });
    });

    test('去重窗口为 24 小时（同号重复提交的幂等边界）', () => {
        expect(leadInternals.DEDUPE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    });
});

describe('阶段13 转化线索 - 管理端纯函数契约', () => {
    test('buildWhere：仅接受状态机白名单内的状态，非法状态不生成筛选条件', () => {
        expect(buildWhere({ status: 'new' })).toEqual({ status: 'new' });
        expect(buildWhere({ status: 'converted' })).toEqual({ status: 'converted' });
        expect(buildWhere({ status: 'nope' })).toEqual({});
        expect(buildWhere({})).toEqual({});
        expect(buildWhere()).toEqual({});
    });

    test('buildWhere：source 与 status 可叠加', () => {
        expect(buildWhere({ status: 'new', source: 'share' })).toEqual({ status: 'new', source: 'share' });
    });

    test('buildWhere：q 生成 name / phone / company 三字段 OR 子串匹配', () => {
        const where = buildWhere({ q: ' 王 ' });
        expect(Array.isArray(where.OR)).toBe(true);
        expect(where.OR).toHaveLength(3);
        expect(where.OR.map((c) => Object.keys(c)[0])).toEqual(['name', 'phone', 'company']);
    });

    test('buildWhere：q 为空串 / 纯空白不生成 OR（避免无谓的全字段扫描）', () => {
        expect(buildWhere({ q: '   ' }).OR).toBeUndefined();
        expect(buildWhere({ q: '' }).OR).toBeUndefined();
        expect(buildWhere({ q: 123 }).OR).toBeUndefined();
    });

    test('csvCell：统一包裹双引号并转义内部引号', () => {
        expect(csvCell('a"b')).toBe('"a""b"');
        expect(csvCell(null)).toBe('""');
        expect(csvCell(undefined)).toBe('""');
        expect(csvCell(12)).toBe('"12"');
        expect(csvCell('普通文本')).toBe('"普通文本"');
    });

    test('csvCell：公式注入防护（= + - @ 开头前置单引号，防 Excel 执行）', () => {
        expect(csvCell('=1+1')).toBe('"\'=1+1"');
        expect(csvCell('+86')).toBe('"\'+86"');
        expect(csvCell('-1')).toBe('"\'-1"');
        expect(csvCell('@a')).toBe('"\'@a"');
    });

    test('状态机枚举与前台下拉一致（新增状态必须同步管理台）', () => {
        expect(adminInternals.LEAD_STATUSES).toEqual(['new', 'contacted', 'qualified', 'converted', 'dropped']);
    });
});
