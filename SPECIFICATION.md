# MarginDesk - Validated Implementation Specification

**Generated**: 2025-10-23
**Version**: 1.0
**Status**: Ready for Implementation

---

## Executive Summary

**MarginDesk** is a React + Next.js operational finance application that calculates project gross/net margins using utilization-aware costs, performs month-end accruals (Unbilled & Deferred revenue), allocates overheads using configurable policies, syncs invoices/POs/customers from Zoho Books, and stores centralized documentation with audit trails.

### Key Architectural Decisions (Validated)

| Decision Area | Choice | Rationale |
|--------------|---------|-----------|
| **Freeze/Unfreeze** | Option C: Versioned snapshots | Preserves historical data integrity for audits & BI |
| **Zoho PO Integration** | Option C: App-managed POs | Simplifies integration; PO reference in Zoho invoices only |
| **At-Risk WIP Scope** | Since PO `valid_from`, active POs only | Prevents false positives from expired/future POs |
| **WIP Storage** | Dual: Real-time compute + frozen storage | Dashboard freshness + audit immutability |
| **Overhead Weights** | Sum to 1.0 (validation error if not) | Balanced allocation; explicit loading requires >1.0 config |
| **Partial Month Proration** | Auto-prorate CTC, allow override | Accurate costs with Finance flexibility |
| **Document Approvals** | Not required (storage/versioning only) | Simplifies MVP; can add workflow later |

---

## 1. Data Model (Prisma Schema)

### 1.1 Core Schema with Validated Types

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================================
// MASTER DATA
// ============================================================================

model Client {
  id               String    @id @default(cuid())
  name             String
  zoho_contact_id  String?   @unique
  billing_currency String    @default("INR") // ISO 4217
  gstin            String?
  pan              String?
  tags             String[]  @default([])
  created_at       DateTime  @default(now())
  updated_at       DateTime  @updatedAt

  projects         Project[]
  doc_spaces       DocSpace[]

  @@index([name])
  @@index([zoho_contact_id])
}

enum PricingModel {
  TnM       // Time & Materials
  Retainer
  Milestone
}

enum ProjectStatus {
  draft
  active
  on_hold
  completed
  cancelled
}

model Project {
  id              String         @id @default(cuid())
  client_id       String
  name            String
  pricing_model   PricingModel
  start_date      DateTime
  end_date        DateTime?
  status          ProjectStatus  @default(draft)
  zoho_project_id String?        @unique
  created_at      DateTime       @default(now())
  updated_at      DateTime       @updatedAt

  client          Client         @relation(fields: [client_id], references: [id], onDelete: Restrict)

  allocations     Allocation[]
  project_costs   ProjectCost[]
  purchase_orders PO[]
  invoices        Invoice[]
  accrual_lines   AccrualLine[]
  billing_plans   BillingPlan[]
  doc_spaces      DocSpace[]

  @@index([client_id])
  @@index([status])
  @@index([start_date, end_date])
}

model Person {
  id                 String    @id @default(cuid())
  name               String
  role               String    // e.g., "Engineer", "Manager", "Analyst"
  billable           Boolean   @default(true)
  ctc_monthly        Decimal   @db.Decimal(12, 2) // INR or primary currency
  utilization_target Decimal   @db.Decimal(5, 2)  // 0.00 to 1.00 (0% to 100%)
  start_date         DateTime
  end_date           DateTime?
  created_at         DateTime  @default(now())
  updated_at         DateTime  @updatedAt

  allocations        Allocation[]

  @@index([billable])
  @@index([start_date, end_date])
}

enum POStatus {
  draft
  active
  expired
  closed
}

model PO {
  id                   String    @id @default(cuid())
  project_id           String
  po_number            String    @unique
  currency             String    @default("INR")
  amount_total         Decimal   @db.Decimal(15, 2)
  valid_from           DateTime
  valid_to             DateTime
  zoho_purchaseorder_id String?  @unique
  status               POStatus  @default(draft)
  amount_billed_to_date Decimal  @db.Decimal(15, 2) @default(0)
  amount_remaining     Decimal   @db.Decimal(15, 2) // Computed: amount_total - amount_billed_to_date
  created_at           DateTime  @default(now())
  updated_at           DateTime  @updatedAt

  project              Project   @relation(fields: [project_id], references: [id], onDelete: Restrict)

  @@index([project_id])
  @@index([status])
  @@index([valid_from, valid_to])
}

// ============================================================================
// OPERATIONAL DATA
// ============================================================================

model Allocation {
  id               String    @id @default(cuid())
  person_id        String
  project_id       String
  period_month     DateTime  // First day of month: 2025-09-01
  hours_billable   Decimal   @db.Decimal(6, 2)
  hours_nonbillable Decimal  @db.Decimal(6, 2) @default(0)
  pct_effort       Decimal   @db.Decimal(5, 2) // 0.00 to 1.00
  created_at       DateTime  @default(now())
  updated_at       DateTime  @updatedAt

  person           Person    @relation(fields: [person_id], references: [id], onDelete: Restrict)
  project          Project   @relation(fields: [project_id], references: [id], onDelete: Restrict)

  @@unique([person_id, project_id, period_month])
  @@index([period_month])
  @@index([project_id, period_month])
}

enum ProjectCostType {
  tool
  travel
  contractor
  other
}

model ProjectCost {
  id           String           @id @default(cuid())
  project_id   String
  period_month DateTime
  type         ProjectCostType
  amount       Decimal          @db.Decimal(12, 2)
  notes        String?
  created_at   DateTime         @default(now())
  updated_at   DateTime         @updatedAt

  project      Project          @relation(fields: [project_id], references: [id], onDelete: Restrict)

  @@index([project_id, period_month])
}

model OverheadPool {
  id           String   @id @default(cuid())
  period_month DateTime @unique
  hr           Decimal  @db.Decimal(12, 2) @default(0)
  it           Decimal  @db.Decimal(12, 2) @default(0)
  admin        Decimal  @db.Decimal(12, 2) @default(0)
  rent         Decimal  @db.Decimal(12, 2) @default(0)
  mgmt         Decimal  @db.Decimal(12, 2) @default(0)
  misc         Decimal  @db.Decimal(12, 2) @default(0)
  notes        String?
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  @@index([period_month])
}

enum OverheadMethod {
  per_head
  rev_pct
  direct_cost_pct
  hybrid
}

model OverheadPolicy {
  id           String          @id @default(cuid())
  period_month DateTime        @unique
  method       OverheadMethod
  params_json  Json            // e.g., {"weights": {"per_head": 0.5, "rev_pct": 0.5}, "include_per_head_overhead_in_ehc": true}
  approved_by  String?
  approved_at  DateTime?
  created_at   DateTime        @default(now())
  updated_at   DateTime        @updatedAt

  @@index([period_month])
}

model BillingPlan {
  id         String   @id @default(cuid())
  project_id String
  rule_json  Json     // Pricing model-specific rules (T&M rates, retainer amount, milestone schedule)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  project    Project  @relation(fields: [project_id], references: [id], onDelete: Cascade)

  @@unique([project_id]) // One billing plan per project
}

// ============================================================================
// ACCOUNTING INTERFACES
// ============================================================================

enum InvoiceStatus {
  draft
  sent
  paid
  void
}

model Invoice {
  id              String         @id @default(cuid())
  project_id      String
  period_month    DateTime
  zoho_invoice_id String?        @unique
  amount          Decimal        @db.Decimal(15, 2)
  issued_on       DateTime
  due_on          DateTime
  status          InvoiceStatus  @default(draft)
  created_at      DateTime       @default(now())
  updated_at      DateTime       @updatedAt

  project         Project        @relation(fields: [project_id], references: [id], onDelete: Restrict)
  cash_receipts   CashReceipt[]

  @@index([project_id, period_month])
  @@index([status])
  @@index([zoho_invoice_id])
}

model CashReceipt {
  id          String   @id @default(cuid())
  invoice_id  String
  received_on DateTime
  amount      Decimal  @db.Decimal(15, 2)
  ref_no      String?
  created_at  DateTime @default(now())

  invoice     Invoice  @relation(fields: [invoice_id], references: [id], onDelete: Restrict)

  @@index([invoice_id])
}

enum AccrualSnapshotStatus {
  open
  frozen
}

model AccrualSnapshot {
  id              String                 @id @default(cuid())
  period_month    DateTime               @unique
  status          AccrualSnapshotStatus  @default(open)
  frozen_at       DateTime?
  frozen_by       String?                // User ID who froze
  version         Int                    @default(1) // NEW: Support Option C versioning
  superseded_by   String?                @unique // Points to new snapshot if unfrozen
  created_at      DateTime               @default(now())
  updated_at      DateTime               @updatedAt

  accrual_lines   AccrualLine[]
  journal_exports JournalExport[]

  superseding_snapshot AccrualSnapshot?  @relation("SnapshotVersion", fields: [superseded_by], references: [id])
  superseded_snapshot  AccrualSnapshot?  @relation("SnapshotVersion")

  @@index([period_month, version])
  @@index([status])
}

model AccrualLine {
  id             String           @id @default(cuid())
  snapshot_id    String
  project_id     String
  earned_rev     Decimal          @db.Decimal(15, 2)
  invoiced_rev   Decimal          @db.Decimal(15, 2)
  unbilled_rev   Decimal          @db.Decimal(15, 2)
  deferred_rev   Decimal          @db.Decimal(15, 2)
  direct_cost    Decimal          @db.Decimal(15, 2)
  overhead_alloc Decimal          @db.Decimal(15, 2)
  gross_amt      Decimal          @db.Decimal(15, 2)
  gross_pct      Decimal          @db.Decimal(7, 4) // 0.0000 to 1.0000
  net_amt        Decimal          @db.Decimal(15, 2)
  net_pct        Decimal          @db.Decimal(7, 4)
  at_risk_wip    Decimal          @db.Decimal(15, 2) // Stored on freeze per validated spec
  created_at     DateTime         @default(now())

  snapshot       AccrualSnapshot  @relation(fields: [snapshot_id], references: [id], onDelete: Restrict)
  project        Project          @relation(fields: [project_id], references: [id], onDelete: Restrict)

  @@unique([snapshot_id, project_id])
  @@index([project_id])
}

enum JournalExportType {
  unbilled
  deferred
  reversal
}

model JournalExport {
  id          String            @id @default(cuid())
  snapshot_id String
  type        JournalExportType
  file_url    String            // S3 URL
  created_at  DateTime          @default(now())

  snapshot    AccrualSnapshot   @relation(fields: [snapshot_id], references: [id], onDelete: Restrict)

  @@index([snapshot_id])
}

// ============================================================================
// DOCUMENTATION & LEGAL
// ============================================================================

enum DocCategory {
  PO
  MSA
  SOW
  NDA
  Policy
  SOP
  Audit
}

enum DocAccessTier {
  public
  restricted
  legal
}

enum DocStatus {
  draft
  active
  obsolete
}

model DocSpace {
  id            String        @id @default(cuid())
  project_id    String?
  client_id     String?
  title         String
  category      DocCategory
  version       String        // Use semantic versioning: "1.0", "1.1", "2.0"
  file_url      String        // S3 URL with server-side encryption
  sha256        String        // Immutable hash for integrity verification
  signed        Boolean       @default(false)
  signed_by     String?
  signed_at     DateTime?
  retention_till DateTime?
  access_tier   DocAccessTier @default(restricted)
  tags          String[]      @default([])
  status        DocStatus     @default(draft)
  created_at    DateTime      @default(now())
  updated_at    DateTime      @updatedAt

  project       Project?      @relation(fields: [project_id], references: [id], onDelete: SetNull)
  client        Client?       @relation(fields: [client_id], references: [id], onDelete: SetNull)

  approvals     Approval[]

  @@index([project_id])
  @@index([client_id])
  @@index([category])
  @@index([status])
  @@index([retention_till])
}

enum ApprovalDecision {
  approved
  rejected
}

model Approval {
  id           String           @id @default(cuid())
  docspace_id  String
  step         Int              // Sequential step number
  approver_id  String           // User ID
  decision     ApprovalDecision?
  decided_at   DateTime?
  comment      String?
  created_at   DateTime         @default(now())

  docspace     DocSpace         @relation(fields: [docspace_id], references: [id], onDelete: Cascade)

  @@unique([docspace_id, step])
  @@index([approver_id])
}

model AuditLog {
  id          String   @id @default(cuid())
  actor_id    String   // User ID performing the action
  entity      String   // e.g., "Allocation", "OverheadPolicy", "AccrualSnapshot"
  entity_id   String
  action      String   // e.g., "create", "update", "delete", "freeze", "unfreeze"
  before_json Json?    // State before action
  after_json  Json?    // State after action
  at          DateTime @default(now())

  @@index([entity, entity_id])
  @@index([actor_id])
  @@index([at])
}

// ============================================================================
// USER & RBAC (NextAuth integration)
// ============================================================================

enum UserRole {
  owner
  finance
  pm
  readonly
}

model User {
  id         String   @id @default(cuid())
  email      String   @unique
  name       String?
  role       UserRole @default(readonly)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  @@index([email])
  @@index([role])
}
```

---

## 2. Calculation Engine Specification

### 2.1 Effective Hourly Cost (EHC)

**Formula**:
```typescript
effective_hourly_cost = (ctc_monthly + per_head_overhead) / (160 * max(utilization, 0.01))
```

**Parameters**:
- `ctc_monthly`: Person's monthly CTC (pro-rated if mid-month hire/departure)
- `per_head_overhead`: Derived from `OverheadPool ÷ billable_headcount` (if policy enables)
- `utilization`: Actual utilization for the period (default to `utilization_target` if no allocations)
- `160`: Standard monthly hours for FTE (fixed for comparability)
- `0.01`: Epsilon to prevent division by zero

**Proration Rules** (Validated):
```typescript
// Mid-month hire: Person joins 2025-09-15
const activeDays = getDaysInPeriod(person.start_date, period_month);
const totalDays = getDaysInMonth(period_month);
const prorated_ctc = person.ctc_monthly * (activeDays / totalDays);

// Allow Finance override with audit trail
if (manual_override) {
  AuditLog.create({
    entity: "Person",
    entity_id: person.id,
    action: "ctc_proration_override",
    before_json: { prorated_ctc },
    after_json: { manual_ctc }
  });
}
```

### 2.2 Direct Cost Calculation

**Formula**:
```typescript
allocated_people_cost = Σ (effective_hourly_cost[person] * hours_billable[person, project])
direct_cost = allocated_people_cost + Σ(ProjectCost.amount)
```

**Edge Cases**:
- Zero billable hours: `allocated_people_cost = 0` (non-billable hours don't contribute to project cost)
- Multi-project allocation: Person's EHC is distributed proportionally by `hours_billable`
- No allocations for period: Project has zero people cost, only `ProjectCost` amounts

### 2.3 Earned Revenue (by Pricing Model)

#### T&M (Time & Materials)
```typescript
earned_rev = Σ (hours_by_role * rate_by_role)

// BillingPlan.rule_json example:
{
  "model": "TnM",
  "roles": {
    "Analyst": { "rate_per_hour": 1200 },
    "Engineer": { "rate_per_hour": 1800 },
    "Manager": { "rate_per_hour": 2500 }
  },
  "currency": "INR"
}
```

#### Retainer
```typescript
// Pro-rate by active days in period
const activeDays = getProjectActiveDays(project, period_month);
const totalDays = getDaysInMonth(period_month);
earned_rev = monthly_retainer * (activeDays / totalDays);
```

#### Milestone
```typescript
// PM inputs progress % for the period
earned_rev = milestone_amount * (progress_pct_for_period / 100);

// BillingPlan.rule_json example:
{
  "model": "Milestone",
  "milestones": [
    { "name": "Design", "amount": 500000, "due_date": "2025-09-30" },
    { "name": "Development", "amount": 1500000, "due_date": "2025-11-30" }
  ],
  "currency": "INR"
}
```

### 2.4 At-Risk WIP Calculation (Validated)

**Scope**: Since PO `valid_from` (not project start, not fiscal year)

**Multi-PO Handling**:
```typescript
// Get active POs only (valid_to ≥ today)
const activePOs = project.purchase_orders.filter(po =>
  po.status === 'active' && po.valid_to >= today
);

// Compute cumulative earned since each PO's valid_from
const earned_cumulative_per_po = activePOs.map(po => ({
  po_id: po.id,
  earned_since_valid_from: sumEarnedRevenue(project, po.valid_from, today),
  po_amount: po.amount_total
}));

// Flag at-risk if earned > sum of all active POs
const total_active_po_amount = sum(activePOs.map(po => po.amount_total));
const total_earned_cumulative = sum(earned_cumulative_per_po.map(x => x.earned_since_valid_from));

const at_risk_wip = Math.max(0, total_earned_cumulative - total_active_po_amount);
```

**Storage** (Validated):
- **Real-time**: Compute on-the-fly for dashboards (always fresh)
- **Freeze**: Store in `AccrualLine.at_risk_wip` (immutable historical record)

**UI Indicators**:
- Show per-PO utilization: `earned_since_valid_from / po_amount_total`
- Red badge if `at_risk_wip > 0`

### 2.5 Gross Margin

```typescript
gross_amt = earned_rev - direct_cost
gross_pct = gross_amt / earned_rev // Handle zero revenue case
```

### 2.6 Overhead Allocation (Validated)

**Policy Methods**:

#### per_head
```typescript
overhead_alloc = pool_total * (billable_count_on_project / total_billable_count)
```

#### rev_pct
```typescript
overhead_alloc = pool_total * (project_earned_rev / total_earned_rev_all_projects)
```

#### direct_cost_pct
```typescript
overhead_alloc = pool_total * (project_direct_cost / total_direct_cost_all_projects)
```

#### hybrid (Validated: Must sum to 1.0)
```typescript
// OverheadPolicy.params_json:
{
  "weights": { "per_head": 0.5, "rev_pct": 0.5 },
  "include_per_head_overhead_in_ehc": true
}

// Validation:
const weightSum = Object.values(params_json.weights).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.001) {
  throw new Error("Overhead weights must sum to 1.0");
}

// Calculation:
overhead_alloc =
  (pool_total * weights.per_head * billable_ratio) +
  (pool_total * weights.rev_pct * revenue_ratio) +
  (pool_total * (weights.direct_cost_pct || 0) * cost_ratio);
```

**Edge Cases**:
- Zero total revenue across all projects: Fallback to `per_head` method
- Zero billable headcount: Overhead allocation = 0 (flag for Finance review)

### 2.7 Net Margin

```typescript
net_amt = gross_amt - overhead_alloc
net_pct = net_amt / earned_rev
```

### 2.8 Accruals (Unbilled/Deferred)

```typescript
// Unbilled: Work done but not invoiced
unbilled_rev = earned_rev - invoiced_rev_for_period

// Deferred: Invoiced in advance, not yet earned
deferred_rev = Math.max(0, invoiced_in_advance - earned_for_period)
```

**Journal Entry Generation** (CSV):

**Unbilled Revenue**:
```csv
Date,AccountDr,AccountCr,Amount,Project,Description
2025-09-30,Unbilled Accounts Receivable,Revenue,1700000,PRJ-123,Unbilled accrual Sep-2025
```

**Deferred Revenue**:
```csv
Date,AccountDr,AccountCr,Amount,Project,Description
2025-09-30,Revenue,Deferred Revenue,500000,PRJ-456,Deferred accrual Sep-2025
```

**Auto-Reversals** (Day 1 next month):
```csv
Date,AccountDr,AccountCr,Amount,Project,Description
2025-10-01,Revenue,Unbilled Accounts Receivable,1700000,PRJ-123,Reversal of Sep-2025 unbilled
2025-10-01,Deferred Revenue,Revenue,500000,PRJ-456,Reversal of Sep-2025 deferred
```

---

## 3. Month-End Close Workflow (Freeze/Unfreeze - Option C)

### 3.1 Freeze Process

**Pre-Freeze Validation**:
```typescript
// Check all prerequisites
const validation = {
  allocations_complete: allPMsHaveSubmitted(period_month),
  overhead_policy_set: overheadPolicyExists(period_month),
  overhead_pool_set: overheadPoolExists(period_month),
  po_reconciliation: noPOAnomalies(period_month)
};

if (!Object.values(validation).every(v => v)) {
  throw new Error("Cannot freeze: Prerequisites not met");
}
```

**Freeze Execution**:
```typescript
async function freezePeriod(period_month: Date, user_id: string) {
  // 1. Compute all accrual lines
  const accrualLines = await computeAccrualLines(period_month);

  // 2. Create snapshot
  const snapshot = await db.accrualSnapshot.create({
    data: {
      period_month,
      status: 'frozen',
      frozen_at: new Date(),
      frozen_by: user_id,
      version: 1,
      accrual_lines: {
        create: accrualLines
      }
    }
  });

  // 3. Generate journal CSVs
  const journals = await generateJournalExports(snapshot.id);

  // 4. Lock period for edits (UI + API enforcement)
  await lockPeriodEdits(period_month);

  // 5. Audit log
  await db.auditLog.create({
    data: {
      actor_id: user_id,
      entity: 'AccrualSnapshot',
      entity_id: snapshot.id,
      action: 'freeze',
      after_json: { period_month, version: 1 }
    }
  });

  return snapshot;
}
```

### 3.2 Unfreeze Process (Option C: Versioned Snapshots)

**Unfreeze Strategy**:
1. Keep old snapshot (status = frozen, version = N)
2. Create new snapshot (status = open, version = N+1)
3. Link via `superseded_by` relationship
4. Historical reports use version N, new edits use version N+1

**Implementation**:
```typescript
async function unfreezePeriod(period_month: Date, user_id: string) {
  const currentSnapshot = await db.accrualSnapshot.findUnique({
    where: { period_month },
    include: { accrual_lines: true }
  });

  if (currentSnapshot.status !== 'frozen') {
    throw new Error("Cannot unfreeze: Snapshot not frozen");
  }

  // Create new version
  const newSnapshot = await db.accrualSnapshot.create({
    data: {
      period_month,
      status: 'open',
      version: currentSnapshot.version + 1,
      accrual_lines: {
        create: currentSnapshot.accrual_lines.map(line => ({
          project_id: line.project_id,
          earned_rev: line.earned_rev,
          // ... copy all fields for editing
        }))
      }
    }
  });

  // Link versions
  await db.accrualSnapshot.update({
    where: { id: currentSnapshot.id },
    data: { superseded_by: newSnapshot.id }
  });

  // Unlock edits
  await unlockPeriodEdits(period_month);

  // Audit
  await db.auditLog.create({
    data: {
      actor_id: user_id,
      entity: 'AccrualSnapshot',
      entity_id: currentSnapshot.id,
      action: 'unfreeze',
      after_json: {
        old_version: currentSnapshot.version,
        new_version: newSnapshot.version,
        new_snapshot_id: newSnapshot.id
      }
    }
  });

  return newSnapshot;
}
```

**BI Impact**:
- Power BI queries frozen snapshots by default: `WHERE status = 'frozen' AND superseded_by IS NULL`
- Historical comparisons remain stable (version 1 data never changes)
- UI shows "Reopened (Version 2)" badge for transparency

---

## 4. Zoho Books Integration (Option C: App-Managed POs)

### 4.1 Architecture

**Scope**:
- **Pull**: Contacts (Clients), Invoices (header + lines), Payments
- **Push**: Optional invoice drafts from earned revenue
- **POs**: Managed in MarginDesk; reference `po_number` in Zoho invoice custom fields only

**Authentication**:
```typescript
// OAuth 2.0 flow with refresh token rotation
interface ZohoTokens {
  access_token: string;
  refresh_token: string;
  expires_at: Date;
}

async function getValidAccessToken(): Promise<string> {
  const tokens = await getStoredTokens();

  if (tokens.expires_at > new Date()) {
    return tokens.access_token;
  }

  // Refresh
  const newTokens = await refreshZohoTokens(tokens.refresh_token);
  await storeTokens(newTokens);

  return newTokens.access_token;
}
```

### 4.2 Sync Strategy

**Nightly Full Sync**:
```typescript
// BullMQ job: runs at 2 AM IST daily
async function zohoFullSync() {
  const jobs = [
    syncContacts(),    // Pull Zoho Contacts → MarginDesk Clients
    syncInvoices(),    // Pull Zoho Invoices → MarginDesk Invoices
    syncPayments(),    // Pull Zoho Payments → MarginDesk CashReceipts
  ];

  const results = await Promise.allSettled(jobs);

  // Log errors for monitoring
  results.forEach((result, idx) => {
    if (result.status === 'rejected') {
      logger.error(`Zoho sync job ${idx} failed`, result.reason);
    }
  });
}
```

**Intra-Day Delta Sync** (optional):
```typescript
// Pull only records updated since last sync
async function zohoDeltaSync() {
  const lastSyncTime = await getLastSyncTimestamp('zoho_invoices');

  const updatedInvoices = await zohoClient.invoices.list({
    last_modified_time: lastSyncTime.toISOString()
  });

  await upsertInvoices(updatedInvoices);
  await updateSyncTimestamp('zoho_invoices', new Date());
}
```

### 4.3 Idempotent Upserts

```typescript
async function upsertInvoice(zohoInvoice: ZohoInvoice) {
  const checksum = computeChecksum(zohoInvoice); // SHA-256 of serialized data

  const existing = await db.invoice.findUnique({
    where: { zoho_invoice_id: zohoInvoice.invoice_id }
  });

  if (existing?.sync_checksum === checksum) {
    return; // No changes, skip update
  }

  await db.invoice.upsert({
    where: { zoho_invoice_id: zohoInvoice.invoice_id },
    update: {
      amount: zohoInvoice.total,
      status: mapZohoStatus(zohoInvoice.status),
      issued_on: zohoInvoice.date,
      due_on: zohoInvoice.due_date,
      sync_checksum: checksum,
      updated_at: new Date()
    },
    create: {
      zoho_invoice_id: zohoInvoice.invoice_id,
      project_id: extractProjectId(zohoInvoice), // From custom field or line items
      period_month: parsePeriodMonth(zohoInvoice.date),
      amount: zohoInvoice.total,
      issued_on: zohoInvoice.date,
      due_on: zohoInvoice.due_date,
      status: mapZohoStatus(zohoInvoice.status),
      sync_checksum: checksum
    }
  });
}
```

### 4.4 Webhook Handling (Optional)

```typescript
// Zoho Books sends webhooks for invoice status changes
app.post('/api/webhooks/zoho', async (req, res) => {
  const signature = req.headers['x-zoho-signature'];

  if (!verifyZohoSignature(req.body, signature)) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;

  if (event.event_type === 'invoice.status_changed') {
    await upsertInvoice(event.data);
  }

  res.status(200).send('OK');
});
```

### 4.5 PO Reference in Zoho

Since POs are managed in MarginDesk, add `po_number` as custom field on Zoho invoices:

**Zoho Custom Field Setup**:
1. Go to Zoho Books → Settings → Invoices → Custom Fields
2. Add text field: `po_reference` (label: "PO Number")
3. When creating invoices in MarginDesk, include:
   ```typescript
   const zohoInvoice = {
     customer_id: client.zoho_contact_id,
     line_items: [...],
     custom_fields: [
       { label: 'PO Number', value: po.po_number }
     ]
   };
   ```

---

## 5. API Route Structure & RBAC

### 5.1 Route Organization

```
/api
├── auth
│   ├── [...nextauth].ts          # NextAuth OAuth handlers
│   └── session.ts                 # Get current session
├── clients
│   ├── index.ts                   # GET /api/clients (list), POST (create)
│   └── [id].ts                    # GET/PUT/DELETE /api/clients/:id
├── projects
│   ├── index.ts                   # GET /api/projects (list with filters), POST
│   ├── [id].ts                    # GET/PUT/DELETE /api/projects/:id
│   └── [id]
│       ├── allocations.ts         # GET/POST /api/projects/:id/allocations
│       ├── costs.ts               # GET/POST /api/projects/:id/costs
│       ├── pos.ts                 # GET/POST /api/projects/:id/pos
│       └── margin.ts              # GET /api/projects/:id/margin (real-time calc)
├── people
│   ├── index.ts                   # GET /api/people, POST
│   └── [id].ts                    # GET/PUT/DELETE /api/people/:id
├── overheads
│   ├── pool.ts                    # GET/PUT /api/overheads/pool?period=2025-09
│   └── policy.ts                  # GET/PUT /api/overheads/policy?period=2025-09
├── accruals
│   ├── compute.ts                 # POST /api/accruals/compute (preview)
│   ├── freeze.ts                  # POST /api/accruals/freeze (lock period)
│   ├── unfreeze.ts                # POST /api/accruals/unfreeze (version bump)
│   └── export.ts                  # GET /api/accruals/export?snapshot_id=...
├── invoices
│   ├── index.ts                   # GET /api/invoices (list), POST
│   └── sync.ts                    # POST /api/invoices/sync (trigger Zoho sync)
├── docs
│   ├── index.ts                   # GET /api/docs (list), POST (upload)
│   ├── [id].ts                    # GET/PUT/DELETE /api/docs/:id
│   └── [id]
│       ├── download.ts            # GET /api/docs/:id/download (pre-signed URL)
│       └── approve.ts             # POST /api/docs/:id/approve
└── admin
    ├── audit-log.ts               # GET /api/admin/audit-log
    └── settings.ts                # GET/PUT /api/admin/settings
```

### 5.2 RBAC Middleware

```typescript
// middleware/rbac.ts

export enum Permission {
  // Clients & Projects
  VIEW_PROJECTS = 'view:projects',
  EDIT_PROJECTS = 'edit:projects',
  DELETE_PROJECTS = 'delete:projects',

  // Allocations & Costs
  VIEW_ALLOCATIONS = 'view:allocations',
  EDIT_ALLOCATIONS = 'edit:allocations',

  // Overheads
  VIEW_OVERHEADS = 'view:overheads',
  EDIT_OVERHEADS = 'edit:overheads',
  APPROVE_OVERHEADS = 'approve:overheads',

  // Accruals
  VIEW_ACCRUALS = 'view:accruals',
  FREEZE_ACCRUALS = 'freeze:accruals',
  UNFREEZE_ACCRUALS = 'unfreeze:accruals',

  // Documents
  VIEW_DOCS = 'view:docs',
  UPLOAD_DOCS = 'upload:docs',
  APPROVE_DOCS = 'approve:docs',
  VIEW_LEGAL_DOCS = 'view:legal_docs',

  // Admin
  VIEW_AUDIT_LOG = 'view:audit_log',
  MANAGE_SETTINGS = 'manage:settings'
}

const rolePermissions: Record<UserRole, Permission[]> = {
  owner: Object.values(Permission), // All permissions
  finance: [
    Permission.VIEW_PROJECTS,
    Permission.EDIT_PROJECTS,
    Permission.VIEW_ALLOCATIONS,
    Permission.VIEW_OVERHEADS,
    Permission.EDIT_OVERHEADS,
    Permission.APPROVE_OVERHEADS,
    Permission.VIEW_ACCRUALS,
    Permission.FREEZE_ACCRUALS,
    Permission.UNFREEZE_ACCRUALS,
    Permission.VIEW_DOCS,
    Permission.UPLOAD_DOCS,
    Permission.VIEW_LEGAL_DOCS,
    Permission.VIEW_AUDIT_LOG
  ],
  pm: [
    Permission.VIEW_PROJECTS,
    Permission.EDIT_PROJECTS,
    Permission.VIEW_ALLOCATIONS,
    Permission.EDIT_ALLOCATIONS,
    Permission.VIEW_OVERHEADS,
    Permission.VIEW_ACCRUALS,
    Permission.VIEW_DOCS,
    Permission.UPLOAD_DOCS
  ],
  readonly: [
    Permission.VIEW_PROJECTS,
    Permission.VIEW_ALLOCATIONS,
    Permission.VIEW_OVERHEADS,
    Permission.VIEW_ACCRUALS,
    Permission.VIEW_DOCS
  ]
};

export function requirePermission(permission: Permission) {
  return async (req: NextApiRequest, res: NextApiResponse, next: NextFunction) => {
    const session = await getServerSession(req, res, authOptions);

    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email }
    });

    if (!rolePermissions[user.role].includes(permission)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.user = user;
    next();
  };
}

// Row-level security for projects (PM can only see assigned projects)
export async function getAccessibleProjects(user: User): Promise<string[]> {
  if (user.role === 'owner' || user.role === 'finance') {
    return 'all'; // Special marker for unrestricted access
  }

  if (user.role === 'pm') {
    // TODO: Implement PM-to-Project assignment table
    const assignments = await db.projectAssignment.findMany({
      where: { user_id: user.id },
      select: { project_id: true }
    });
    return assignments.map(a => a.project_id);
  }

  return []; // Readonly users see all but can't edit
}

// Usage in API route
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await requirePermission(Permission.EDIT_ALLOCATIONS)(req, res, async () => {
    const projectIds = await getAccessibleProjects(req.user);

    if (projectIds !== 'all' && !projectIds.includes(req.query.project_id as string)) {
      return res.status(403).json({ error: 'No access to this project' });
    }

    // Proceed with allocation edit
    const allocation = await db.allocation.update({...});
    res.json(allocation);
  });
}
```

---

## 6. Frontend Component Hierarchy

### 6.1 Page Structure

```
/app
├── (auth)
│   ├── login
│   │   └── page.tsx               # Login with NextAuth providers
│   └── layout.tsx                 # Auth layout (centered, no sidebar)
├── (dashboard)
│   ├── layout.tsx                 # Dashboard layout (sidebar, header)
│   ├── page.tsx                   # Main dashboard (KPIs)
│   ├── projects
│   │   ├── page.tsx               # Project list with filters
│   │   └── [id]
│   │       ├── page.tsx           # Project detail (tabs)
│   │       ├── allocations
│   │       │   └── page.tsx       # Allocation editor (grid)
│   │       ├── costs
│   │       │   └── page.tsx       # Project costs
│   │       ├── pos
│   │       │   └── page.tsx       # PO tracker
│   │       └── billing
│   │           └── page.tsx       # Billing plan config
│   ├── people
│   │   ├── page.tsx               # People list
│   │   └── [id]
│   │       └── page.tsx           # Person detail (utilization, allocations)
│   ├── overheads
│   │   └── page.tsx               # Overhead pool + policy (split view)
│   ├── close
│   │   └── page.tsx               # Month-end close workflow
│   ├── invoices
│   │   ├── page.tsx               # Invoice list + sync status
│   │   └── [id]
│   │       └── page.tsx           # Invoice detail
│   ├── docs
│   │   ├── page.tsx               # Document repository (filterable table)
│   │   └── [id]
│   │       └── page.tsx           # Document viewer + version history
│   └── settings
│       ├── page.tsx               # Settings tabs (Zoho, Roles, Rates)
│       ├── zoho
│       │   └── page.tsx           # Zoho OAuth connect + sync logs
│       └── users
│           └── page.tsx           # User management (RBAC)
└── api
    └── [...routes]                # API routes (see Section 5.1)
```

### 6.2 Key Components

#### Dashboard KPIs
```typescript
// components/dashboard/kpi-card.tsx
interface KPICardProps {
  title: string;
  value: number;
  format: 'currency' | 'percentage' | 'number';
  trend?: { value: number; direction: 'up' | 'down' };
  icon: React.ComponentType;
}

// app/(dashboard)/page.tsx
export default function DashboardPage() {
  const { data: kpis } = useSWR('/api/dashboard/kpis');

  return (
    <div className="grid grid-cols-4 gap-4">
      <KPICard
        title="Earned Revenue (MTD)"
        value={kpis.earned_rev}
        format="currency"
        icon={TrendingUp}
      />
      <KPICard
        title="Unbilled Revenue"
        value={kpis.unbilled_rev}
        format="currency"
        trend={{ value: kpis.unbilled_trend, direction: 'up' }}
        icon={FileText}
      />
      <KPICard
        title="Gross Margin %"
        value={kpis.gross_pct}
        format="percentage"
        icon={PieChart}
      />
      <KPICard
        title="At-Risk WIP"
        value={kpis.at_risk_wip}
        format="currency"
        icon={AlertTriangle}
        className={kpis.at_risk_wip > 0 ? 'border-red-500' : ''}
      />
    </div>
  );
}
```

#### Allocation Editor (Grid)
```typescript
// components/projects/allocation-editor.tsx
import { DataTable } from '@/components/ui/data-table';
import { useFieldArray, useForm } from 'react-hook-form';

interface AllocationRow {
  person_id: string;
  person_name: string;
  hours_billable: number;
  hours_nonbillable: number;
  pct_effort: number;
}

export function AllocationEditor({ project_id, period_month }: Props) {
  const { data: allocations } = useSWR(`/api/projects/${project_id}/allocations?period=${period_month}`);

  const { control, handleSubmit } = useForm<{ allocations: AllocationRow[] }>({
    defaultValues: { allocations }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'allocations' });

  const onSubmit = async (data) => {
    await fetch(`/api/projects/${project_id}/allocations`, {
      method: 'POST',
      body: JSON.stringify({ period_month, allocations: data.allocations })
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DataTable
        columns={[
          { header: 'Person', accessorKey: 'person_name' },
          { header: 'Billable Hours', accessorKey: 'hours_billable', cell: EditableCell },
          { header: 'Non-Billable Hours', accessorKey: 'hours_nonbillable', cell: EditableCell },
          { header: '% Effort', accessorKey: 'pct_effort', cell: PercentageCell }
        ]}
        data={fields}
      />
      <Button type="submit">Save Allocations</Button>
    </form>
  );
}
```

#### Month-End Close Workflow
```typescript
// app/(dashboard)/close/page.tsx
export default function ClosePage() {
  const [selectedPeriod, setSelectedPeriod] = useState<Date>();
  const { data: preview } = useSWR(
    selectedPeriod ? `/api/accruals/compute?period=${selectedPeriod}` : null
  );

  const handleFreeze = async () => {
    const confirmed = await confirmDialog({
      title: 'Freeze Period',
      message: `This will lock ${format(selectedPeriod, 'MMM yyyy')} for editing. Continue?`,
      confirmText: 'Freeze'
    });

    if (confirmed) {
      await fetch('/api/accruals/freeze', {
        method: 'POST',
        body: JSON.stringify({ period_month: selectedPeriod })
      });

      toast.success('Period frozen successfully');
    }
  };

  return (
    <div>
      <MonthPicker value={selectedPeriod} onChange={setSelectedPeriod} />

      {preview && (
        <div className="space-y-4">
          <PreviewTable data={preview.accrual_lines} />

          <div className="flex gap-2">
            <Button onClick={handleFreeze} variant="destructive">
              Freeze Period
            </Button>
            <Button onClick={downloadJournals} variant="outline">
              Download Journal CSVs
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 7. BullMQ Job Queue Design

### 7.1 Queue Configuration

```typescript
// lib/queue.ts
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);

export const zohoSyncQueue = new Queue('zoho-sync', { connection });
export const accrualComputeQueue = new Queue('accrual-compute', { connection });
export const journalExportQueue = new Queue('journal-export', { connection });

// Schedule nightly sync at 2 AM IST
zohoSyncQueue.add(
  'full-sync',
  {},
  {
    repeat: {
      pattern: '0 2 * * *', // Cron: 2 AM daily
      tz: 'Asia/Kolkata'
    }
  }
);
```

### 7.2 Job Processors

```typescript
// workers/zoho-sync.worker.ts
import { Worker } from 'bullmq';

const zohoSyncWorker = new Worker(
  'zoho-sync',
  async (job) => {
    const { type, params } = job.data;

    try {
      switch (type) {
        case 'full-sync':
          await syncContacts();
          await syncInvoices();
          await syncPayments();
          break;

        case 'delta-sync':
          await syncInvoicesDelta(params.since);
          break;
      }

      return { success: true, synced_at: new Date() };
    } catch (error) {
      logger.error('Zoho sync failed', error);
      throw error; // Will trigger retry
    }
  },
  {
    connection,
    concurrency: 1, // Sequential processing to avoid rate limits
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000 // 5s, 25s, 125s
    }
  }
);

zohoSyncWorker.on('failed', (job, error) => {
  // Send alert to Finance team
  sendSlackNotification(`Zoho sync failed: ${error.message}`);
});
```

### 7.3 Idempotency & Checkpointing

```typescript
// Checkpoint pattern for large syncs
async function syncInvoices() {
  const checkpoint = await getCheckpoint('zoho_invoices_full_sync');

  let page = checkpoint?.page || 1;
  let hasMore = true;

  while (hasMore) {
    const response = await zohoClient.invoices.list({ page, per_page: 200 });

    for (const invoice of response.invoices) {
      await upsertInvoice(invoice);
    }

    // Save checkpoint
    await saveCheckpoint('zoho_invoices_full_sync', { page });

    hasMore = response.page_context.has_more_page;
    page++;
  }

  // Clear checkpoint on success
  await clearCheckpoint('zoho_invoices_full_sync');
}
```

---

## 8. Security & Compliance

### 8.1 Data Protection

**Encryption at Rest**:
- Postgres: Enable `pgcrypto` extension for column-level encryption of sensitive fields (PAN, GSTIN)
- S3 DocSpace: Server-side encryption (SSE-S3 or SSE-KMS)

**Encryption in Transit**:
- Enforce HTTPS for all API endpoints
- TLS 1.3 for Postgres connections

**Secrets Management**:
```typescript
// Use AWS Secrets Manager or Vault
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

async function getZohoCredentials() {
  const client = new SecretsManager({ region: 'ap-south-1' });
  const secret = await client.getSecretValue({ SecretId: 'prod/zoho/oauth' });

  return JSON.parse(secret.SecretString);
}
```

### 8.2 Audit Trail

**Every Write Operation**:
```typescript
// Prisma middleware for automatic audit logging
prisma.$use(async (params, next) => {
  const auditableModels = ['Allocation', 'OverheadPolicy', 'AccrualSnapshot', 'DocSpace'];

  if (auditableModels.includes(params.model) && ['create', 'update', 'delete'].includes(params.action)) {
    const before = params.action !== 'create'
      ? await prisma[params.model].findUnique({ where: params.args.where })
      : null;

    const result = await next(params);

    await prisma.auditLog.create({
      data: {
        actor_id: getCurrentUserId(), // From request context
        entity: params.model,
        entity_id: result.id,
        action: params.action,
        before_json: before,
        after_json: result,
        at: new Date()
      }
    });

    return result;
  }

  return next(params);
});
```

### 8.3 Access Controls

**DocSpace Access Tiers**:
```typescript
async function canAccessDocument(user: User, doc: DocSpace): Promise<boolean> {
  switch (doc.access_tier) {
    case 'public':
      return true;

    case 'restricted':
      return user.role !== 'readonly';

    case 'legal':
      return ['owner', 'finance'].includes(user.role);

    default:
      return false;
  }
}

// Pre-signed URLs with expiration
async function getDocumentDownloadURL(docId: string): Promise<string> {
  const doc = await db.docSpace.findUnique({ where: { id: docId } });

  return s3.getSignedUrl('getObject', {
    Bucket: process.env.S3_BUCKET,
    Key: doc.file_url,
    Expires: 300 // 5 minutes
  });
}
```

### 8.4 Compliance (GDPR-Ready)

**Data Retention**:
```typescript
// Scheduled job to handle retention policies
async function enforceRetentionPolicies() {
  const expiredDocs = await db.docSpace.findMany({
    where: {
      retention_till: { lte: new Date() },
      status: { not: 'obsolete' }
    }
  });

  for (const doc of expiredDocs) {
    // Archive to cold storage or delete
    await archiveDocument(doc);

    await db.docSpace.update({
      where: { id: doc.id },
      data: { status: 'obsolete' }
    });
  }
}
```

**Right to Deletion**:
```typescript
async function deleteClientData(clientId: string) {
  // Soft delete: anonymize PII, keep financial records for compliance
  await db.client.update({
    where: { id: clientId },
    data: {
      name: `[DELETED-${clientId}]`,
      gstin: null,
      pan: null,
      tags: []
    }
  });

  // Audit the deletion request
  await db.auditLog.create({
    data: {
      actor_id: 'system',
      entity: 'Client',
      entity_id: clientId,
      action: 'gdpr_delete',
      at: new Date()
    }
  });
}
```

---

## 9. Deployment & Operations

### 9.1 Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind, shadcn/ui | UI framework |
| **Backend** | Next.js API Routes, tRPC (optional) | API layer |
| **Database** | PostgreSQL (Supabase/RDS) | Primary data store |
| **ORM** | Prisma | Type-safe DB access |
| **Validation** | Zod | Schema validation |
| **Auth** | NextAuth (Microsoft/Google OAuth) | Authentication |
| **Jobs** | BullMQ + Redis | Background processing |
| **Storage** | S3-compatible (AWS S3/Supabase Storage) | Document files |
| **Monitoring** | Sentry (errors), Datadog (APM) | Observability |
| **CI/CD** | GitHub Actions | Deployment automation |

### 9.2 Environment Setup

```bash
# .env.example

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/margindesk"

# Auth
NEXTAUTH_URL="https://margindesk.company.com"
NEXTAUTH_SECRET="your-secret-key"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Zoho Books
ZOHO_CLIENT_ID="..."
ZOHO_CLIENT_SECRET="..."
ZOHO_REDIRECT_URI="https://margindesk.company.com/api/auth/zoho/callback"

# Storage
S3_BUCKET="margindesk-docs"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_REGION="ap-south-1"

# Redis (BullMQ)
REDIS_URL="redis://localhost:6379"

# Monitoring
SENTRY_DSN="..."
DATADOG_API_KEY="..."

# Feature Flags
ENABLE_ZOHO_WEBHOOK=true
ENABLE_BI_READ_REPLICA=false
```

### 9.3 Migration Strategy

**Prisma Migrations**:
```bash
# Development
pnpm prisma migrate dev --name add_accrual_snapshot_versioning

# Production (run in CI/CD)
pnpm prisma migrate deploy
```

**Seed Data**:
```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create default admin user
  await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      name: 'Admin User',
      role: 'owner'
    }
  });

  // Seed default overhead policy
  await prisma.overheadPolicy.upsert({
    where: { period_month: new Date('2025-09-01') },
    update: {},
    create: {
      period_month: new Date('2025-09-01'),
      method: 'per_head',
      params_json: { include_per_head_overhead_in_ehc: false }
    }
  });
}

main();
```

### 9.4 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm prisma generate
      - run: pnpm test
      - run: pnpm build

  migrate:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pnpm prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  deploy:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: vercel/actions/deploy@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          production: true
```

---

## 10. Acceptance Criteria Validation

### 10.1 Test Scenarios

#### Accrual Math Parity
```typescript
// tests/calculations/accruals.test.ts
describe('Accrual Calculations', () => {
  it('should reconcile unbilled revenue to penny precision', async () => {
    const project = await createTestProject({
      earned_rev: 4500000,
      invoiced_rev: 2800000
    });

    const accrualLine = await computeAccrualLine(project);

    expect(accrualLine.unbilled_rev).toBe(1700000); // 4500000 - 2800000
    expect(accrualLine.earned_rev - accrualLine.invoiced_rev).toBe(accrualLine.unbilled_rev);
  });

  it('should handle deferred revenue for prepaid invoices', async () => {
    const project = await createTestProject({
      earned_rev: 1000000,
      invoiced_in_advance: 1500000
    });

    const accrualLine = await computeAccrualLine(project);

    expect(accrualLine.deferred_rev).toBe(500000); // 1500000 - 1000000
  });
});
```

#### Policy Switch Re-computation
```typescript
it('should recompute overhead allocation when policy changes', async () => {
  const period = new Date('2025-09-01');

  // Initial: per_head policy
  await createOverheadPolicy({
    period_month: period,
    method: 'per_head',
    params_json: {}
  });

  const snapshot1 = await computeAccrualSnapshot(period);
  const project1 = snapshot1.accrual_lines.find(l => l.project_id === 'prj_123');

  // Change to rev_pct policy
  await updateOverheadPolicy(period, {
    method: 'rev_pct',
    params_json: {}
  });

  const snapshot2 = await computeAccrualSnapshot(period);
  const project2 = snapshot2.accrual_lines.find(l => l.project_id === 'prj_123');

  // Overhead allocation should differ
  expect(project2.overhead_alloc).not.toBe(project1.overhead_alloc);

  // Net margin should update accordingly
  expect(project2.net_amt).toBe(project2.gross_amt - project2.overhead_alloc);
});
```

#### PO Guardrail
```typescript
it('should flag at-risk WIP when earned exceeds active PO total', async () => {
  const project = await createTestProject();

  await createPO({
    project_id: project.id,
    amount_total: 3000000,
    valid_from: new Date('2025-01-01'),
    valid_to: new Date('2025-12-31'),
    status: 'active'
  });

  const accrualLine = await computeAccrualLine(project, {
    earned_cumulative: 3500000
  });

  expect(accrualLine.at_risk_wip).toBe(500000); // 3500000 - 3000000
});
```

#### Zoho Sync Idempotency
```typescript
it('should not duplicate invoices on repeated sync', async () => {
  const zohoInvoice = {
    invoice_id: 'z_inv_123',
    total: 280000,
    status: 'sent'
  };

  await upsertInvoice(zohoInvoice);
  const count1 = await db.invoice.count({ where: { zoho_invoice_id: 'z_inv_123' } });

  await upsertInvoice(zohoInvoice); // Sync again
  const count2 = await db.invoice.count({ where: { zoho_invoice_id: 'z_inv_123' } });

  expect(count1).toBe(1);
  expect(count2).toBe(1); // Still 1, no duplicate
});
```

#### Document Integrity
```typescript
it('should verify immutable hash on document download', async () => {
  const doc = await createDocSpace({
    title: 'MSA-Client-A',
    file_url: 's3://bucket/msa.pdf',
    sha256: 'abc123...'
  });

  const downloadedFile = await downloadDocument(doc.id);
  const computedHash = sha256(downloadedFile);

  expect(computedHash).toBe(doc.sha256);
});

it('should enforce version incrementing', async () => {
  const doc1 = await createDocSpace({
    title: 'Policy-v1',
    version: '1.0'
  });

  const doc2 = await createDocSpace({
    title: 'Policy-v2',
    version: '1.1',
    // Link to previous version
  });

  expect(parseFloat(doc2.version)).toBeGreaterThan(parseFloat(doc1.version));
});
```

#### Audit Trail
```typescript
it('should log all freeze operations', async () => {
  const period = new Date('2025-09-01');

  await freezePeriod(period, 'user_123');

  const auditLogs = await db.auditLog.findMany({
    where: {
      entity: 'AccrualSnapshot',
      action: 'freeze'
    }
  });

  expect(auditLogs.length).toBeGreaterThan(0);
  expect(auditLogs[0].actor_id).toBe('user_123');
});
```

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [x] Prisma schema setup
- [ ] NextAuth configuration
- [ ] RBAC middleware
- [ ] API route scaffolding
- [ ] Basic UI layout (dashboard shell)

### Phase 2: Core Calculations (Weeks 3-4)
- [ ] Person & Allocation models
- [ ] EHC calculation engine
- [ ] Overhead pool & policy
- [ ] Earned revenue calculators (T&M, Retainer, Milestone)
- [ ] Gross/Net margin computation
- [ ] Unit tests for all formulas

### Phase 3: Accruals & Freeze (Week 5)
- [ ] AccrualSnapshot versioning (Option C)
- [ ] Freeze/Unfreeze workflows
- [ ] Journal export CSV generation
- [ ] At-Risk WIP computation
- [ ] Month-end close UI

### Phase 4: Zoho Integration (Week 6)
- [ ] OAuth flow implementation
- [ ] Contact/Client sync
- [ ] Invoice sync (header + lines)
- [ ] Payment/CashReceipt sync
- [ ] Webhook handlers
- [ ] BullMQ job queues

### Phase 5: Documents & Legal (Week 7)
- [ ] DocSpace upload/versioning
- [ ] S3 integration with encryption
- [ ] SHA-256 integrity verification
- [ ] Access tier enforcement
- [ ] Approval workflow (simplified for MVP)

### Phase 6: UI Polish & Testing (Week 8)
- [ ] Dashboard KPIs with real-time data
- [ ] Project detail pages (allocations, costs, POs)
- [ ] Responsive design refinement
- [ ] E2E tests (Playwright)
- [ ] Performance optimization

### Phase 7: Deployment & Monitoring (Week 9)
- [ ] Production database migration
- [ ] CI/CD pipeline setup
- [ ] Sentry error tracking
- [ ] Datadog APM integration
- [ ] Backup & disaster recovery testing

---

## 12. Open Questions for Iteration

1. **Power BI Integration** (deferred): Prefer real-time read replica or nightly ETL?
2. **E-Signature Provider**: Zoho Sign, Adobe Sign, or agnostic webhook approach?
3. **Currency Conversion**: Multi-currency project handling (use Zoho rates or manual input)?
4. **PM-to-Project Assignment**: Should this be a formal table or inferred from allocations?
5. **Approval Workflows** (deferred): If needed later, sequential or parallel approval chains?

---

## Appendix A: Sample Data Contracts

### Overhead Policy (Hybrid)
```json
{
  "weights": { "per_head": 0.5, "rev_pct": 0.5 },
  "include_per_head_overhead_in_ehc": true
}
```

### Billing Plan (T&M)
```json
{
  "model": "TnM",
  "roles": {
    "Analyst": { "rate_per_hour": 1200 },
    "Engineer": { "rate_per_hour": 1800 },
    "Manager": { "rate_per_hour": 2500 }
  },
  "currency": "INR"
}
```

### Accrual Line (Computed)
```json
{
  "period_month": "2025-09-01T00:00:00Z",
  "project_id": "prj_123",
  "earned_rev": 4500000,
  "invoiced_rev": 2800000,
  "unbilled_rev": 1700000,
  "deferred_rev": 0,
  "direct_cost": 3100000,
  "overhead_alloc": 450000,
  "gross_amt": 1400000,
  "gross_pct": 0.3111,
  "net_amt": 950000,
  "net_pct": 0.2111,
  "at_risk_wip": 200000
}
```

### Journal CSV (Unbilled)
```csv
Date,AccountDr,AccountCr,Amount,Project,Description
2025-09-30,Unbilled Accounts Receivable,Revenue,1700000,PRJ-123,Unbilled accrual Sep-2025
```

---

**End of Specification**

This document is ready for implementation. All architectural decisions have been validated, edge cases documented, and acceptance criteria defined. Proceed with Phase 1 foundation setup.
