-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('tools', 'coding', 'skill', 'memory', 'open');

-- CreateEnum
CREATE TYPE "Factor" AS ENUM ('skills', 'tools', 'memory', 'model');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('draft', 'queued', 'running', 'stopped_budget', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "Arm" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('pending', 'running', 'graded', 'failed', 'ingest_failed');

-- CreateEnum
CREATE TYPE "FailureCause" AS ENUM ('agent_exhausted_budget', 'agent_refused_task', 'sandbox_failed', 'model_provider_failed', 'verifier_failed', 'harbor_failed', 'cancelled', 'unclassified');

-- CreateEnum
CREATE TYPE "GraderType" AS ENUM ('file_exists', 'command', 'regex', 'json', 'llm_judge');

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "yamlHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "TaskCategory" NOT NULL,
    "prompt" TEXT NOT NULL,
    "fixtures" TEXT[],
    "graders" JSONB NOT NULL,
    "timeoutSec" INTEGER NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "yamlHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hermesImageDigest" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "skills" TEXT[],
    "toolsets" TEXT[],
    "memory" JSONB NOT NULL,
    "maxTurns" INTEGER NOT NULL,
    "compiledHomeHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "yamlHash" TEXT,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "factor" "Factor" NOT NULL,
    "repeats" INTEGER NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "passThreshold" DOUBLE PRECISION NOT NULL,
    "costCapUsd" DOUBLE PRECISION NOT NULL,
    "seed" INTEGER NOT NULL,
    "heldOutTaskIds" TEXT[],
    "baselineConfigId" UUID NOT NULL,
    "candidateConfigId" UUID NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'draft',
    "stopRequested" BOOLEAN NOT NULL DEFAULT false,
    "harborJobName" TEXT,
    "jobDir" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentTask" (
    "experimentId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ExperimentTask_pkey" PRIMARY KEY ("experimentId","taskId")
);

-- CreateTable
CREATE TABLE "Trial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "experimentId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "configId" UUID NOT NULL,
    "arm" "Arm" NOT NULL,
    "repeatIndex" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "harborTrialName" TEXT,
    "harborTrialDir" TEXT,
    "status" "TrialStatus" NOT NULL DEFAULT 'pending',
    "failureCause" "FailureCause",
    "rewardValid" BOOLEAN NOT NULL DEFAULT false,
    "turnExitReason" TEXT,
    "exitCode" INTEGER,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "durationMs" INTEGER,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "cacheRead" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "gatePassed" BOOLEAN,
    "passed" BOOLEAN,
    "eventsPath" TEXT,
    "sessionPath" TEXT,
    "trajectoryPath" TEXT,
    "workspacePath" TEXT,
    "stderrPath" TEXT,
    "manifestPath" TEXT,
    "error" TEXT,

    CONSTRAINT "Trial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trialId" UUID NOT NULL,
    "graderId" TEXT NOT NULL,
    "type" "GraderType" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "gate" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunManifest" (
    "trialId" UUID NOT NULL,
    "json" JSONB NOT NULL,

    CONSTRAINT "RunManifest_pkey" PRIMARY KEY ("trialId")
);

-- CreateTable
CREATE TABLE "StatsSnapshot" (
    "experimentId" UUID NOT NULL,
    "json" JSONB NOT NULL,
    "computedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatsSnapshot_pkey" PRIMARY KEY ("experimentId")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Task_slug_key" ON "Task"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_slug_key" ON "AgentConfig"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_slug_key" ON "Experiment"("slug");

-- CreateIndex
CREATE INDEX "Experiment_status_idx" ON "Experiment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Trial_harborTrialName_key" ON "Trial"("harborTrialName");

-- CreateIndex
CREATE INDEX "Trial_experimentId_status_idx" ON "Trial"("experimentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Trial_experimentId_taskId_arm_repeatIndex_key" ON "Trial"("experimentId", "taskId", "arm", "repeatIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_trialId_graderId_key" ON "Grade"("trialId", "graderId");

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_baselineConfigId_fkey" FOREIGN KEY ("baselineConfigId") REFERENCES "AgentConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_candidateConfigId_fkey" FOREIGN KEY ("candidateConfigId") REFERENCES "AgentConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentTask" ADD CONSTRAINT "ExperimentTask_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentTask" ADD CONSTRAINT "ExperimentTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AgentConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "Trial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunManifest" ADD CONSTRAINT "RunManifest_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "Trial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatsSnapshot" ADD CONSTRAINT "StatsSnapshot_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
