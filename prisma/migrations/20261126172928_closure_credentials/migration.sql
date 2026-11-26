-- AlterTable
ALTER TABLE "challenges" ADD COLUMN     "citizenRating" INTEGER,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "disputeReason" TEXT,
ADD COLUMN     "verifiedBeneficiaries" INTEGER;

-- AlterTable
ALTER TABLE "student_credentials" ADD COLUMN     "challengeId" TEXT;
