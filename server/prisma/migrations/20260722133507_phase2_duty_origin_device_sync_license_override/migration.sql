/*
  Warnings:

  - A unique constraint covering the columns `[driverAccountId,clientDeviceId]` on the table `DriverDevice` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clientDeviceId` to the `DriverDevice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "DutyOrigin" ADD VALUE 'VENDOR_SPOT';

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "licenseOverrideAt" TIMESTAMPTZ(3),
ADD COLUMN     "licenseOverrideById" TEXT,
ADD COLUMN     "licenseOverrideReason" TEXT;

-- AlterTable
ALTER TABLE "DriverDevice" ADD COLUMN     "clientDeviceId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "SyncMutationLog" (
    "id" TEXT NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "driverAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "resultStatus" TEXT NOT NULL,
    "resultJson" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncMutationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncMutationLog_clientMutationId_key" ON "SyncMutationLog"("clientMutationId");

-- CreateIndex
CREATE INDEX "SyncMutationLog_driverAccountId_idx" ON "SyncMutationLog"("driverAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverDevice_driverAccountId_clientDeviceId_key" ON "DriverDevice"("driverAccountId", "clientDeviceId");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_licenseOverrideById_fkey" FOREIGN KEY ("licenseOverrideById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
