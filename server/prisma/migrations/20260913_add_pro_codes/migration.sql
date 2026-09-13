-- 阶段14 变现：专业版兑换码 —— 线下收款场景下由运营批量生成并交付给客户
-- 说明：used_by 可空 —— NULL 表示未被兑换（可发放/可作废）；兑换时在事务内原子占用。
--       不建外键：与 InviteCode 风格一致，used_by 为裸外键，用户名在查询时手动关联，
--       避免用户注销时因级联约束连带删除对账凭证（兑换码作为收款凭证需长期留存）。
--       duration_days 为 NULL 表示永久授权；>0 表示自兑换时刻起算（已有效期内则叠加续期）。
--       disabled 用于作废未售出/退款回收的码，作废后不可兑换但保留记录。

-- CreateTable: 专业版兑换码
CREATE TABLE "ProCode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "duration_days" INTEGER,
    "batch" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "used_by" INTEGER,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 兑换时按码精确查找（code 唯一）
CREATE UNIQUE INDEX "ProCode_code_key" ON "ProCode"("code");

-- CreateIndex: 列出某用户兑换过的码（对账/客服核对）
CREATE INDEX "ProCode_used_by_idx" ON "ProCode"("used_by");

-- CreateIndex: 按批次筛选（线下收款批次对账）
CREATE INDEX "ProCode_batch_idx" ON "ProCode"("batch");
