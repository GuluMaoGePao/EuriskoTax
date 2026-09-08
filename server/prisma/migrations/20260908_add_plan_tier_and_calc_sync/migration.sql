-- 阶段10A：账户分层（free/pro）+ 计算历史云端同步（生产 PostgreSQL 迁移）
-- 说明：Calculation 的 input_data 现承载「云端同步条目的本地记录快照 JSON」，
--       result_data 同步条目暂存 "{}" 占位；旧 CRUD 期数据（client_id IS NULL）结构不变。

-- AlterTable: User 账户分层字段
ALTER TABLE "User" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "User" ADD COLUMN "plan_expires_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pro_granted_by" TEXT;

-- AlterTable: Calculation 云端同步字段
ALTER TABLE "Calculation" ADD COLUMN "client_id" TEXT;
ALTER TABLE "Calculation" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Calculation" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex: 按 (user_id, client_id) 幂等 upsert
CREATE UNIQUE INDEX "Calculation_user_id_client_id_key" ON "Calculation"("user_id", "client_id");

-- CreateIndex: 拉取列表按 updated_at 排序
CREATE INDEX "Calculation_user_id_updated_at_idx" ON "Calculation"("user_id", "updated_at");
