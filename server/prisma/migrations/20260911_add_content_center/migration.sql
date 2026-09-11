-- 阶段11：内容中心（政策要点 / 更新公告 / 运营内容）+ 发布批次（生产 PostgreSQL 迁移）
-- 说明：ContentItem 是「增量覆盖层」，内置 QA 快照仍作离线兜底；
--       placements / keywords 为 JSON 字符串数组；audience = all | free | pro。

-- CreateTable: 内容条目
CREATE TABLE "ContentItem" (
    "id" SERIAL NOT NULL,
    "item_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'all',
    "placements" TEXT NOT NULL DEFAULT '[]',
    "title" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "category" TEXT,
    "question" TEXT,
    "answer" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "hot" BOOLEAN NOT NULL DEFAULT false,
    "link_url" TEXT,
    "link_text" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publish_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expire_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 幂等键
CREATE UNIQUE INDEX "ContentItem_item_id_key" ON "ContentItem"("item_id");

-- CreateIndex: 后台按类型/状态筛选
CREATE INDEX "ContentItem_type_status_idx" ON "ContentItem"("type", "status");

-- CreateIndex: 端上按可见性筛选
CREATE INDEX "ContentItem_status_audience_idx" ON "ContentItem"("status", "audience");

-- CreateTable: 发布批次
CREATE TABLE "ContentRelease" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "notice" TEXT NOT NULL DEFAULT '',
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 版本号唯一（since 闸门比对）
CREATE UNIQUE INDEX "ContentRelease_version_key" ON "ContentRelease"("version");
