-- CreateTable
CREATE TABLE "ClientFormPdf" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "formCode" TEXT NOT NULL,
    "workspaceFormCode" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "documentTitle" TEXT,
    "fileName" TEXT,
    "sourceRunId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientFormPdf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientFormPdf_clientId_formCode_pdfUrl_key" ON "ClientFormPdf"("clientId", "formCode", "pdfUrl");

-- CreateIndex
CREATE INDEX "ClientFormPdf_clientId_workspaceFormCode_receivedAt_idx" ON "ClientFormPdf"("clientId", "workspaceFormCode", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "ClientFormPdf_receivedAt_idx" ON "ClientFormPdf"("receivedAt" DESC);

-- AddForeignKey
ALTER TABLE "ClientFormPdf" ADD CONSTRAINT "ClientFormPdf_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
