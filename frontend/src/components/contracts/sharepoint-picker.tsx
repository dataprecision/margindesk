"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Pick documents from the SharePoint folders mapped to a company. Shows only
// those folders' files; read-only. Falls back to a clear message until the
// admin has granted MarginDesk access.

interface SpFile { id: string; name: string; web_url: string; size: number | null; modified: string | null; folder: string }

export default function SharePointPicker({ clientId, alreadyAttached, onAttach, onClose, saving }: {
  clientId: string;
  alreadyAttached: string[]; // web urls already on the contract
  onAttach: (files: { name: string; uri: string }[]) => Promise<boolean>;
  onClose: () => void;
  saving: boolean;
}) {
  const [files, setFiles] = useState<SpFile[]>([]);
  const [folders, setFolders] = useState<{ label: string; web_url?: string | null }[]>([]);
  const [message, setMessage] = useState("");
  const [notConnected, setNotConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch(`/api/companies/${clientId}/documents`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not list documents"); setFiles(d.files || []); setFolders(d.folders || []); setMessage(d.message || (d.errors?.length ? d.errors.join("; ") : "")); setNotConnected(!!d.not_connected); })
      .catch((e) => setMessage(e.message))
      .finally(() => setLoading(false));
  }, [clientId]);

  const visible = files.filter((f) => !filter || `${f.name} ${f.folder}`.toLowerCase().includes(filter.toLowerCase()));
  const chosen = files.filter((f) => picked[f.id]);
  const fmtSize = (n: number | null) => (n == null ? "" : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`);

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-900">Pick from this company's SharePoint folders</div>
        <button onClick={onClose} className="text-xs text-gray-600 hover:underline">Close</button>
      </div>
      {folders.length > 0 && <div className="text-xs text-gray-500">Folders: {folders.map((f, i) => <span key={i}>{i > 0 ? "; " : ""}{f.web_url ? <a href={f.web_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{f.label}</a> : f.label}</span>)}</div>}
      {loading ? (
        <div className="text-xs text-gray-500">Reading the folders…</div>
      ) : notConnected ? (
        <div className="text-sm text-amber-800">{message} Until then, paste the file's link below.</div>
      ) : files.length === 0 ? (
        <div className="text-sm text-gray-700">{message || "No files found in the mapped folders."} {folders.length === 0 && <>Map a folder on the <Link href={`/companies/${clientId}`} className="text-blue-700 hover:underline">company page</Link>.</>}</div>
      ) : (
        <>
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by file name" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <ul className="max-h-72 overflow-y-auto divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
            {visible.map((f) => {
              const done = alreadyAttached.includes(f.web_url);
              return (
                <li key={f.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                  <input type="checkbox" disabled={done} checked={done || !!picked[f.id]} onChange={(e) => setPicked({ ...picked, [f.id]: e.target.checked })} />
                  <div className="min-w-0 flex-1">
                    <a href={f.web_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline break-all">{f.name}</a>
                    <div className="text-xs text-gray-500">{f.folder}{f.modified ? ` · ${f.modified.slice(0, 10)}` : ""}{f.size != null ? ` · ${fmtSize(f.size)}` : ""}{done ? " · already attached" : ""}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <button disabled={saving || chosen.length === 0} onClick={async () => { if (await onAttach(chosen.map((f) => ({ name: f.name, uri: f.web_url })))) onClose(); }} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium disabled:opacity-50">Attach {chosen.length || ""} selected</button>
          </div>
        </>
      )}
    </div>
  );
}
