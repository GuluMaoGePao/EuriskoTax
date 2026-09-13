-- 回退阶段14 C2 的「参保城市」端上选择（2026-09）：
--   城市不再用于计算页的基数下限分档校验，改为在留资/咨询时收集，
--   由顾问核对当地社保/公积金缴费基数口径后再给结论。
--   城市属用户主动提供的咨询信息，与 scene / note 同级，随线索一起保留。

-- AlterTable: 转化线索新增「所在城市」
-- 用 NOT NULL + DEFAULT '' 与既有文本列（scene / note）保持一致，避免历史行出现 NULL 分叉判断。
ALTER TABLE "Lead" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';
