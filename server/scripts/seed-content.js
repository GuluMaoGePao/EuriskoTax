// 阶段11：内容中心种子脚本
//   node scripts/seed-content.js            # 只导入尚不存在的条目
//   node scripts/seed-content.js --force    # 已存在条目也按 JSON 覆盖（慎用，会覆盖后台改动）
//
// 数据源：server/data/content/tax-policy.json（阶段10B 的增量内容文件）
// 导入策略：按 item_id 幂等 upsert 为 ContentItem（type=policy / audience=all / placements=["assistant_qa"]）。
// 说明：该 JSON 自阶段11 起「退役为纯种子源」，运行时不再读盘（公共端点改为读库）。
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CONTENT_FILE = path.resolve(__dirname, '..', 'data', 'content', 'tax-policy.json');

function loadJson() {
    const raw = fs.readFileSync(CONTENT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.version || !Array.isArray(parsed.items)) {
        throw new Error('tax-policy.json 结构异常（需含 version 与 items[]）');
    }
    return parsed;
}

function toDate(value, fallback) {
    if (!value) return fallback;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallback : d;
}

function toItemData(it) {
    return {
        item_id: String(it.id),
        type: 'policy',
        audience: 'all',
        placements: JSON.stringify(['assistant_qa']),
        title: it.question || it.title || '',
        summary: '',
        body: it.answer || '',
        category: it.category || null,
        question: it.question || null,
        answer: it.answer || '',
        keywords: JSON.stringify(Array.isArray(it.keywords) ? it.keywords : []),
        hot: it.hot === true,
        link_url: null,
        link_text: null,
        priority: it.hot ? 10 : 0,
        status: 'published',
        publish_at: toDate(it.effectiveAt, new Date()),
        expire_at: null
    };
}

async function main() {
    const force = process.argv.includes('--force');
    const content = loadJson();

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const it of content.items) {
        if (!it || !it.id) continue;
        const data = toItemData(it);
        const existing = await prisma.contentItem.findUnique({ where: { item_id: data.item_id } });
        if (existing && !force) {
            skipped++;
            continue;
        }
        await prisma.contentItem.upsert({
            where: { item_id: data.item_id },
            create: data,
            update: data
        });
        existing ? updated++ : created++;
    }

    // 发布批次：库内无该版本时补一条，保证 since 闸门有初值
    await prisma.contentRelease.upsert({
        where: { version: content.version },
        create: {
            version: content.version,
            notice: content.notice || '',
            published_at: toDate(content.publishedAt, new Date())
        },
        update: {}
    });

    console.log('\n内容种子完成：');
    console.log(`  新增 ${created} 条 / 覆盖 ${updated} 条 / 跳过 ${skipped} 条（已存在）`);
    console.log(`  发布批次版本：${content.version}`);
    console.log(`  ${force ? '（--force 模式：已存在条目已按 JSON 覆盖）' : '（未加 --force：后台已改动的条目不会被覆盖）'}\n`);
}

main()
    .catch((err) => {
        console.error('内容种子失败:', err.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
