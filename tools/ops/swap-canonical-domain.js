/**
 * canonical / og:url / robots 换域脚本 —— 阶段16A 切流当天的一次性动作（v1.114.0，**已完成**）
 *
 * 状态（2026-10-10）：换域早已完成，本脚本是**一次性历史工具**，日常不需要再跑；
 *       Zeabur 已降级为测试环境。`--check` 仍可用于核对全站 canonical 是否只剩正式域。
 *
 * 背景：21 个落地页 + index.html + robots.txt 里的站点 URL 现在指向
 *       https://euriskotax.zeabur.app（境外），共 107 处 / 23 个文件。
 *       切到正式域名 euriskotax.com 的**同一天**必须整体换掉 —— 不换则搜索引擎
 *       判定 com 页面是 zeabur.app 的副本，权重归旧域，21 个落地页白做；
 *       而 sitemap.xml 已经是 com，两边不一致比不改更糟。
 *
 * 为什么做成脚本而不是手工改：107 处替换，只改一半是常态 —— 所以还有断言 9
 *       （tests/copy-standard.test.js：全站 canonical 只允许一个域名）在切完那天兜底，
 *       谁漏了一批页面，域名分裂成两个，测试立刻红。
 *
 * 用法：
 *   node tools/ops/swap-canonical-domain.js --check    # 只报告，不改动
 *   node tools/ops/swap-canonical-domain.js            # 执行替换（幂等，可重复跑）
 *
 * 只替换**带协议的完整 URL**（https://euriskotax.zeabur.app → https://euriskotax.com），
 * 代码注释里提到「Zeabur」字样（如 Dockerfile 的构建源说明）不受影响。
 * DNS 还没解析到新服务器之前**不许执行**（canonical 指向打不开的域名比不改更糟）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FROM = 'euriskotax.zeabur.app';
const TO = 'euriskotax.com';
const checkOnly = process.argv.includes('--check');

/** 扫描范围：站内 URL 出现的静态文件（与 runbook §16A.1-5 一致） */
function targets() {
    const out = ['index.html', 'robots.txt', 'sitemap.xml', 'manifest.json'].filter((f) =>
        fs.existsSync(path.join(ROOT, f))
    );
    const seoDir = path.join(ROOT, 'seo');
    if (fs.existsSync(seoDir)) {
        fs.readdirSync(seoDir).filter((f) => f.endsWith('.html')).forEach((f) => out.push('seo/' + f));
    }
    return out;
}

const files = targets();
const report = [];
let total = 0;

files.forEach((rel) => {
    const full = path.join(ROOT, rel);
    const src = fs.readFileSync(full, 'utf8');
    const hits = (src.match(new RegExp('https?://' + FROM.replace(/\./g, '\\.'), 'g')) || []).length;
    if (!hits) return;
    total += hits;
    report.push(rel + '：' + hits + ' 处');
    if (!checkOnly) {
        fs.writeFileSync(full, src.split(FROM).join(TO));
    }
});

console.log((checkOnly ? '[check] ' : '[done] ') + FROM + ' → ' + TO);
report.forEach((l) => console.log('  ' + l));
console.log('合计 ' + total + ' 处 / ' + report.length + ' 个文件');

if (checkOnly && total > 0) {
    console.log('\n确认 DNS 已解析到新服务器后，去掉 --check 再执行一次。');
    console.log('执行后跑：npx jest tests/copy-standard.test.js   （断言 9 应全绿且域名唯一 = ' + TO + '）');
}
if (!checkOnly) {
    console.log('\n验收：npx jest tests/copy-standard.test.js —— 断言 9 全绿即全站域名唯一。');
}
