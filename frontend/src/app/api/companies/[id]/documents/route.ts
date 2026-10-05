import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit } from "@/lib/contracts/api";
import { listFolder, resolveLink, SharePointAccessError, type SpFolder, type SpFile } from "@/lib/sharepoint";

/**
 * GET /api/companies/[id]/documents
 * The files in the SharePoint folders mapped to this company, and nothing
 * outside them. Read-only.
 */
export const GET = withRole(CONTRACT_API_ROLES, async (_req: Request, { params }) => {
  try {
    const { id } = await params;
    const company = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true, sharepoint_folders: true } });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const folders = (Array.isArray(company.sharepoint_folders) ? company.sharepoint_folders : []) as unknown as SpFolder[];
    if (folders.length === 0) return NextResponse.json({ folders: [], files: [], message: "No SharePoint folder is mapped to this company yet." });
    const files: SpFile[] = [];
    const errors: string[] = [];
    for (const f of folders) {
      try { files.push(...(await listFolder(f, 1)).filter((x) => !x.is_folder)); }
      catch (e: any) { if (e instanceof SharePointAccessError) return NextResponse.json({ folders, files: [], not_connected: true, message: e.message }); errors.push(`${f.label}: ${e.message}`); }
    }
    files.sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? ""));
    return NextResponse.json({ folders, files, errors });
  } catch (error: any) {
    console.error("Error listing company documents:", error);
    return NextResponse.json({ error: error?.message || "Failed to list documents" }, { status: 500 });
  }
});

/**
 * POST /api/companies/[id]/documents  { folder_link }   — map a folder by pasting its link
 * POST /api/companies/[id]/documents  { remove: index } — unmap one
 */
export const POST = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    const company = await prisma.client.findUnique({ where: { id }, select: { id: true, sharepoint_folders: true } });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const folders = (Array.isArray(company.sharepoint_folders) ? company.sharepoint_folders : []) as unknown as SpFolder[];
    let next: SpFolder[];
    if (typeof body.remove === "number") next = folders.filter((_, i) => i !== body.remove);
    else {
      const link = String(body.folder_link ?? "").trim();
      if (!/^https:\/\//i.test(link)) return NextResponse.json({ error: "Paste the folder's SharePoint link (https://…)" }, { status: 400 });
      let resolved;
      try { resolved = await resolveLink(link); }
      catch (e: any) { return NextResponse.json({ error: e instanceof SharePointAccessError ? e.message : `Could not read that link: ${e.message}` }, { status: 400 }); }
      if (!resolved.is_folder) return NextResponse.json({ error: "That link is a file, not a folder" }, { status: 400 });
      if (folders.some((f) => f.drive_id === resolved.drive_id && f.path === resolved.path)) return NextResponse.json({ error: "That folder is already mapped" }, { status: 409 });
      next = [...folders, { label: body.label || resolved.name, drive_id: resolved.drive_id, path: resolved.path, web_url: resolved.web_url }];
    }
    const updated = await prisma.client.update({ where: { id }, data: { sharepoint_folders: next as any } });
    await audit(user, "Client", id, "sharepoint_folders", company, updated);
    return NextResponse.json({ folders: next });
  } catch (error: any) {
    console.error("Error mapping folder:", error);
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 400 });
  }
});
