ALTER TABLE "Broker"
  ADD COLUMN "firmName" TEXT,
  ADD COLUMN "brokerDealerCrdNumber" TEXT,
  ADD COLUMN "representativeCrdNumber" TEXT,
  ADD COLUMN "branchAddressLine1" TEXT,
  ADD COLUMN "branchAddressLine2" TEXT,
  ADD COLUMN "branchCity" TEXT,
  ADD COLUMN "branchState" TEXT,
  ADD COLUMN "branchPostalCode" TEXT,
  ADD COLUMN "branchPhone" TEXT;

ALTER TABLE "ClientBroker" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    "clientId",
    "brokerId",
    ROW_NUMBER() OVER (
      PARTITION BY "clientId"
      ORDER BY CASE WHEN "role" = 'PRIMARY' THEN 0 ELSE 1 END, "brokerId"
    ) - 1 AS next_position
  FROM "ClientBroker"
)
UPDATE "ClientBroker" AS target
SET "position" = ranked.next_position
FROM ranked
WHERE target."clientId" = ranked."clientId"
  AND target."brokerId" = ranked."brokerId";

CREATE UNIQUE INDEX "ClientBroker_clientId_position_key"
  ON "ClientBroker"("clientId", "position");
