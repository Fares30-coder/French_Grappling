-- AlterTable
ALTER TABLE "Technique" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- Not modelled by Prisma: a technique cannot chain to itself (ADR 0003 A4).
ALTER TABLE "Chain" ADD CONSTRAINT "Chain_no_self_link" CHECK ("fromId" <> "toId");
