-- 阶段12 C1：税制参数配置化（管理台热改税率 + 版本化快照）
-- 说明：payload 为 JSON 字符串（综合所得/月度/经营所得/分类所得税率表 + 缴费基数下限）；
--       每次保存写入一条 published 记录，历史版本置为 archived 供审计与回滚。
--       约定：数组项 {min,max,rate,deduction}；无上限的 max 存 null（JSON 不支持 Infinity）。

-- CreateTable: 税率配置版本
CREATE TABLE "TaxRateConfig" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL DEFAULT 'admin',
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRateConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 版本号唯一（回滚另存为新版时须改版本号）
CREATE UNIQUE INDEX "TaxRateConfig_version_key" ON "TaxRateConfig"("version");

-- CreateIndex: 公开端点取最新 published 快照
CREATE INDEX "TaxRateConfig_status_published_at_idx" ON "TaxRateConfig"("status", "published_at");
