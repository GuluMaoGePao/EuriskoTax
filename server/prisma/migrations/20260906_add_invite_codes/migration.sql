-- 一机一码邀请码表：生产 PostgreSQL 迁移

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "used_by" INTEGER,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");

-- CreateIndex
CREATE INDEX "InviteCode_used_by_idx" ON "InviteCode"("used_by");
