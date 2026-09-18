// 阶段10/11：账户分层（三档：基础版/体验版/专业版）纯逻辑单测
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source.js');

loadSource('src/js/auth/plan.js');

// 权益文案里的数字（体验天数、方案对比库上限）必须与代码常量同口径，
// 因此这里额外加载 scenario-store.js，把两侧放在同一个测试里比对。
beforeAll(() => {
    loadSource('src/js/data/scenario-store.js');
});

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const INDEX_HTML = readSrc('index.html');

const planLib = () => window.EuriskoPlan;
const futureISO = (days) => new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
const pastISO = (days) => new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

describe('EuriskoPlan 账户分层判定', () => {
    test('free / 未定义 plan 均不是专业版', () => {
        expect(planLib().isPro('free', null)).toBe(false);
        expect(planLib().isPro(undefined, null)).toBe(false);
        expect(planLib().isPro('', null)).toBe(false);
    });

    test('pro 且无过期时间 = 永久专业版（种子期授权）', () => {
        expect(planLib().isPro('pro', null)).toBe(true);
        expect(planLib().isPro('pro', '')).toBe(true);
    });

    test('pro 未过期 = true', () => {
        const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        expect(planLib().isPro('pro', future)).toBe(true);
    });

    test('pro 已过期 = false', () => {
        const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        expect(planLib().isPro('pro', past)).toBe(false);
    });

    test('非法过期时间按永久处理（容错）', () => {
        expect(planLib().isPro('pro', 'not-a-date')).toBe(true);
    });

    test('常量和 PRO gate 文案存在', () => {
        expect(planLib().PLAN_FREE).toBe('free');
        expect(planLib().PLAN_PRO).toBe('pro');
        expect(planLib().TRIAL_DAYS).toBe(14);
        expect(typeof planLib().PRO_FEATURE_HINT).toBe('string');
        expect(planLib().PRO_FEATURE_HINT.length).toBeGreaterThan(0);
    });
});

describe('EuriskoPlan 三档体系（基础版/体验版/专业版）档位描述', () => {
    test('未登录/无用户 → 无档位', () => {
        expect(planLib().describe(null)).toBeNull();
    });

    test('免费用户 = 基础版', () => {
        const t = planLib().getTier('free', null, null);
        expect(t.key).toBe('free');
        expect(t.label).toBe('基础版');
        expect(t.expiredTrial).toBeFalsy();
    });

    test('种子永久授权 = 专业版（无过期）', () => {
        const t = planLib().getTier('pro', null, 'seed');
        expect(t.key).toBe('pro');
        expect(t.label).toBe('专业版');
        expect(t.permanent).toBe(true);
        expect(t.expireAt).toBeNull();
    });

    test('正式授权未过期 = 专业版（有有效期）', () => {
        const iso = futureISO(90);
        const t = planLib().getTier('pro', iso, 'purchase');
        expect(t.key).toBe('pro');
        expect(t.permanent).toBe(false);
        expect(t.expireAt).toBe(iso);
    });

    test('体验进行中（pro + trial + 未过期）= 体验版并计算剩余天数', () => {
        const iso = futureISO(15);
        const t = planLib().getTier('pro', iso, 'trial');
        expect(t.key).toBe('trial');
        expect(t.label).toBe('体验版');
        expect(t.daysLeft).toBe(15);
        expect(t.expireAt).toBe(iso);
    });

    test('体验已到期（pro + trial + 过期）= 回落基础版且可再次领取', () => {
        const iso = pastISO(2);
        const t = planLib().getTier('pro', iso, 'trial');
        expect(t.key).toBe('free');
        expect(t.label).toBe('基础版');
        expect(t.expiredTrial).toBe(true);
        expect(t.expireAt).toBe(iso);
    });

    // 曾经这里落下过一个坑：付费专业版过期后被当成普通免费用户，且 expireAt 被丢弃，
    // 于是这类「已经证明愿意付费」的人看到的是「免费领取体验」，连自己权益什么时候到期都无从得知。
    test('付费专业版已过期 = 基础版权限，但标记 expiredPro 且保留到期时间', () => {
        const iso = pastISO(3);
        const t = planLib().getTier('pro', iso, 'purchase');
        expect(t.key).toBe('free');
        expect(t.label).toBe('基础版');
        expect(t.expiredPro).toBe(true);
        // 与「免费体验到期」是两类人，两者互斥，UI 话术不同
        expect(t.expiredTrial).toBeFalsy();
        // 到期时间不能丢：UI 要靠它说清「权益已于 X 到期」
        expect(t.expireAt).toBe(iso);
    });

    test('兑换码开通的专业版过期后同样标记 expiredPro', () => {
        expect(planLib().getTier('pro', pastISO(1), 'redeem').expiredPro).toBe(true);
    });

    test('永久授权（无过期时间）永不会被当作 expiredPro', () => {
        expect(planLib().getTier('pro', null, 'seed').expiredPro).toBeFalsy();
    });

    test('免费用户既不 expiredTrial 也不 expiredPro', () => {
        const t = planLib().getTier('free', null, null);
        expect(t.expiredTrial).toBeFalsy();
        expect(t.expiredPro).toBeFalsy();
    });

    test('体验版剩余天数边界：不足 1 天按 1 天、永久/免费为 0', () => {
        const t1 = planLib().getTier('pro', new Date(Date.now() + 30 * 60 * 1000).toISOString(), 'trial');
        expect(t1.daysLeft).toBe(1);
        expect(planLib().trialDaysLeft(null)).toBe(0);
        expect(planLib().trialDaysLeft('not-a-date')).toBe(0);
        expect(planLib().trialDaysLeft(pastISO(1))).toBe(0);
    });

    test('describe 接收完整 user 对象（前端会话形态）', () => {
        const t = planLib().describe({ plan: 'pro', plan_expires_at: futureISO(10), pro_granted_by: 'trial' });
        expect(t.key).toBe('trial');
        expect(t.label).toBe('体验版');
        expect(t.daysLeft).toBeGreaterThanOrEqual(9);
    });
});

// 「版本与权益」弹窗列的是**对用户的承诺**：列错一项，用户在付费前后都会来问。
// 这里守住三条已经踩过的坑：① 把全员能力（政策要点）写成专业版权益；
// ② 列一个没有任何实现支撑的权益；③ 弹窗里再硬编码一份版本号。
describe('「版本与权益」弹窗的档位口径', () => {
    const block = (() => {
        const start = INDEX_HTML.indexOf('id="upgrade-modal"');
        const end = INDEX_HTML.indexOf('id="alert-modal"', start);
        // 先剥掉 HTML 注释：注释里会引用「已下线的措辞」做说明，那不是给用户看的文案
        return INDEX_HTML.slice(start, end).replace(/<!--[\s\S]*?-->/g, '');
    })();

    test('政策要点 / 更新公告不得列为专业版专属', () => {
        // 阶段11 起 tax-policy.js 取消免费版短路、游客也发起请求 —— 写进专业版权益等于卖免费能力
        const proStart = block.indexOf('专业版</span>');
        const proCol = block.slice(proStart, block.indexOf('</ul>', proStart));
        expect(proCol).not.toContain('政策');
        // 反过来，它必须出现在基础版（免费）权益里
        expect(block).toMatch(/政策要点与更新公告[^<]*<\/li>/);
    });

    test('专业版权益只列真实生效的差异项', () => {
        ['云端同步', '汇算清缴 PDF 完整报告', '方案对比库'].forEach((t) => expect(block).toContain(t));
        // 「优先问题跟进与数据保障」全仓库无对应实现，已下线
        expect(block).not.toContain('优先问题跟进');
    });

    test('标题旁显示当前版本号，且由 __APP_VERSION__ 填充而非硬编码', () => {
        expect(block).toContain('id="upgrade-version"');
        const src = readSrc('src/js/auth/auth-ui.js');
        expect(src).toContain('function renderUpgradeVersion');
        expect(src).toContain('window.__APP_VERSION__');
        // 弹窗内不得再写一份版本号字符串（版本号已有五处同步的维护负担，多一处就多一次漏改）
        expect(block).not.toMatch(/v?\d+\.\d+\.\d+/);
    });

    test('PRO gate 文案不再声称「购买即将开放」，并点明全员能力', () => {
        const hint = planLib().PRO_FEATURE_HINT;
        expect(hint).not.toContain('购买即将开放');
        expect(hint).toContain('兑换码');
        expect(hint).toContain('对所有用户开放');
    });

    // 下面三条守的是「同一件事写在两处、其中一处改了另一处没改」——这类漂移不会报错，
    // 只会让用户在 gate 提示里看到 14 天、在 FAQ 里看到别的天数，或者付费后拿不到文案承诺的额度。
    test('体验天数：弹窗文案 / gate 提示 / plan.js / 服务端授予时长四处同口径', () => {
        const days = String(planLib().TRIAL_DAYS);
        expect(block).toContain(`${days} 天`);
        expect(planLib().PRO_FEATURE_HINT).toContain(`${days} 天专业版体验`);
        // 服务端才是真正发放时长的地方，它不同步就是「文案承诺 ≠ 实际到手」
        const serverSrc = readSrc('server/src/services/authService.js');
        const m = serverSrc.match(/const TRIAL_DAYS = (\d+);/);
        expect(m).not.toBeNull();
        expect(m[1]).toBe(days);
    });

    test('方案对比库上限：弹窗数字取自 scenario-store 常量而非手写', () => {
        const store = window.EuriskoScenarios;
        expect(store).toBeTruthy();
        expect(block).toContain(`方案对比库 ${store.MAX_FREE} 套 → ${store.MAX_PRO} 套`);
    });

    test('gate 提示点名的专业版能力必须都出现在弹窗专业版列（两处清单不能各说各话）', () => {
        const hint = planLib().PRO_FEATURE_HINT;
        const proStart = block.indexOf('专业版</span>');
        const proCol = block.slice(proStart, block.indexOf('</ul>', proStart));
        ['云端同步', '汇算清缴 PDF 完整报告', '方案对比库'].forEach((name) => {
            expect({ name, inHint: hint.includes(name) }).toEqual({ name, inHint: true });
            expect({ name, inProCol: proCol.includes(name) }).toEqual({ name, inProCol: true });
        });
    });
});

// gate 提示一度对所有人都是同一句（「基础版可免费领取 14 天体验」），对三类人是错的：
// 付费权益过期的人被降级、体验中的人被当成没在用、体验过期的人没被告知还能再领。
// 这里守住「一句话对一个身份」，以及那份能力清单只有一处、不会随档位漂移。
describe('gate 提示按档位取词', () => {
    const userOf = (plan, expiresAt, grantedBy) => ({ plan, plan_expires_at: expiresAt, pro_granted_by: grantedBy });
    const hintOf = (plan, expiresAt, grantedBy) => planLib().featureHintFor(userOf(plan, expiresAt, grantedBy));

    test('未登录 / 无会话 → 回落默认文案（任何情况下文案都不退化）', () => {
        expect(planLib().featureHintFor(null)).toBe(planLib().PRO_FEATURE_HINT);
        expect(planLib().featureHintFor(undefined)).toBe(planLib().PRO_FEATURE_HINT);
    });

    test('基础版 = 默认文案（同时保留免费体验与兑换码两条路径）', () => {
        expect(hintOf('free', null, null)).toBe(planLib().PRO_FEATURE_HINT);
    });

    test('体验进行中：不再叫他去领取体验（他已经在体验期内了）', () => {
        const hint = hintOf('pro', futureISO(10), 'trial');
        expect(hint).toBe(planLib().TRIAL_ACTIVE_HINT);
        expect(hint).not.toContain('可免费领取');
    });

    test('体验已到期：明确告知还能再领一轮', () => {
        const hint = hintOf('pro', pastISO(2), 'trial');
        expect(hint).toBe(planLib().EXPIRED_TRIAL_HINT);
        expect(hint).toContain('再次免费领取');
    });

    test('付费权益已到期：给恢复入口，而不是把他推回免费体验', () => {
        const hint = hintOf('pro', pastISO(2), 'purchase');
        expect(hint).toBe(planLib().EXPIRED_PRO_HINT);
        expect(hint).toContain('恢复权益');
        // 这条最关键：付过钱的人收到的不该只是「再去领一轮免费体验」
        expect(hint).not.toContain('可免费领取');
    });

    test('兑换码开通的权益过期后，同样按付费口径处理', () => {
        expect(hintOf('pro', pastISO(2), 'redeem')).toBe(planLib().EXPIRED_PRO_HINT);
    });

    test('四种身份对应四条各不相同的提示（口径没被合并掉）', () => {
        const hints = [
            hintOf('free', null, null),
            hintOf('pro', futureISO(10), 'trial'),
            hintOf('pro', pastISO(2), 'trial'),
            hintOf('pro', pastISO(2), 'purchase')
        ];
        expect(new Set(hints).size).toBe(4);
    });

    test('能力清单不随档位漂移：四条提示共用同一份能力描述', () => {
        [
            planLib().PRO_FEATURE_HINT,
            planLib().TRIAL_ACTIVE_HINT,
            planLib().EXPIRED_TRIAL_HINT,
            planLib().EXPIRED_PRO_HINT
        ].forEach((hint) => {
            expect({ start: hint.startsWith(planLib().GATE_CAPABILITIES) }).toEqual({ start: true });
            ['云端同步', '汇算清缴 PDF 完整报告', '方案对比库', '对所有用户开放'].forEach((name) => {
                expect({ name, inHint: hint.includes(name) }).toEqual({ name, inHint: true });
            });
        });
    });

    test('所有身份的 gate 提示都不出现购买语义（站内零购买语义）', () => {
        const cases = [
            null,
            userOf('free', null, null),
            userOf('pro', futureISO(10), 'trial'),
            userOf('pro', pastISO(2), 'trial'),
            userOf('pro', pastISO(2), 'purchase'),
            userOf('pro', null, 'seed')
        ];
        ['购买', '续费', '支付', '价格', '付款'].forEach((word) => {
            cases.forEach((user) => {
                expect({ word, hit: planLib().featureHintFor(user).includes(word) }).toEqual({ word, hit: false });
            });
        });
    });
});
