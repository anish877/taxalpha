CREATE TABLE "DynamicFormResponse" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "formCode" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DynamicFormResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DynamicFormResponse_clientId_formCode_key" ON "DynamicFormResponse"("clientId", "formCode");

ALTER TABLE "DynamicFormResponse" ADD CONSTRAINT "DynamicFormResponse_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
