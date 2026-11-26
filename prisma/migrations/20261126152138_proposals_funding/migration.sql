-- AlterEnum
ALTER TYPE "ChallengeStatus" ADD VALUE 'FUNDED';

-- AlterTable
ALTER TABLE "challenge_proposals" ADD COLUMN     "milestonePlan" JSONB,
ADD COLUMN     "teamPlan" JSONB;

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "amount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "funding_commitments" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "csrOrgId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "released" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funding_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funding_commitments_challengeId_csrOrgId_key" ON "funding_commitments"("challengeId", "csrOrgId");

-- AddForeignKey
ALTER TABLE "funding_commitments" ADD CONSTRAINT "funding_commitments_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_commitments" ADD CONSTRAINT "funding_commitments_csrOrgId_fkey" FOREIGN KEY ("csrOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
