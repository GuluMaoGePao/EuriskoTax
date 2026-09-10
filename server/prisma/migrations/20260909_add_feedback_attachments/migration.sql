-- 阶段10A-补：意见反馈支持附图（前端压缩后的图片 data URL，JSON 字符串数组，最多 3 张）
-- 说明：attachments 默认 '[]'，旧反馈行自动兼容；仅存压缩图 base64，不落原始大图。

-- AlterTable: Feedback 附图字段
ALTER TABLE "Feedback" ADD COLUMN "attachments" TEXT NOT NULL DEFAULT '[]';
