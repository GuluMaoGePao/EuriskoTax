// 阶段13E 转化漏斗测试
//   1) FUNNEL_STEPS 白名单契约：它是前端上报与后端入库之间的唯一边界，漏改任一端都会「静默断层」；
//   2) funnelRate 语义：分母为 0 必须返回 null（前端显示「—」），不是 0%；
//   3) 跨端契约漂移守护：前端 api-client 的步骤常量、funnel-tracking 的接线点，都与后端白名单对齐。
//
// 说明：controller 顶层会 new PrismaClient()，这里 mock 掉，使本测试只校验纯契约，
//       不依赖 DATABASE_URL 与已生成的 Prisma Client（与 leads.test.js 同法）。

jest.mock('@prisma/client', () => ({ PrismaClient: class { } }), { virtual: true });

const fs = require('fs');
const path = require('path');

const { _internal: adminInternals } = require('../server/src/controllers/leadAdminController');

const { FUNNEL_STEPS, funnelRate } = adminInternals;

const readSrc = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('阶段13E 转化漏斗 - 埋点步骤契约', () => {
    test('白名单恰为前端上报的 5 个步骤（多一个或少一个都会让漏斗断层）', () => {
        expect(FUNNEL_STEPS).toEqual(['visit', 'calc_done', 'share', 'save', 'lead_click']);
    });

    test('lead_submit 不在上报白名单内（唯一真相是 Lead 表，避免两处存储对不上）', () => {
        expect(FUNNEL_STEPS).not.toContain('lead_submit');
    });

    test('前端 api-client 的步骤常量与后端白名单逐项一致（跨端契约，最易静默漂移）', () => {
        const src = readSrc('src/js/api/api-client.js');
        const matched = src.match(/const FUNNEL_STEPS = \[([^\]]+)\]/);
        expect(matched).not.toBeNull();
        const frontend = matched[1]
            .split(',')
            .map((s) => s.trim().replace(/^'|'$/g, ''))
            .filter(Boolean);
        expect(frontend.slice().sort()).toEqual(FUNNEL_STEPS.slice().sort());
    });

    test('前端埋点接线覆盖全部 5 个步骤的触发点（漏接 = 漏斗永久缺一列）', () => {
        const src = readSrc('src/js/stats/funnel-tracking.js');
        expect(src).toContain('reportVisitOnce');
        expect(src).toContain("report('calc_done')");
        expect(src).toContain("report('save')");
        expect(src).toContain("report('share')");
        expect(src).toContain("report('lead_click')");
    });

    test('lead_click 走 LeadModal 唯一入口而非逐个触点选择器（新增触点无需再改埋点）', () => {
        const src = readSrc('src/js/stats/funnel-tracking.js');
        expect(src).toContain('window.LeadModal');
        expect(src).toContain('__funnelPatched');
    });
});

describe('阶段13E 转化漏斗 - funnelRate 语义', () => {
    test('分母为 0 返回 null（前端显示「—」），而不是 0% —— 0% 会被误读成「转化极差」', () => {
        expect(funnelRate(0, 0)).toBeNull();
        expect(funnelRate(5, 0)).toBeNull();
        expect(funnelRate(5, -1)).toBeNull();
    });

    test('百分比保留 1 位小数', () => {
        expect(funnelRate(1, 3)).toBe(33.3);
        expect(funnelRate(2, 3)).toBe(66.7);
        expect(funnelRate(1, 2)).toBe(50);
    });

    test('分子为 0 且分母 > 0 → 0（确实是 0%，与「无样本」严格区分）', () => {
        expect(funnelRate(0, 10)).toBe(0);
    });

    test('超过 100% 如实返回、不截断（口径不一致时要暴露出来，而不是掩盖）', () => {
        expect(funnelRate(15, 10)).toBe(150);
    });
});
