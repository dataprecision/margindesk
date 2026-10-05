import Link from "next/link";

export const metadata = { title: "Help - MarginDesk" };

const GUIDES = [
  { href: "/help/contract-validation", title: "Contract validation: the contracting team's guide", text: "How to check a contract against the SharePoint documents, add a new contract, record purchase orders, and what each sign-off needs." },
];

export default function HelpPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900">Help</h1>
      <p className="text-gray-600 mt-1">Guides for the people who keep MarginDesk's register right.</p>
      <ul className="mt-6 space-y-3">
        {GUIDES.map((g) => (
          <li key={g.href} className="rounded-lg border border-gray-200 bg-white p-4">
            <Link href={g.href} className="text-lg font-medium text-blue-700 hover:underline">{g.title}</Link>
            <p className="text-sm text-gray-600 mt-1">{g.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
