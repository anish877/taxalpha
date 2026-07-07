ALTER TABLE "ClientDocument" ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "ClientDocument" ADD COLUMN "cloudinaryPublicId" TEXT;
ALTER TABLE "ClientDocument" ADD COLUMN "cloudinaryResourceType" TEXT;
ALTER TABLE "ClientDocument" ADD COLUMN "cloudinaryDeliveryType" TEXT;
