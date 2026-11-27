-- AlterTable
ALTER TABLE "challenge_proposals" ADD COLUMN     "ngoStatus" TEXT;

-- AlterTable
ALTER TABLE "milestone_hours" ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "retained" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "milestone_hours_studentProfileId_idx" ON "milestone_hours"("studentProfileId");
