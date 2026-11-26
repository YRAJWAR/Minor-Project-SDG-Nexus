-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChallengeStatus" ADD VALUE 'REJECTED';
ALTER TYPE "ChallengeStatus" ADD VALUE 'MERGED';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "prev_hash" TEXT;

-- AlterTable
ALTER TABLE "challenges" ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "submitterId" TEXT,
ADD COLUMN     "urgency" TEXT NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "endorsements" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "endorsements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "endorsements_challengeId_userId_key" ON "endorsements"("challengeId", "userId");

-- AddForeignKey
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
