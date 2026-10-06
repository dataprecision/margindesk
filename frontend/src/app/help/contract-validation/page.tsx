import Link from "next/link";

// Help: how the contracting team validates a contract and adds a new one.
// Plain content, no data; kept in the app so it sits next to the screens it
// describes.

export const metadata = { title: "Contract validation guide - MarginDesk" };

const H = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="text-xl font-semibold text-gray-900 mt-10 mb-3 scroll-mt-6">{children}</h2>;
const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="text-base font-semibold text-gray-900 mt-6 mb-2">{children}</h3>;
const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-gray-800 leading-6 mb-3">{children}</p>;
const Steps = ({ items }: { items: React.ReactNode[] }) => <ol className="list-decimal pl-6 space-y-2 text-sm text-gray-800 leading-6 mb-4">{items.map((s, i) => <li key={i}>{s}</li>)}</ol>;
const Bullets = ({ items }: { items: React.ReactNode[] }) => <ul className="list-disc pl-6 space-y-1.5 text-sm text-gray-800 leading-6 mb-4">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>;
const Note = ({ children }: { children: React.ReactNode }) => <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">{children}</div>;
const Field = ({ children }: { children: React.ReactNode }) => <span className="font-medium text-gray-900">{children}</span>;

export default function ContractValidationGuide() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Link href="/help" className="text-sm text-gray-600 hover:text-gray-900">← Help</Link>
      <h1 className="text-3xl font-bold text-gray-900 mt-1">Contract validation: the contracting team's guide</h1>
      <p className="text-gray-600 mt-2">How to check a contract that is already in MarginDesk, how to add a new one, and what is needed before you can mark the paper as checked.</p>

      <nav className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">On this page</div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-1">
          {[["what", "What validation means"], ["need", "What you need before you start"], ["validate", "Validating an existing contract"], ["new", "Adding a new contract"], ["po", "Purchase orders"], ["approval", "Approval (maker-checker)"], ["cases", "Special cases"], ["after", "What happens after sign-off"], ["checklist", "Quick checklist and questions"]].map(([id, label]) => (
            <li key={id}><a href={`#${id}`} className="text-blue-700 hover:underline">{label}</a></li>
          ))}
        </ul>
      </nav>

      <H id="what">What validation means</H>
      <P>Every customer contract in MarginDesk was first read by software from the agreements and purchase orders in SharePoint, or built from past invoices where no paper had been read. Before the register is used to raise estimates, three teams check each contract against the documents:</P>
      <Bullets items={[
        <><Field>Contracting (legal)</Field>: the paper. Attach the signed agreement and the current PO as SharePoint links, and confirm that the basis, the start and end dates and the invoiced-to entity in MarginDesk match them.</>,
        <><Field>Commercial (the team lead)</Field>: the billing rules. Each rule says how a service is charged (fixed fee, hours × rate, bundle, tiers, percentage of spend, pass-through, milestone). The lead confirms each one.</>,
        <><Field>Billing (finance)</Field>: the Zoho Books side. The company is linked to its Zoho record, with GSTIN, currency and payment terms, and a valid PO where the customer uses them.</>,
      ]} />
      <P>A contract counts as validated only when all three have signed off. Until then no estimate can be raised for it. Your part is the first column on the <Link href="/contracts/validation" className="text-blue-700 hover:underline">Validation</Link> page.</P>

      <H id="need">What you need before you start</H>
      <Bullets items={[
        <>A MarginDesk login with the <Field>legal</Field>, <Field>finance</Field> or <Field>owner</Field> role. Legal users see only Companies and Contracts.</>,
        <>Access to the Accounts SharePoint site: the <Field>Agreements</Field> folder (signed agreements, one folder per client) and <Field>Workflow / PO Received</Field> (purchase orders), plus the Legal site for drafts.</>,
        <>For each contract: the signed master agreement, every addendum or SOW still in force, any renewal letter, and the current purchase order.</>,
        <>How to get a SharePoint link: open the file in SharePoint, choose <Field>Copy link</Field>, and paste it. The link must start with https:// so colleagues can open it; a file path from Explorer does not work.</>,
      ]} />

      <H id="validate">Validating an existing contract, step by step</H>
      <Steps items={[
        <>Open <Link href="/contracts/validation" className="text-blue-700 hover:underline">Billing → Validation</Link>, click the <Field>Contracting (legal)</Field> card and keep <Field>Only what is still pending</Field> ticked. Each row lists what is missing for your sign-off.</>,
        <>Open the contract. At the top is the validation checklist; below it the summary, the terms read from the agreement, the billing rules, follow-ups, open pointers, open questions and purchase orders.</>,
        <>Read the <Field>Open pointers</Field> and <Field>Open questions</Field> first. They are what the reading could not settle: a differing invoice, an unreadable scan, two readings that disagree, a missing number. Settle what you can from the documents and tick each one.</>,
        <>Find the documents in SharePoint and compare them with the summary: <Field>Based on</Field> (signed agreement, agreement + PO, PO only, expired agreement with work continuing, unsigned draft, no paper found), <Field>Contract start</Field> and <Field>Contract end</Field>, <Field>Invoiced to</Field> (the legal entity named on the paper), <Field>Stage</Field> and <Field>Purchase orders</Field> (required, issued in practice, not used).</>,
        <>If anything is wrong, click <Field>Edit details</Field>, correct it and save. If the counterparty is not linked to a company, pick it in the <Field>Company</Field> box; if the company is not in the list yet, add it from the same box (it becomes a placeholder until finance links it to Zoho Books).</>,
        <>In the <Field>Contracting</Field> card click <Field>Attach SharePoint links</Field> and paste one link per line as <Field>Name | link</Field>, for example <code className="text-xs bg-gray-100 px-1 rounded">MSA signed 2026 | https://dwao.sharepoint.com/…</code>. Attach the agreement, each addendum in force and the current PO.</>,
        <>Check the <Field>Terms read from the agreement</Field>. These are the clauses the reading found, with the quote and page. Fix a wrong one with its edit button, add a missing one with <Field>Add term</Field>; the lead builds the billing rules from these.</>,
        <>Check the <Field>Purchase orders</Field> section (see below) and add any PO that is missing.</>,
        <>When every item in the Contracting card shows a tick, click <Field>Mark paper checked</Field>. The button stays grey until the items are in place; hover over it to see why.</>,
      ]} />
      <Note>The end date may be left blank only when the agreement truly has none (an open-ended agreement with a notice period). If the agreement has expired and work continues, do not invent a date: set the stage to <Field>Renewal in progress</Field>, leave the paper unchecked and chase the renewal through a follow-up.</Note>

      <H id="new">Adding a new contract, step by step</H>
      <Steps items={[
        <>Go to <Link href="/contracts" className="text-blue-700 hover:underline">Billing → Contracts</Link> and click <Field>New contract</Field>.</>,
        <><Field>Who</Field>: the counterparty name as written on the paper; the company (type to pick from the Companies list, or add it if it is new); the invoiced-to legal entity; the type (customer, vendor, both, NDA only); the SPOC, who must be a person from People.</>,
        <><Field>Paper</Field>: based on, stage, start and end dates, purchase-order policy, notes.</>,
        <><Field>Documents</Field>: paste the SharePoint links, one per line.</>,
        <>Click <Field>Create contract</Field>. You land on its page.</>,
        <>Add the <Field>terms</Field> (service, billing type, amount as written, dates, the clause it comes from), the <Field>purchase orders</Field>, and any <Field>follow-up</Field> with a due date and owner.</>,
        <>Tell the team lead: the billing rules (<Field>Add rule</Field> in the rules section, or confirming the proposed ones) are their part, and finance checks the Zoho side. Each team signs its own card.</>,
      ]} />
      <P>If the customer is not in Zoho Books yet, that is fine: add it as a company anyway. The nightly sync watches for the Zoho record and proposes the match; finance confirms it on the company page and everything moves across.</P>

      <H id="po">Purchase orders</H>
      <P>POs matter twice: they are the contract for PO-only customers, and they are the budget that invoices consume. In the <Field>Purchase orders</Field> section click <Field>Add PO</Field> and fill in:</P>
      <Bullets items={[
        <><Field>PO number</Field> exactly as the customer prints it. Invoices quote this number, and MarginDesk uses it to work out how much of the PO has been used.</>,
        <><Field>PO date</Field>, <Field>valid from</Field> and <Field>valid to</Field>.</>,
        <><Field>Value before tax</Field> and <Field>currency</Field>. Without a value the PO cannot be judged, and it shows as "value not known".</>,
        <><Field>Already invoiced before our records</Field>: for a PO that started before April 2025, the amount already billed against it, so the balance is right.</>,
        <><Field>Covers</Field>: which services or months it pays for. <Field>Document link</Field>: the SharePoint link to the PO itself.</>,
      ]} />
      <P>Once saved, the PO shows consumed, balance, run rate and the date it is likely to run out. Open a PO to see the invoices on it and to tag an invoice the number did not catch.</P>

      <H id="cases">Special cases</H>
      <H3>Expired agreement, work continuing</H3>
      <P>Leave the paper unchecked. Set the stage to <Field>Renewal in progress</Field>, note the position in the notes, and make sure a renewal follow-up exists with an owner and date. The owner decides whether billing continues meanwhile; that decision belongs in the notes.</P>
      <H3>PO only, no master agreement</H3>
      <P>Based on: <Field>PO only</Field>. The PO is the contract: its validity dates are the contract dates, its value is the ceiling, and its terms (payment days, scope) are the terms. Attach the PO as the document and record it in the PO section as well.</P>
      <H3>The signed copy is a scan nobody can read</H3>
      <P>Attach it anyway and add an open question saying which figures were taken from an unsigned copy or from invoices. If a readable copy exists elsewhere (the Legal site, email), attach that too. Do not sign off the paper on an unreadable scan alone unless you have read the physical document.</P>
      <H3>One agreement, two invoiced entities</H3>
      <P>Keep one contract for the agreement and record both entities in the notes, or create one contract per entity with the same documents when the terms differ. The invoiced-to field should hold the entity that appears on the invoices for that contract.</P>
      <H3>Vendor contracts and NDAs</H3>
      <P>Vendor contracts (we pay) and NDAs are in the same register with their type set accordingly. They do not go through the three-team validation and never produce estimates.</P>
      <H3>Company not in Zoho Books</H3>
      <P>The company shows as <Field>Not in Zoho yet</Field> on the Companies page. That does not block your check; it blocks finance's. When the Zoho record exists, the nightly sync suggests the match and finance confirms it.</P>

      <H id="after">What happens after sign-off</H>
      <Bullets items={[
        <>The contract shows <Field>Checked</Field> in your column. Once the lead and finance have also signed, it shows as validated and its draft estimates can be signed off.</>,
        <>Renewal follow-ups are raised automatically 90 days before an end date, and when a PO is nearly used up or expiring with money left; they go to the SPOC with the finance and legal owners named.</>,
        <>If a document is replaced (a new addendum, a renewal), attach the new link, update the dates and undo your check so the new paper is checked again.</>,
      ]} />

      <H id="checklist">Quick checklist and common questions</H>
      <div className="overflow-x-auto mb-4">
        <table className="min-w-full text-sm border border-gray-200">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Before you mark paper checked</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-gray-500">Where</th></tr></thead>
          <tbody className="divide-y divide-gray-200">
            {[
              ["Signed agreement, addenda in force and current PO attached as SharePoint links", "Contracting card → Attach SharePoint links, or Edit details → Documents"],
              ["Based on matches the paper", "Edit details → Based on"],
              ["Start and end dates match the paper (end blank only if truly open-ended)", "Edit details"],
              ["Invoiced-to is the legal entity on the paper", "Edit details → Invoiced to"],
              ["Company linked (or added as a placeholder)", "Edit details → Company"],
              ["Open pointers and open questions settled", "Sections on the contract page"],
              ["Terms read from the agreement are right", "Terms section → edit / Add term"],
              ["Every PO recorded with number, dates and value", "Purchase orders → Add PO"],
            ].map(([a, b]) => <tr key={a}><td className="px-3 py-2 text-gray-800">{a}</td><td className="px-3 py-2 text-gray-600">{b}</td></tr>)}
          </tbody>
        </table>
      </div>
      <H3>Why is the sign-off button grey?</H3>
      <P>One of the items in your card is still open. Hover over the button to see which. The most common reason is that no https:// document link is attached yet.</P>
      <H3>I checked a contract by mistake</H3>
      <P>Click <Field>Undo</Field> in your card. The other teams' checks are not affected.</P>
      <H3>The reading recorded something different from what I see in the document</H3>
      <P>The document wins. Correct the entry, and if the difference affects billing, add an open question so the lead sees it when confirming the rules.</P>
      <H3>Who do I ask?</H3>
      <P>The contract's SPOC owns the relationship; the company page shows the business, legal and finance owners on our side.</P>

      <H id="approval">Approval (maker-checker)</H>
      <P>Checks say a team has looked. Approval is the formal sign-off accounts can rely on, and it follows the maker-checker rule: the person who last changed a record cannot be the one who approves it.</P>
      <Bullets items={[
        <><Field>What gets approved</Field>: each MSA or NDA (on the company page), each billing line, and finally the contract as a whole.</>,
        <><Field>The steps</Field>: whoever enters or corrects a record is its maker. They click <Field>Submit for approval</Field>. A different person with the right role clicks <Field>Approve</Field> or <Field>Send back</Field> with a reason. Agreements are approved by contracting or the owner; billing lines by invoicing, finance or the owner; the contract by finance or the owner.</>,
        <><Field>What approval needs</Field>: an agreement needs its dates and a signed document linked from SharePoint. A billing line needs its shape and numbers, the clause as written with its page or clause number, the source document and a start date; a line not read from a signed contract or PO also needs an evidence note saying who agreed it, with the email link. The contract needs all three team checks, an approved agreement and every live billing line approved.</>,
        <><Field>Any edit resets it</Field>. Changing an approved agreement, line or contract header drops it back to draft, so an approval always refers to the record as it is now. Changing an agreement also resets the contracts under it; changing or adding a line resets the contract.</>,
        <><Field>Lapsed</Field>: an approval that no longer holds (the agreement ended, the line runs beyond the agreement, a team check was undone) shows as lapsed and blocks estimates until it is resubmitted.</>,
        <><Field>What is kept</Field>: who approved, when, any note, and a frozen copy of what was approved, including the SharePoint document's last-modified time, so a replaced file is visible later. The <Field>Audit trail</Field> at the bottom of each contract lists every change, check and approval, and can be downloaded as CSV.</>,
      ]} />
    </div>
  );
}
