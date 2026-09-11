// 排障话术库：内置种子数据 + 启动兜底播种 / 手动恢复内置条目
//
// 设计要点：
//   1. 这是「客服内部资产」，不参与用户端投放，因此独立于 ContentItem
//      （ContentItem 带 placements/audience 分层与端上可见性判定，混用会有误投放风险）；
//   2. 表为空时在服务启动阶段幂等播种（与 authService.ensureInviteCodes 同思路），
//      保证首次部署后管理台「排障」Tab 立刻有内容，而不是一个空列表；
//   3. 播种只在表为空时发生，之后一律以数据库为准——运维在后台的编辑不会被覆盖；
//      若内置条目被误删，用 restoreBuiltinScripts() 按 script_id 补回（POST /api/admin/support/restore）。
//
// 维护提示：话术正文与 docs/guides/support-playbook.md 对应，改动时请同步文档。
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 分类枚举（与前端筛选下拉、后台表单保持一致）
const CATEGORIES = {
    cache: '缓存 / 版本',
    account: '账号 / 登录',
    data: '数据 / 同步',
    pay: '权益 / 兑换码',
    usage: '功能使用'
};

// 内置话术。script 中的 {RESET_URL} 由端上替换为当前站点的 /reset 短链。
const SEED_SCRIPTS = [
    {
        script_id: 'stale-page',
        category: 'cache',
        title: '发版后仍看到旧版页面 / 功能没更新',
        symptom: '界面与最新版本对不上（区块划分、文案、按钮行为不一致），或点击后毫无反应。',
        steps: [
            '先让用户看首页底部的「版本 x.y.z」，与当前线上版本核对。',
            '把排障短链发给用户：会自动注销 Service Worker、清空离线缓存并跳回首页。',
            '用户回来后再次核对底部版本号，应已是最新。',
            '若仍为旧版：让用户用无痕窗口打开同址。无痕下正常，说明是其常规窗口的缓存污染。',
            '仍不正常则换浏览器（Edge ↔ Chrome）复测，据此判断是否单个浏览器的问题。'
        ],
        script: '你看到的是旧版页面，按下面步骤可以自动修复：\n1. 打开这个链接（会自动清理旧缓存并回到首页）：\n{RESET_URL}\n2. 等页面提示「已完成」后会自动跳转。\n此操作不会影响你的登录状态和已保存的计算记录。\n如果还是旧版，请告诉我，我再帮你进一步排查。',
        priority: 100
    },
    {
        script_id: 'login-stuck',
        category: 'cache',
        title: '登录 / 注册按钮点不动、协议弹窗不出来',
        symptom: '输入手机号或邮箱后点击按钮无反应；或登录页应弹出的《用户协议》《隐私政策》弹窗不出现。',
        steps: [
            '确认不是网络问题：让用户换网络（如切到手机热点）复测一次。',
            '走缓存重置：发送排障短链，让用户在清理后的页面重试。',
            '若清理后正常，判定为旧版脚本残留（旧包与新 HTML 混用）。',
            '若清理后仍无反应：让用户按 F12 打开控制台，截图报错信息回传，据此定位具体脚本。'
        ],
        script: '这个现象通常是浏览器里的旧缓存导致的，请按下面步骤操作：\n1. 先关闭当前页面；\n2. 打开这个链接自动清理并回到首页：\n{RESET_URL}\n3. 重新登录试试。\n如果还是点不动，麻烦在页面上按 F12，把红色报错截图发我，我马上排查。',
        priority: 90
    },
    {
        script_id: 'blank-screen',
        category: 'cache',
        title: '页面白屏 / 一直转圈打不开',
        symptom: '进入站点后一直空白、或长时间停留在加载动画，始终进不去。',
        steps: [
            '先确认服务端状态：访问 /health，返回 {"status":"ok"} 说明服务正常，问题在客户端。',
            '让用户走排障短链重置缓存后重进。',
            '若短链也打不开：让用户换浏览器或无痕窗口访问，排除单浏览器扩展干扰。',
            '若全平台都无法访问：查服务端日志与部署状态，按线上故障处理。'
        ],
        script: '页面打不开通常是本地缓存异常，请试一下：\n1. 打开这个链接（一键重置，会自动回到首页）：\n{RESET_URL}\n2. 如果还是不行，请换一个浏览器（比如从 Edge 换成 Chrome）再打开。\n麻烦把结果告诉我，我这边同步检查服务状态。',
        priority: 60
    },
    {
        script_id: 'offline-stale',
        category: 'cache',
        title: '断网后看到的还是旧内容 / 离线打不开',
        symptom: '断网时打开的页面版本很旧；或提示无法访问，看不到任何内容。',
        steps: [
            '说明机制：离线可用的前提是「联网状态下打开过该页面」——资源才会落入本地缓存。',
            '让用户联网打开一次站点，把常用页面各访问一遍，之后即可离线使用。',
            '若之前访问过仍打不开，让用户走排障短链重置后再联网完整访问一次。'
        ],
        script: '离线打开需要先「联网访问过一次」作为铺垫，缓存里才会有内容。\n请你在有网的情况下：\n1. 打开 {RESET_URL} 完成一次重置；\n2. 回到首页，把常用的计算页面都点开一遍；\n3. 之后再断网就能正常打开了。',
        priority: 30
    },
    {
        script_id: 'code-invalid',
        category: 'pay',
        title: '兑换码无效 / 专业版没生效',
        symptom: '输入兑换码提示无效、已使用；或提示成功但功能仍是基础版。',
        steps: [
            '到管理台「兑换码」页核对：该码是否在「可用」列表、是否已出现在「已使用」列表（一机一码，用过即失效）。',
            '到「用户」页搜索该用户，确认 plan 字段是否已变为 pro、有效期是否正确。',
            '若端上未刷新：让用户退出登录再重新登录，或走一次排障短链后重登。',
            '若权益已发但用户仍看不到：确认是否是同一个账号（手机号 / 邮箱可能与用户以为的不一致）。'
        ],
        script: '我这边查到你的兑换码记录是：{核对结果}。\n请按下面步骤让权益刷新出来：\n1. 打开 {RESET_URL} 完成一次缓存重置；\n2. 重新登录你的账号；\n3. 进入「个人中心」查看权益状态。\n如果仍未生效，把个人中心截图发我，我再核对一次。',
        priority: 80
    },
    {
        script_id: 'no-verify-code',
        category: 'account',
        title: '收不到邮箱验证码',
        symptom: '点击发送后长时间收不到验证码邮件，或提示发送过于频繁。',
        steps: [
            '先看频率限制：验证码为 5 次 / 15 分钟 / IP，超限会提示稍后再试，等待即可。',
            '让用户检查垃圾邮件 / 广告邮件文件夹，并把发件人加入白名单。',
            '确认邮箱地址拼写正确（常见于 .com / .cn、数字与字母混淆）。',
            '若确认无限制且多次未收到：查服务端日志中的邮件发送记录，必要时更换发信渠道。'
        ],
        script: '麻烦先确认两点：\n1. 邮箱地址是否填写正确；\n2. 请检查「垃圾邮件 / 广告邮件」文件夹，并把我们的发件人加入白名单。\n另外，验证码每 15 分钟最多发送 5 次，超过会被暂时限制，稍等一会再试即可。\n如果都排除了还是收不到，告诉我发送时间，我查一下服务端记录。',
        priority: 70
    },
    {
        script_id: 'sync-missing',
        category: 'data',
        title: '换设备后看不到云端历史记录',
        symptom: '在新设备登录后，个人中心的历史记录为空，或数量比旧设备少。',
        steps: [
            '确认账号一致：两端必须是同一个账号登录（手机号 / 邮箱）。',
            '确认权益：云端历史同步是专业版功能，基础版仅保存在本机。',
            '到管理台「用户」页确认该账号 plan 为 pro、有效期未过期。',
            '让用户在联网状态下打开个人中心，触发一次同步后下拉查看。',
            '提醒用户：本地未上传过的记录不会自动出现在新设备上。'
        ],
        script: '云端历史同步需要满足两个条件：\n1. 两端登录的是同一个账号；\n2. 账号具有专业版权益（基础版的记录只保存在本机，不会跨设备）。\n请你在新设备上联网打开「个人中心」停留几秒触发同步。\n如果还是没有，把账号和我核对一下，我帮你确认权益状态。',
        priority: 50
    },
    {
        script_id: 'calc-diff',
        category: 'data',
        title: '计算结果与预期不一致 / 历史记录少了',
        symptom: '同一组数据算出来的结果和之前不同，或历史记录数量变少。',
        steps: [
            '核对输入项：公积金 / 社保基数有默认值（当前默认 7546），用户可能未按实际填写。',
            '核对口径：结果页「税前收入」「应纳税所得额」「应退/补税额」应与预算表汇总行一致。',
            '确认版本：旧版本可能存在口径差异，让用户走一次排障短链确认是最新版。',
            '若仍不一致：请用户提供计算类型、关键输入项与结果截图，按疑点复算并记录到反馈。'
        ],
        script: '麻烦帮我核对几个信息，方便定位：\n1. 你使用的计算类型（综合所得 / 经营所得 / 分类所得 / 反向倒算）；\n2. 关键输入项（收入、公积金基数、社保基数等）；\n3. 页面底部的版本号。\n另外请先打开 {RESET_URL} 重置一次缓存，确认你用的是最新版本。\n把以上信息发我，我马上帮你核对口径。',
        priority: 40
    },
    {
        script_id: 'export-result',
        category: 'usage',
        title: '如何导出 PDF / 保存计算结果',
        symptom: '用户不清楚怎么把计算结果保存下来或打印出来。',
        steps: [
            '指引：计算完成后，在结果区找到「导出 / 保存」相关按钮。',
            '若用户按钮无效：先走一次排障短链确认不是旧版脚本问题。',
            '导出依赖浏览器下载权限，提醒用户不要拦截本站的下载。',
            '仍失败则建议改用浏览器自带的「打印 → 另存为 PDF」。'
        ],
        script: '计算结果可以在结果页面直接导出：\n1. 先完成一次计算，停留在结果页；\n2. 在结果区域找到「导出 / 保存」按钮并点击；\n3. 如果浏览器提示是否允许下载，请选择「允许」。\n如果按钮没反应，先打开 {RESET_URL} 重置一次缓存再试；\n也可以按 Ctrl+P 选择「另存为 PDF」。',
        priority: 20
    }
];

// 种子行 → 数据库行（steps 数组序列化为 JSON 字符串）
const toRow = (item) => ({
    script_id: item.script_id,
    category: item.category,
    title: item.title,
    symptom: item.symptom,
    steps: JSON.stringify(item.steps || []),
    script: item.script || '',
    priority: Number.isInteger(item.priority) ? item.priority : 0
});

/**
 * 启动兜底播种：仅在表为空时写入内置话术，避免覆盖运维在后台的编辑。
 * @returns {Promise<number>} 实际写入条数（0 = 已存在数据，跳过）
 */
async function ensureSupportScripts() {
    const count = await prisma.supportScript.count();
    if (count > 0) return 0;
    await Promise.all(SEED_SCRIPTS.map((item) => prisma.supportScript.create({ data: toRow(item) })));
    return SEED_SCRIPTS.length;
}

/**
 * 恢复内置条目：按 script_id 补回缺失的、并把已存在的内置条目还原为出厂内容。
 * 运维自建的条目（script_id 不在内置列表内）不受影响。
 * @returns {Promise<{created:number, restored:number}>}
 */
async function restoreBuiltinScripts() {
    const existing = await prisma.supportScript.findMany({
        where: { script_id: { in: SEED_SCRIPTS.map((s) => s.script_id) } },
        select: { script_id: true }
    });
    const existingIds = new Set(existing.map((r) => r.script_id));

    let created = 0;
    let restored = 0;
    for (const item of SEED_SCRIPTS) {
        const row = toRow(item);
        if (existingIds.has(item.script_id)) {
            await prisma.supportScript.update({ where: { script_id: item.script_id }, data: row });
            restored += 1;
        } else {
            await prisma.supportScript.create({ data: row });
            created += 1;
        }
    }
    return { created, restored };
}

module.exports = {
    CATEGORIES,
    SEED_SCRIPTS,
    ensureSupportScripts,
    restoreBuiltinScripts
};
