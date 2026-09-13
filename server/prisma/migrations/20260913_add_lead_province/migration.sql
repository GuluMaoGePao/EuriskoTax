-- 留资「所在城市」收紧为省 + 市级联下拉后，省份不再只是前端筛选条件 —— 顾问侧同样需要它：
--   ① 重名地市只看市名会认错统筹区（吉林省吉林市 / 青海省海南藏族自治州 vs 海南省）；
--   ② 顾问按「本地口径」分派线索（如江浙沪私域）时，先按省收敛比按市翻页快得多。
-- 与 city 同级：用户主动提供的咨询信息，随线索一起保留。
-- 用 NOT NULL + DEFAULT '' 与既有文本列（city / scene / note）保持一致，避免历史行出现 NULL 分叉判断。

-- AlterTable: 转化线索新增「所在省份 / 直辖市」
ALTER TABLE "Lead" ADD COLUMN "province" TEXT NOT NULL DEFAULT '';
