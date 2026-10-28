-- CreateEnum
CREATE TYPE "Category" AS ENUM ('submission', 'pass', 'sweep', 'escape', 'takedown');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "GiMode" AS ENUM ('gi', 'nogi', 'both');

-- CreateEnum
CREATE TYPE "PositionRole" AS ENUM ('top', 'bottom', 'neutral');

-- CreateEnum
CREATE TYPE "TechniqueStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "ChainType" AS ENUM ('followup', 'counter', 'alternative');

-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "role" "PositionRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technique" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "level" "Level" NOT NULL,
    "gi" "GiMode" NOT NULL,
    "status" "TechniqueStatus" NOT NULL DEFAULT 'draft',
    "keyPoints" TEXT[],
    "commonMistakes" TEXT[],
    "startPositionId" UUID NOT NULL,
    "endPositionId" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Technique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" UUID NOT NULL,
    "techniqueId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "transitionMs" INTEGER NOT NULL DEFAULT 1300,
    "skeleton" TEXT NOT NULL,
    "pose" JSONB NOT NULL,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chain" (
    "id" UUID NOT NULL,
    "fromId" UUID NOT NULL,
    "toId" UUID NOT NULL,
    "type" "ChainType" NOT NULL,

    CONSTRAINT "Chain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TagToTechnique" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_TagToTechnique_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Position_slug_key" ON "Position"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Technique_slug_key" ON "Technique"("slug");

-- CreateIndex
CREATE INDEX "Technique_status_category_idx" ON "Technique"("status", "category");

-- CreateIndex
CREATE INDEX "Technique_startPositionId_idx" ON "Technique"("startPositionId");

-- CreateIndex
CREATE INDEX "Technique_endPositionId_idx" ON "Technique"("endPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "Step_techniqueId_order_key" ON "Step"("techniqueId", "order");

-- CreateIndex
CREATE INDEX "Chain_toId_idx" ON "Chain"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "Chain_fromId_toId_type_key" ON "Chain"("fromId", "toId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE INDEX "_TagToTechnique_B_index" ON "_TagToTechnique"("B");

-- AddForeignKey
ALTER TABLE "Technique" ADD CONSTRAINT "Technique_startPositionId_fkey" FOREIGN KEY ("startPositionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technique" ADD CONSTRAINT "Technique_endPositionId_fkey" FOREIGN KEY ("endPositionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "Technique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chain" ADD CONSTRAINT "Chain_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Technique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chain" ADD CONSTRAINT "Chain_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Technique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToTechnique" ADD CONSTRAINT "_TagToTechnique_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToTechnique" ADD CONSTRAINT "_TagToTechnique_B_fkey" FOREIGN KEY ("B") REFERENCES "Technique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
