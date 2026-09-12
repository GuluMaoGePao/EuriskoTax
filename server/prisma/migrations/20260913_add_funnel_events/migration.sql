-- 阶段13E：转化漏斗埋点（生产 PostgreSQL 迁移）
-- 链路：visit → calc_done → share/save → lead_click → lead_submit
-- 设计要点：
--   1) 日粒度聚合（date, step 唯一）：北极星指标只需比值，聚合表查询极轻，不必存逐条事件；
--   2) 零个人标识：不存 IP / 设备 ID / user_id，从结构上规避个保法风险，故无需脱敏与清理策略；
--   3) upsert 自增天然幂等且抗刷：同一步骤同一天永远只有一行，脚本刷量最多把 count 抬高。
-- 注意：lead_submit 不在本表 —— 其唯一真相是 Lead 表（同一事实只存一处，避免两个数对不上）。

-- CreateTable: 转化漏斗日聚合
CREATE TABLE "FunnelEvent" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "step" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: (date, step) 唯一 —— upsert 幂等的依据
CREATE UNIQUE INDEX "FunnelEvent_date_step_key" ON "FunnelEvent"("date", "step");

-- CreateIndex: 按日期区间扫描（（近 N 天漏斗统计）
CREATE INDEX "FunnelEvent_date_idx" ON "FunnelEvent"("date");
