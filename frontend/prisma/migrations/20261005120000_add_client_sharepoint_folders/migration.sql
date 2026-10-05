-- Additive: the SharePoint folders mapped to each company.
ALTER TABLE "Client" ADD COLUMN "sharepoint_folders" JSONB NOT NULL DEFAULT '[]';
