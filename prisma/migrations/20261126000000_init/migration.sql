-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CITIZEN', 'OFFICER', 'FACULTY', 'STUDENT', 'NGO', 'CSR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('SUBMITTED', 'AI_PROCESSED', 'VALIDATED', 'UNIVERSITY_ASSIGNED', 'TEAM_FORMED', 'IN_PROGRESS', 'COMPLETED', 'DEPLOYED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'SUBMITTED', 'GP_VERIFIED', 'CSR_APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "states" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sdgIndex" INTEGER,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "stateId" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CITIZEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "districtId" INTEGER,
    "organizationId" TEXT,
    "heiId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "logo_url" TEXT,
    "cover_image_url" TEXT,
    "registration_number" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "state" TEXT NOT NULL,
    "district" TEXT,
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "gallery_images" TEXT,
    "budget_allocated" DOUBLE PRECISION NOT NULL,
    "budget_utilized" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "beneficiaries_count" INTEGER NOT NULL DEFAULT 0,
    "outcome_metric_value" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sdgs" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "sdgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_sdgs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sdg_id" INTEGER NOT NULL,
    "ai_confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "project_sdgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_activities" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "activity_title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "proof_url" TEXT,
    "hash_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_scores" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "scale_score" DOUBLE PRECISION NOT NULL,
    "outcome_score" DOUBLE PRECISION NOT NULL,
    "efficiency_score" DOUBLE PRECISION NOT NULL,
    "geographic_need_score" DOUBLE PRECISION NOT NULL,
    "transparency_score" DOUBLE PRECISION NOT NULL,
    "final_score" DOUBLE PRECISION NOT NULL,
    "calculation_version" TEXT NOT NULL DEFAULT '1.0',
    "raw_scale_value" DOUBLE PRECISION,
    "raw_outcome_value" DOUBLE PRECISION,
    "raw_efficiency_value" DOUBLE PRECISION,
    "raw_geo_value" DOUBLE PRECISION,
    "raw_transparency_value" DOUBLE PRECISION,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impact_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csr_allocations" (
    "id" TEXT NOT NULL,
    "corporate_org_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "amount_committed" DOUBLE PRECISION NOT NULL,
    "amount_disbursed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "financial_year" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csr_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_flags" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "risk_type" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heis" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ugcId" TEXT NOT NULL,
    "state" TEXT,
    "district" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "inviteCode" TEXT NOT NULL,
    "departments" TEXT[],
    "sdgExpertise" INTEGER[],
    "naacGrade" TEXT,
    "pastPerformanceScore" DOUBLE PRECISION DEFAULT 0.5,
    "isNewlyOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "heis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "skills" TEXT[],
    "credits" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "state" TEXT,
    "district" TEXT NOT NULL,
    "block" TEXT,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "category" TEXT NOT NULL,
    "photoUrls" TEXT[],
    "videoUrls" TEXT[],
    "status" "ChallengeStatus" NOT NULL DEFAULT 'SUBMITTED',
    "sdgTags" INTEGER[],
    "aiConfidence" DOUBLE PRECISION,
    "submittedBy" TEXT NOT NULL,
    "submitterType" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOf" TEXT,
    "gpVerified" BOOLEAN NOT NULL DEFAULT false,
    "submittedVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_proposals" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "heiId" TEXT NOT NULL,
    "approach" TEXT NOT NULL,
    "timelineWeeks" INTEGER NOT NULL,
    "budgetRequested" DOUBLE PRECISION NOT NULL,
    "fundingSource" TEXT,
    "ipDeclaration" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "aiQualityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_teams" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "heiId" TEXT NOT NULL,
    "facultyName" TEXT NOT NULL,
    "facultyEmail" TEXT NOT NULL,
    "backupLead" TEXT,

    CONSTRAINT "project_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "proofUrls" TEXT[],
    "proofVideoUrl" TEXT,
    "hashValue" TEXT,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "exifTimestamp" TIMESTAMP(3),
    "verifierCode" TEXT,
    "fundReleased" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_credentials" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "challengeTitle" TEXT NOT NULL,
    "challengeDistrict" TEXT NOT NULL,
    "sdgTags" INTEGER[],
    "hoursContributed" INTEGER NOT NULL,
    "creditPoints" INTEGER NOT NULL,
    "nepCompliant" BOOLEAN NOT NULL DEFAULT true,
    "hashValue" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'P2',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "challengeId" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "states_name_key" ON "states"("name");

-- CreateIndex
CREATE INDEX "districts_stateId_idx" ON "districts"("stateId");

-- CreateIndex
CREATE UNIQUE INDEX "districts_stateId_name_key" ON "districts"("stateId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_registration_number_key" ON "organizations"("registration_number");

-- CreateIndex
CREATE INDEX "organizations_type_idx" ON "organizations"("type");

-- CreateIndex
CREATE INDEX "organizations_state_idx" ON "organizations"("state");

-- CreateIndex
CREATE INDEX "organizations_district_idx" ON "organizations"("district");

-- CreateIndex
CREATE INDEX "organizations_verification_status_idx" ON "organizations"("verification_status");

-- CreateIndex
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_organization_id_status_idx" ON "projects"("organization_id", "status");

-- CreateIndex
CREATE INDEX "projects_created_at_idx" ON "projects"("created_at" DESC);

-- CreateIndex
CREATE INDEX "projects_id_idx" ON "projects"("id");

-- CreateIndex
CREATE INDEX "project_sdgs_project_id_idx" ON "project_sdgs"("project_id");

-- CreateIndex
CREATE INDEX "project_sdgs_sdg_id_idx" ON "project_sdgs"("sdg_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_sdgs_project_id_sdg_id_key" ON "project_sdgs"("project_id", "sdg_id");

-- CreateIndex
CREATE INDEX "project_activities_project_id_idx" ON "project_activities"("project_id");

-- CreateIndex
CREATE INDEX "project_activities_created_at_idx" ON "project_activities"("created_at" DESC);

-- CreateIndex
CREATE INDEX "impact_scores_organization_id_idx" ON "impact_scores"("organization_id");

-- CreateIndex
CREATE INDEX "impact_scores_final_score_idx" ON "impact_scores"("final_score" DESC);

-- CreateIndex
CREATE INDEX "impact_scores_calculated_at_idx" ON "impact_scores"("calculated_at" DESC);

-- CreateIndex
CREATE INDEX "csr_allocations_corporate_org_id_idx" ON "csr_allocations"("corporate_org_id");

-- CreateIndex
CREATE INDEX "csr_allocations_project_id_idx" ON "csr_allocations"("project_id");

-- CreateIndex
CREATE INDEX "csr_allocations_financial_year_idx" ON "csr_allocations"("financial_year");

-- CreateIndex
CREATE INDEX "risk_flags_organization_id_idx" ON "risk_flags"("organization_id");

-- CreateIndex
CREATE INDEX "risk_flags_risk_level_idx" ON "risk_flags"("risk_level");

-- CreateIndex
CREATE INDEX "risk_flags_created_at_idx" ON "risk_flags"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "heis_ugcId_key" ON "heis"("ugcId");

-- CreateIndex
CREATE UNIQUE INDEX "heis_inviteCode_key" ON "heis"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_userId_key" ON "student_profiles"("userId");

-- CreateIndex
CREATE INDEX "challenges_district_idx" ON "challenges"("district");

-- CreateIndex
CREATE INDEX "challenges_status_idx" ON "challenges"("status");

-- CreateIndex
CREATE INDEX "challenges_createdAt_idx" ON "challenges"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "challenge_proposals_challengeId_idx" ON "challenge_proposals"("challengeId");

-- CreateIndex
CREATE INDEX "challenge_proposals_heiId_idx" ON "challenge_proposals"("heiId");

-- CreateIndex
CREATE UNIQUE INDEX "project_teams_proposalId_key" ON "project_teams"("proposalId");

-- CreateIndex
CREATE INDEX "project_teams_heiId_idx" ON "project_teams"("heiId");

-- CreateIndex
CREATE INDEX "team_members_teamId_idx" ON "team_members"("teamId");

-- CreateIndex
CREATE INDEX "team_members_studentProfileId_idx" ON "team_members"("studentProfileId");

-- CreateIndex
CREATE INDEX "milestones_teamId_idx" ON "milestones"("teamId");

-- CreateIndex
CREATE INDEX "milestones_status_idx" ON "milestones"("status");

-- CreateIndex
CREATE INDEX "student_credentials_studentProfileId_idx" ON "student_credentials"("studentProfileId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_read_idx" ON "notifications"("read");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_heiId_fkey" FOREIGN KEY ("heiId") REFERENCES "heis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sdgs" ADD CONSTRAINT "project_sdgs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sdgs" ADD CONSTRAINT "project_sdgs_sdg_id_fkey" FOREIGN KEY ("sdg_id") REFERENCES "sdgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_scores" ADD CONSTRAINT "impact_scores_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csr_allocations" ADD CONSTRAINT "csr_allocations_corporate_org_id_fkey" FOREIGN KEY ("corporate_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csr_allocations" ADD CONSTRAINT "csr_allocations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_proposals" ADD CONSTRAINT "challenge_proposals_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_proposals" ADD CONSTRAINT "challenge_proposals_heiId_fkey" FOREIGN KEY ("heiId") REFERENCES "heis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "challenge_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_heiId_fkey" FOREIGN KEY ("heiId") REFERENCES "heis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "project_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "project_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credentials" ADD CONSTRAINT "student_credentials_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

