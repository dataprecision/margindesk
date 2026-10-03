"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ContractForm, { emptyContract, type ContractFormValues } from "@/components/contracts/contract-form";

export default function NewContractPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (values: ContractFormValues) => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not create the contract");
      router.push(`/contracts/${data.contract.id}`);
      return true;
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
      return false;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <div>
        <Link href="/contracts" className="text-sm text-gray-600 hover:text-gray-900">← Contracts</Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-1">New contract</h1>
        <p className="text-gray-600 mt-1">Add the paper first; terms, purchase orders and billing rules are added on the contract's page afterwards.</p>
      </div>
      {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <section className="bg-white rounded-lg shadow p-6">
        <ContractForm initial={emptyContract} mode="new" saving={saving} onSave={save} onCancel={() => router.push("/contracts")} />
      </section>
    </div>
  );
}
