"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface Folder { label: string; web_url: string; drive_id: string; item_id: string; readable: boolean; granted: { granted_at: string; granted_by: string } | null }

export default function SharePointSettingsPage() {
  const { data: session } = useSession();
  const params = useSearchParams();
  const [data, setData] = useState<{ folders: Folder[]; last_result: any[] | null; last_run: string | null; app_id: string; callback_url: string } | null>(null);
  const [error, setError] = useState("");
  const [extra, setExtra] = useState("");
  const msg = params.get("msg");

  useEffect(() => {
    fetch("/api/sharepoint/grants").then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Not available"); setData(d); }).catch((e) => setError(e.message));
  }, [msg]);

  if (error) return <div className="container mx-auto px-4 py-8 text-gray-600">{error}</div>;
  if (!data) return <div className="container mx-auto px-4 py-8 text-gray-600">Loading…</div>;

  const links = [...data.folders.filter((f) => !f.readable).map((f) => f.web_url), ...extra.split("\n").map((s) => s.trim()).filter((s) => /^https:\/\//i.test(s))];
  const startUrl = `/api/sharepoint/grant/start?folders=${encodeURIComponent(JSON.stringify(links))}`;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-gray-600 hover:text-gray-900">← Settings</Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-1">SharePoint access</h1>
        <p className="text-gray-600 mt-1">MarginDesk reads contract documents from the SharePoint folders listed here, with its own app identity and read-only. Granting access is a one-time step done by signing in as a Microsoft 365 admin; nothing from that sign-in is kept.</p>
      </div>
      {msg && <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{msg}</div>}

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Folders</h2>
        <ul className="divide-y divide-gray-200">
          {data.folders.map((f) => (
            <li key={f.item_id} className="py-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <a href={f.web_url} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">{f.label}</a>
                <div className="text-xs text-gray-500 break-all">{f.web_url}</div>
                {f.granted && <div className="text-xs text-gray-500">Granted {f.granted.granted_at.slice(0, 10)} by {f.granted.granted_by}</div>}
              </div>
              {f.readable ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">MarginDesk can read</span> : <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">No access yet</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-lg shadow p-6 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Grant access</h2>
        <p className="text-sm text-gray-700">Signed in as {session?.user?.email}. Clicking the button sends you to Microsoft to sign in with an account that is an owner of the Accounts site; MarginDesk then grants its app read access on the folders without access above, plus any you add here, and checks it can read them.</p>
        <label className="block text-sm text-gray-700">More folders (one SharePoint folder link per line, optional)
          <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="https://dwao.sharepoint.com/sites/…/Shared Documents/…" />
        </label>
        {links.length > 0 ? (
          <a href={startUrl} className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">Sign in as Microsoft admin and grant read access to {links.length} folder{links.length === 1 ? "" : "s"}</a>
        ) : (
          <div className="text-sm text-green-700">Every listed folder is readable. Add a folder above to grant more.</div>
        )}
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer">What this needs on the Microsoft side</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>The app registration <code className="bg-gray-100 px-1 rounded">{data.app_id}</code> has the Application permission <code className="bg-gray-100 px-1 rounded">Files.SelectedOperations.Selected</code> with admin consent (already done).</li>
            <li>The redirect URI <code className="bg-gray-100 px-1 rounded">{data.callback_url}</code> must be listed under the app registration's Authentication → Web redirect URIs. If Microsoft shows an error mentioning the reply URL, add it there and try again.</li>
            <li>The account you sign in with must be an owner (or SharePoint admin) of the site holding the folders; the grant itself is a Graph call made as that account. Microsoft describes the one-off permission for that sign-in as "full access to all files you have access to" (Files.ReadWrite.All); it is bounded by your own rights, used for the grant calls only, and not kept. What MarginDesk can read afterwards is only the folders listed above as readable.</li>
          </ul>
        </details>
      </section>

      {data.last_result && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Last run{data.last_run ? ` · ${data.last_run.slice(0, 16).replace("T", " ")}` : ""}</h2>
          <ul className="space-y-1 text-sm">
            {data.last_result.map((r: any, i: number) => (
              <li key={i} className={r.ok ? "text-gray-800" : "text-red-700"}>{r.ok ? "✓" : "✗"} {r.label || r.link}{r.ok ? (r.readable ? " — granted and readable" : " — granted; read check not yet positive, try again in a minute") : ` — ${r.error}`}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
