// Who may run the SharePoint access grant: one named owner, not a role.
export const SHAREPOINT_ADMINS = (process.env.SHAREPOINT_ADMINS || "ketavsharma@dwao.in").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const isSharePointAdmin = (email?: string | null) => !!email && SHAREPOINT_ADMINS.includes(email.toLowerCase());
