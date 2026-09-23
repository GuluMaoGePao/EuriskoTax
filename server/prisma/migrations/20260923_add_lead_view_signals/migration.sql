-- 阶段19-7b②（v1.102.0）：转化线索新增「视图密度」与「调过进阶参数的次数」
--
-- 为什么值得落库：选完整视图、或在简明视图下主动翻出「更多参数（可选）」去调的人，
-- 多数是财务 / HR / 企业主（ICP ★★★）—— 同样一个手机号，跟进优先级不该和
-- 「只填了月薪就留资」一样。这两个数是白捡的：用户在界面上已经表达了需求深度，
-- 不需要多问一句、不需要多采一项个人信息。
--
-- 口径边界（与 scene 同级，都是「不阻断留资」的辅助信息）：
--   view_mode 允许为空 —— 老客户端没上报就是「没信号」，不能回落成 simple 充数；
--   advanced_touched 允许为 0 —— 0 是真实值（没展开过），与「没上报」靠 view_mode 是否为空区分。
-- 这两个字段不含任何金额与填报内容，纯行为计数。

-- AlterTable: 转化线索新增「使用深度」两项
ALTER TABLE "Lead" ADD COLUMN "view_mode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Lead" ADD COLUMN "advanced_touched" INTEGER NOT NULL DEFAULT 0;
