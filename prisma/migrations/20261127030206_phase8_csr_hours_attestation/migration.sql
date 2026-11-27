-- AlterTable
ALTER TABLE "challenge_proposals" ADD COLUMN     "ngoPartnerId" TEXT;

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "ngoAttestation" TEXT,
ADD COLUMN     "ngoAttestedAt" TIMESTAMP(3),
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "releasedByOrgId" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "avgNetProfit" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "team_members" ADD COLUMN     "ngoRating" INTEGER;

-- CreateTable
CREATE TABLE "milestone_hours" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,

    CONSTRAINT "milestone_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "milestone_hours_milestoneId_studentProfileId_key" ON "milestone_hours"("milestoneId", "studentProfileId");

-- AddForeignKey
ALTER TABLE "challenge_proposals" ADD CONSTRAINT "challenge_proposals_ngoPartnerId_fkey" FOREIGN KEY ("ngoPartnerId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_hours" ADD CONSTRAINT "milestone_hours_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
