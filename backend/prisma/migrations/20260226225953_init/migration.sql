-- CreateEnum
CREATE TYPE "BrokerKind" AS ENUM ('SELF', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ClientBrokerRole" AS ENUM ('PRIMARY', 'ADDITIONAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kind" "BrokerKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientBroker" (
    "clientId" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "role" "ClientBrokerRole" NOT NULL,

    CONSTRAINT "ClientBroker_pkey" PRIMARY KEY ("clientId","brokerId")
);

-- CreateTable
CREATE TABLE "FormCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientFormSelection" (
    "clientId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,

    CONSTRAINT "ClientFormSelection_pkey" PRIMARY KEY ("clientId","formId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Broker_ownerUserId_email_key" ON "Broker"("ownerUserId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_ownerUserId_email_key" ON "Client"("ownerUserId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "FormCatalog_code_key" ON "FormCatalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FormCatalog_title_key" ON "FormCatalog"("title");

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBroker" ADD CONSTRAINT "ClientBroker_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBroker" ADD CONSTRAINT "ClientBroker_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFormSelection" ADD CONSTRAINT "ClientFormSelection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFormSelection" ADD CONSTRAINT "ClientFormSelection_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
