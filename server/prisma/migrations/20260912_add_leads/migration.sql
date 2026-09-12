-- 阶段13：转化线索（工具 → 服务）—— 会计/税务服务获客的枢纽
-- 说明：user_id 可空 —— 游客不登录也能留资（游客占多数，要求登录会丢掉大部分线索）；
--       用户注销时置 NULL（ON DELETE SET NULL），线索作为业务资产保留、仍可跟进。
--       source 为触点归因；scene 为情境快照（顾问跟进精准开场）；consent 为个保法显式同意留痕。
--       status 状态机：new → contacted → qualified → converted / dropped。

-- CreateTable: 转化线索
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "wechat" TEXT,
    "company" TEXT,
    "entity_type" TEXT NOT NULL DEFAULT 'unknown',
    "need" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "scene" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'new',
    "owner" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 管理台按状态筛选 + 创建时间倒序（默认视图）
CREATE INDEX "Lead_status_created_at_idx" ON "Lead"("status", "created_at");

-- CreateIndex: 按触点归因统计
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex: 同手机号 24h 幂等去重查询
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- AddForeignKey: 用户注销时置 NULL，线索不随之消失
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
