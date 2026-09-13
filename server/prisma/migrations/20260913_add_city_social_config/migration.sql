-- 阶段14 C2：城市社保参数库（管理台热改各城市缴费基数口径 + 版本化快照）
-- 说明：payload 为 JSON 字符串（constantsVersion / defaultCity / cities[]），
--       每个城市含社保与公积金缴费基数上下限 + 公积金可选比例；
--       每次保存写入一条 published 记录，历史版本置为 archived 供审计与回滚。
--       约定：无上限的基数存 null（JSON 不支持 Infinity）；必须保留 code = 'national' 的兜底城市。

-- CreateTable: 城市社保参数版本
CREATE TABLE "CitySocialConfig" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL DEFAULT 'admin',
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitySocialConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 版本号唯一（回滚另存为新版时须改版本号）
CREATE UNIQUE INDEX "CitySocialConfig_version_key" ON "CitySocialConfig"("version");

-- CreateIndex: 公开端点取最新 published 快照
CREATE INDEX "CitySocialConfig_status_published_at_idx" ON "CitySocialConfig"("status", "published_at");
