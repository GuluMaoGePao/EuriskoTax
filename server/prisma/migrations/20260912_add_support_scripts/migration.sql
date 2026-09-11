-- 阶段12：排障话术库（客服处理用户问题的「症状 → 步骤 → 话术」清单，生产 PostgreSQL 迁移）
-- 说明：这是内部客服资产，不参与用户端投放，故独立于 ContentItem。
--       steps 为 JSON 字符串数组；script 中的 {RESET_URL} 由端上替换为当前站点的 /reset 短链。
--       内置条目由服务启动时按 script_id 幂等播种（services/supportScriptService.ensureSupportScripts），
--       仅在表为空时写入，不会覆盖运维后续的编辑。

-- CreateTable: 排障话术
CREATE TABLE "SupportScript" (
    "id" SERIAL NOT NULL,
    "script_id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'cache',
    "title" TEXT NOT NULL DEFAULT '',
    "symptom" TEXT NOT NULL DEFAULT '',
    "steps" TEXT NOT NULL DEFAULT '[]',
    "script" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportScript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 幂等键（种子去重 / 恢复内置条目）
CREATE UNIQUE INDEX "SupportScript_script_id_key" ON "SupportScript"("script_id");

-- CreateIndex: 后台按分类筛选
CREATE INDEX "SupportScript_category_idx" ON "SupportScript"("category");
