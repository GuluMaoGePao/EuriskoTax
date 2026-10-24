#!/usr/bin/env node
/**
 * SEO 落地页体检（seo/*.html）
 *
 * 为什么要有它：落地页是手写静态 HTML，21 个页面靠人眼逐个比对会漏 ——
 * 「另一个页面少了个 canonical」「这个页面的表格没包 .table-scroll 手机上溢出」
 * 这类问题肉眼扫一遍基本看不出来，但会实打实影响收录与移动端体验。
 * 本脚本把可判定的项全部机器化，人工只需看它输出的清单。
 *
 * 用法：
 *   node tools/ops/seo-audit.js            列出全部问题（按页分组）
 *   node tools/ops/seo-audit.js --summary  只看每页问题数与总览
 *   node tools/ops/seo-audit.js --json     机器可读输出（供 CI 用）
 *
 * 退出码：有 FAIL 时为 1（WARN 不算失败，只提示）。
 * 与 tests/ 下守卫的分工：那里钉的是「不许退化」，这里做的是「现状盘点 + 发现新病灶」。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SEO_DIR = path.join(ROOT, 'seo');
const CANONICAL_ORIGIN = 'https://euriskotax.com';

const arg = (name) => process.argv.includes(name);
const AS_SUMMARY = arg('--summary');
const AS_JSON = arg('--json');
const AS_STYLES = arg('--styles');
const AS_CSS = arg('--css');

/** 从一段 HTML 里剥出 <script type="application/ld+json"> 的内容（只取正文，不解析） */
function ldJsonBlocks(html) {
    const blocks = [];
    const re = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) blocks.push(m[1]);
    return blocks;
}

/** 结构化数据解析：返回 { data, error } —— 一个页面可能有多块，这里合并成数组 */
function parseLd(html) {
    const out = [];
    for (const raw of ldJsonBlocks(html)) {
        try {
            out.push({ data: JSON.parse(raw.trim()), error: null });
        } catch (e) {
            out.push({ data: null, error: e.message });
        }
    }
    return out;
}

/** 收集结构化数据里出现的所有 @type（含嵌套 @graph） */
function collectTypes(node, acc = new Set()) {
    if (!node || typeof node !== 'object') return acc;
    if (Array.isArray(node)) {
        node.forEach((n) => collectTypes(n, acc));
        return acc;
    }
    if (typeof node['@type'] === 'string') acc.add(node['@type']);
    else if (Array.isArray(node['@type'])) node['@type'].forEach((t) => acc.add(t));
    Object.keys(node).forEach((k) => {
        if (k === '@type') return;
        collectTypes(node[k], acc);
    });
    return acc;
}

/** 取 FAQPage 里的问题条数 */
function faqCountInLd(blocks) {
    let n = 0;
    for (const { data } of blocks) {
        if (!data) continue;
        const walk = (node) => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) return node.forEach(walk);
            const t = node['@type'];
            const isFaq = t === 'FAQPage' || (Array.isArray(t) && t.includes('FAQPage'));
            if (isFaq && Array.isArray(node.mainEntity)) n += node.mainEntity.length;
            if (isFaq && node.mainEntity && !Array.isArray(node.mainEntity)) n += 1;
            Object.keys(node).forEach((k) => k !== '@type' && walk(node[k]));
        };
        walk(data);
    }
    return n;
}

/** 从后端控制器读出线索来源白名单：页面用了名单外的值会被静默回落 unknown，必须拿真源对账 */
function readLeadSources() {
    const p = path.join(ROOT, 'server', 'src', 'controllers', 'leadController.js');
    if (!fs.existsSync(p)) return new Set();
    const m = fs.readFileSync(p, 'utf8').match(/const\s+SOURCES\s*=\s*\[([\s\S]*?)\]/);
    if (!m) return new Set();
    return new Set((m[1].match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, '')));
}

/** 取单值 meta / link 属性 */
function attrOf(html, tagRe, attr) {
    const m = html.match(tagRe);
    if (!m) return null;
    const a = m[0].match(new RegExp(attr + '="([^"]*)"', 'i'));
    return a ? a[1] : null;
}

const has = (html, re) => re.test(html);
/** 计数：调用处传的正则多不带 g，这里统一补上 —— 否则 match 只返回首个匹配，计数恒为 1 */
const countOf = (html, re) => (html.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;

/** 去掉 script/style/注释后的「静态正文」——爬虫真正能读到的东西 */
function staticText(html) {
    return html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** CJK 计 2 宽，与搜索引擎结果页的截断口径接近 */
function displayWidth(s) {
    let w = 0;
    for (const ch of s) w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1;
    return w;
}

function auditPage(file, sitemapUrls, leadSources) {
    const html = fs.readFileSync(path.join(SEO_DIR, file), 'utf8');
    const url = `${CANONICAL_ORIGIN}/seo/${file}`;
    const issues = [];
    const add = (level, item, detail) => issues.push({ level, item, detail });
    const F = (item, detail) => add('FAIL', item, detail);
    const W = (item, detail) => add('WARN', item, detail);

    // ---------- A. 收录要素 ----------
    if (!has(html, /<html\s+lang="zh-CN"/i)) F('lang', 'html 标签缺少 lang="zh-CN"');
    if (!has(html, /name="viewport"/i)) F('viewport', '缺少 viewport，移动端会被缩放');

    const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
    if (!title) {
        F('title', '缺少 <title>');
    } else {
        const w = displayWidth(title.trim());
        if (w < 20) W('title', `过短（${w} 宽，建议 20~64）`);
        if (w > 64) W('title', `过长（${w} 宽），搜索结果页会被截断`);
    }

    const desc = attrOf(html, /<meta\s+name="description"[^>]*>/i, 'content');
    if (!desc) {
        F('description', '缺少 meta description');
    } else {
        const w = displayWidth(desc);
        if (w < 60) W('description', `过短（${w} 宽，建议 60~160）`);
        if (w > 160) W('description', `过长（${w} 宽），会被截断`);
    }

    const canonical = attrOf(html, /<link\s+rel="canonical"[^>]*>/i, 'href');
    if (!canonical) F('canonical', '缺少 canonical，重复内容会分散权重');
    else if (canonical !== url) F('canonical', `应为 ${url}，实际 ${canonical}`);

    if (!has(html, /<meta\s+name="robots"/i)) W('robots', '缺少 meta robots（建议显式 index, follow）');

    ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url'].forEach((p) => {
        if (!has(html, new RegExp('property="' + p + '"', 'i'))) W('og', `缺少 ${p}`);
    });
    const ogUrl = attrOf(html, /<meta\s+property="og:url"[^>]*>/i, 'content');
    if (ogUrl && ogUrl !== url) F('og:url', `应与 canonical 同为 ${url}，实际 ${ogUrl}`);
    if (!has(html, /name="twitter:card"/i)) W('twitter:card', '缺少 twitter:card');

    // ---------- B. 样式与布局基线 ----------
    if (!has(html, /href="\/src\/css\/tokens\.css"/i)) F('tokens.css', '未加载设计令牌，落地页会与主站品牌色漂移');
    if (!has(html, /href="\/seo\/landing\.css"/i)) F('landing.css', '未加载共享落地页样式');
    if (has(html, /<style[\s\S]*?<\/style>/i)) W('内联样式', '页面含内联 <style>，样式应统一收在 landing.css');
    const inlineStyleAttr = countOf(html, /\sstyle="[^"]*"/i);
    if (inlineStyleAttr > 0) W('内联 style 属性', `${inlineStyleAttr} 处行内 style，建议改成 landing.css 的类`);

    // ---------- C. 结构化数据 ----------
    const blocks = parseLd(html);
    if (blocks.length === 0) {
        F('结构化数据', '完全没有 ld+json，拿不到富摘要');
    } else {
        blocks.forEach((b, i) => {
            if (b.error) F('结构化数据', `第 ${i + 1} 块 JSON 解析失败：${b.error}`);
        });
        const types = new Set();
        blocks.forEach((b) => b.data && collectTypes(b.data, types));
        if (!types.has('FAQPage')) W('结构化数据', '无 FAQPage（常见问题拿不到富摘要）');
        if (!types.has('WebApplication') && !types.has('CollectionPage')) {
            W('结构化数据', '既无 WebApplication 也无 CollectionPage');
        }
        const faqLd = faqCountInLd(blocks);
        // 只数「常见问题」标题之后的 details：页面里另有高级选项展开块
        //（如 social-base 的单位费率面板），混在一起数会误报 FAQ 对账不一致
        const faqStart = html.search(/<h2[^>]*>\s*常见问题/);
        const faqZone = faqStart >= 0 ? html.slice(faqStart) : html;
        const faqHtml = countOf(faqZone, /<details[^>]*>\s*<summary[^>]*>/i);
        if (faqLd > 0 && faqHtml > 0 && faqLd !== faqHtml) {
            F('FAQ 对账', `结构化数据 ${faqLd} 条，正文 <details> ${faqHtml} 条，两者必须一一对应`);
        }
    }

    // ---------- D. 正文与可抓取性 ----------
    const text = staticText(html);
    if (text.length < 800) F('静态正文', `去掉脚本后仅 ${text.length} 字，爬虫读不到实质内容（建议 ≥ 800）`);
    else if (text.length < 1500) W('静态正文', `仅 ${text.length} 字，偏薄（建议 ≥ 1500）`);

    const h1 = countOf(html, /<h1[\s>]/i);
    if (h1 === 0) F('h1', '缺少 h1');
    else if (h1 > 1) F('h1', `有 ${h1} 个 h1，应唯一`);

    // 标题层级跳级（h1 → h3 会跳过 h2）
    const levels = [];
    const hRe = /<h([1-6])[\s>]/gi;
    let hm;
    while ((hm = hRe.exec(html)) !== null) levels.push(Number(hm[1]));
    for (let i = 1; i < levels.length; i++) {
        if (levels[i] > levels[i - 1] + 1) {
            W('标题层级', `出现 h${levels[i - 1]} → h${levels[i]} 跳级`);
            break;
        }
    }

    // ---------- E. 归因与站内动线 ----------
    // 判定标准是「是否在后端白名单内」，不是「是否与文件名长得像」：
    // 白名单外的来源值会被静默回落成 unknown —— 页面看着有归因，实际线索来源全丢。
    const srcMatches = [...new Set((html.match(/\?source=[a-z_]+/gi) || []).map((s) => s.split('=')[1]))];
    if (srcMatches.length === 0) {
        F('CTA 归因', '没有任何 ?source= 链接，从这个页进 App 的线索无法归因');
    } else {
        if (srcMatches.length > 1) W('CTA 归因', `混用了多个来源值：${srcMatches.join(' / ')}`);
        const off = srcMatches.filter((s) => !leadSources.has(s));
        if (off.length) {
            F('CTA 归因', `${off.join(' / ')} 不在 leadController 的 SOURCES 白名单内，会被静默回落为 unknown（线索来源等于白丢）`);
        }
    }

    // 目录页本身不链自己
    if (file !== 'index.html' && !has(html, /href="\/seo\/index\.html"/i)) {
        W('回目录', '页脚未链回 /seo/index.html，站内动线断了');
    }

    // 指向其他落地页的互链数（此前每页只挑 2~3 个，页面彼此是孤岛）
    const peerLinks = [...new Set((html.match(/href="\/seo\/[a-z-]+\.html"/gi) || [])
        .map((s) => s.match(/seo\/([a-z-]+\.html)/i)[1])
        .filter((f) => f !== file && f !== 'index.html'))];
    if (file !== 'index.html' && peerLinks.length < 3) {
        W('站内互链', `仅 ${peerLinks.length} 个同类页面互链（${peerLinks.join(' / ') || '无'}），建议 ≥ 3 个`);
    }
    peerLinks.forEach((f) => {
        if (!fs.existsSync(path.join(SEO_DIR, f))) F('死链', `链到不存在的文件 /seo/${f}`);
    });

    if (!has(html, /id="site-filing"/)) F('备案位', '缺少 #site-filing 容器（与主站口径不一致）');

    // ---------- F. 移动端与表格 ----------
    const tableCount = countOf(html, /<table[\s>]/i);
    // 类名带后缀（table-scroll--sticky）也要算数，否则加了粘性首列会被误判成「没包」
    const scrollCount = countOf(html, /class="table-scroll[^"]*"/i);
    if (tableCount > scrollCount) {
        F('表格溢出', `${tableCount} 个表格只有 ${scrollCount} 个包了 .table-scroll，未包的在手机上会撑破版面`);
    }
    const thTotal = countOf(html, /<th[\s>]/i);
    const thScope = countOf(html, /<th[^>]*\sscope="/i);
    if (thTotal > thScope) W('可访问性', `${thTotal} 个 th 中 ${thTotal - thScope} 个缺 scope 属性`);

    const imgTotal = countOf(html, /<img[\s>]/i);
    const imgAlt = countOf(html, /<img[^>]*\salt="/i);
    if (imgTotal > imgAlt) W('可访问性', `${imgTotal} 张图有 ${imgTotal - imgAlt} 张缺 alt`);

    // ---------- H. 版式与可读性 ----------
    // （前几段判的是「爬虫看不看得懂、线索归不归得上」，这一段判的是「人读不读得下去」）

    // 首屏零 CDN、无阻塞脚本是落地页的设计约束 —— 既是速度，也是版式前提
    (html.match(/<script\b[^>]*>/gi) || []).forEach((s) => {
        if (/type="application\/ld\+json"/i.test(s)) return;
        if (/\ssrc="/.test(s) && !/\sdefer/i.test(s) && !/\sasync/i.test(s)) {
            W('阻塞脚本', `外部脚本未加 defer：${s.replace(/\s+/g, ' ').slice(0, 56)}…`);
        }
    });

    const externals = [...new Set((html.match(/(?:src|href)="(https?:\/\/[^"]+)"/gi) || [])
        .map((s) => s.match(/"(https?:\/\/[^"]+)"/i)[1]))]
        .filter((u) => !u.startsWith(CANONICAL_ORIGIN));
    if (externals.length) {
        W('外部资源', `${externals.length} 个外域资源（首屏零 CDN 是设计约束）：${externals.slice(0, 3).join(' / ')}`);
    }

    if (has(html, /<font\b|<center\b|\salign="|\sbgcolor=/i)) {
        W('废弃标签', '仍在用 font / center / align / bgcolor 排版，应由 CSS 接管');
    }

    // 一整段超过 220 字，在手机上就是一整屏的灰墙，没有喘息点
    const longP = (html.match(/<p[^>]*>[^<]{220,}<\/p>/gi) || []).length;
    if (longP) W('段落长度', `${longP} 个段落超过 220 字，建议拆分成短段或列表`);

    // 表格列数过多时，即使能横滑，读的人也要来回拖着比对；
    // 已加粘性首列（table-scroll--sticky）的等于化解了这个问题，不再重复提醒
    const wide = (html.match(/<div class="table-scroll[^"]*">[\s\S]*?<\/div>/g) || []).filter((blk) => {
        if (blk.includes('table-scroll--sticky')) return false;
        const firstRow = (blk.match(/<tr[^>]*>[\s\S]*?<\/tr>/i) || [''])[0];
        return (firstRow.match(/<t[hd][\s>]/gi) || []).length > 6;
    }).length;
    if (wide) W('宽表格', `${wide} 个表格超过 6 列，手机上需横向拖动才能读全（可加 .table-scroll--sticky 钉住首列）`);

    // 写死的像素宽度超过窄屏视口，必然横向溢出
    const fixedW = (html.match(/width:\s*\d{3,}px/gi) || [])
        .map((m) => Number(m.match(/(\d+)/)[1]))
        .filter((n) => n > 480);
    if (fixedW.length) W('固定宽度', `${fixedW.length} 处写死宽度 > 480px（${fixedW.join(' / ')}），窄屏会溢出`);

    // ---------- G. 收录清单 ----------
    if (!sitemapUrls.has(url)) F('sitemap', 'sitemap.xml 未收录本页');

    return { file, url, issues };
}

function main() {
    const files = fs.readdirSync(SEO_DIR).filter((f) => f.endsWith('.html')).sort();
    const sitemapPath = path.join(ROOT, 'sitemap.xml');
    const sitemapUrls = new Set();
    if (fs.existsSync(sitemapPath)) {
        const sm = fs.readFileSync(sitemapPath, 'utf8');
        (sm.match(/<loc>([^<]+)<\/loc>/g) || []).forEach((m) => sitemapUrls.add(m.replace(/<\/?loc>/g, '')));
    }

    // --css：共享样式表的版式基线。逐页体检看不出「断点缺哪一档」这类整站问题
    if (AS_CSS) {
        const p = path.join(SEO_DIR, 'landing.css');
        const css = fs.readFileSync(p, 'utf8');
        const bp = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)]
            .map((m) => Number(m[1])).sort((a, b) => b - a);
        const sizes = [...new Set([...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1])))]
            .sort((a, b) => a - b);
        const hex = (css.match(/#[0-9a-f]{3,8}\b/gi) || []).length;
        const rows = [
            ['文件体积', `${(Buffer.byteLength(css) / 1024).toFixed(1)} KB（越小首屏越快）`],
            ['断点档位', bp.length ? bp.map((n) => `${n}px`).join(' / ') : '无（窄屏无适配）'],
            ['打印样式', /@media\s+print/.test(css) ? '有' : '无（税务口径页常被打印留存）'],
            ['深色模式', /prefers-color-scheme|\.dark\b/.test(css) ? '有' : '无（主站是深色时跳过来会闪白）'],
            ['焦点样式', /:focus-visible/.test(css) ? '有' : '无（键盘用户看不出落点）'],
            ['字号取值', `${sizes.length} 种：${sizes.join(' / ')}`],
            ['硬编码色值', `${hex} 处（设计令牌之外的局部色属正常）`],
        ];
        console.log('landing.css 版式基线\n');
        rows.forEach(([k, v]) => console.log(`  ${k.padEnd(6)} ${v}`));
        process.exit(0);
    }

    // --styles：内联样式的取值分布。收敛成类之前先看清楚哪些值真的重复，
    // 别把 300 处各不相同的写法当成「统一改成类」来做。
    if (AS_STYLES) {
        const freq = new Map();
        files.forEach((f) => {
            const html = fs.readFileSync(path.join(SEO_DIR, f), 'utf8');
            (html.match(/style="[^"]*"/gi) || []).forEach((s) => freq.set(s, (freq.get(s) || 0) + 1));
        });
        const total = [...freq.values()].reduce((a, b) => a + b, 0);
        console.log(`内联 style：共 ${total} 处、${freq.size} 种取值（按出现次数降序）\n`);
        [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
            .forEach(([s, n]) => console.log(`  ${String(n).padStart(3)}  ${s}`));
        process.exit(0);
    }

    const leadSources = readLeadSources();
    const results = files.map((f) => auditPage(f, sitemapUrls, leadSources));
    const totalFail = results.reduce((n, r) => n + r.issues.filter((i) => i.level === 'FAIL').length, 0);
    const totalWarn = results.reduce((n, r) => n + r.issues.filter((i) => i.level === 'WARN').length, 0);

    if (AS_JSON) {
        console.log(JSON.stringify({ pages: results.length, fail: totalFail, warn: totalWarn, results }, null, 2));
        process.exit(totalFail ? 1 : 0);
    }

    if (AS_SUMMARY) {
        console.log(`SEO 落地页体检：${results.length} 个页面，FAIL ${totalFail} / WARN ${totalWarn}\n`);
        results.forEach((r) => {
            const f = r.issues.filter((i) => i.level === 'FAIL').length;
            const w = r.issues.filter((i) => i.level === 'WARN').length;
            const flag = f ? 'FAIL' : w ? 'warn' : ' ok ';
            console.log(`  [${flag}] ${r.file.padEnd(26)} FAIL ${String(f).padStart(2)}  WARN ${String(w).padStart(2)}`);
        });
        process.exit(totalFail ? 1 : 0);
    }

    console.log(`SEO 落地页体检：${results.length} 个页面，FAIL ${totalFail} / WARN ${totalWarn}\n`);
    // 同项问题跨页归并，便于一次性批量修
    const byItem = new Map();
    results.forEach((r) => r.issues.forEach((i) => {
        const key = `${i.level} ${i.item}`;
        if (!byItem.has(key)) byItem.set(key, []);
        byItem.get(key).push(`${r.file}：${i.detail}`);
    }));
    [...byItem.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .forEach(([key, list]) => {
            console.log(`${key}  —— ${list.length} 页`);
            list.forEach((l) => console.log(`    · ${l}`));
        });
    process.exit(totalFail ? 1 : 0);
}

main();
