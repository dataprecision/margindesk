# Financial Pods System - Design Document

## Overview

Financial pods are organizational units for financial tracking and billing responsibility, separate from the reporting hierarchy. A pod has one leader and multiple members, and can work on multiple projects over time.

## Key Features

### 1. Pod Structure
- **One Leader**: Each pod has exactly one leader (can be changed over time)
- **Multiple Members**: People join pods with start/end dates
- **Time-Based**: Everything is temporal - memberships and project assignments have validity periods
- **Project-Based**: Pods are mapped to projects (not clients) with start/end dates
- **Flexible Allocation**: Members can be split across multiple pods (allocation percentage)

### 2. Differences from Reporting Hierarchy

| Aspect | Reporting Manager | Financial Pod |
|--------|------------------|---------------|
| **Purpose** | Organizational hierarchy, HR, performance | Financial tracking, billing, cost allocation |
| **Structure** | Tree (one manager per person) | Flexible (person can be in multiple pods) |
| **Changes** | Infrequent | Can change with project lifecycles |
| **Temporal** | Tracked in ManagerHistory | Built-in with start_date/end_date |

## Database Schema

### FinancialPod
Main pod entity storing pod metadata.

```prisma
model FinancialPod {
  id          String      @id @default(cuid())
  name        String      // e.g., "Cloud Infrastructure Pod"
  description String?
  leader_id   String      // Pod leader
  status      PodStatus   @default(active)  // active|inactive|archived
  created_at  DateTime    @default(now())
  updated_at  DateTime    @updatedAt

  // Relations
  leader      Person              @relation("PodLeader", fields: [leader_id])
  members     PodMembership[]
  projects    PodProjectMapping[]
}
```

### PodMembership
Time-based pod membership with allocation support.

```prisma
model PodMembership {
  id             String    @id @default(cuid())
  pod_id         String
  person_id      String
  start_date     DateTime  // When person joined
  end_date       DateTime? // When person left (null = active)
  allocation_pct Int       @default(100)  // 0-100% allocation
  created_at     DateTime  @default(now())
  updated_at     DateTime  @updatedAt

  // Relations
  pod            FinancialPod @relation(fields: [pod_id])
  person         Person       @relation(fields: [person_id])

  // Constraints
  @@unique([pod_id, person_id, start_date])
}
```

**Key Points:**
- `end_date = null` means currently active member
- `allocation_pct` allows split allocation (e.g., 70% Pod A, 30% Pod B)
- Multiple memberships for same person/pod allowed (different start dates)

### PodProjectMapping
Time-based project assignment to pods.

```prisma
model PodProjectMapping {
  id         String    @id @default(cuid())
  pod_id     String
  project_id String
  start_date DateTime  // When pod started on project
  end_date   DateTime? // When pod finished (null = active)
  created_at DateTime  @default(now())
  updated_at DateTime  @updatedAt

  // Relations
  pod        FinancialPod @relation(fields: [pod_id])
  project    Project      @relation(fields: [project_id])

  // Constraints
  @@unique([pod_id, project_id, start_date])
}
```

**Key Points:**
- Pod can work on multiple projects simultaneously
- Projects can be assigned/removed over time with date tracking
- `end_date = null` means pod is currently working on the project

## Use Cases

### 1. Create a New Pod
```typescript
// POST /api/pods
{
  name: "Cloud Infrastructure Pod",
  description: "DevOps and cloud infrastructure team",
  leader_id: "alice_id",
  status: "active"
}
```

### 2. Add Member to Pod
```typescript
// POST /api/pods/[podId]/members
{
  person_id: "bob_id",
  start_date: "2025-01-01",
  allocation_pct: 100  // Full-time on this pod
}
```

### 3. Split Person Across Multiple Pods
```typescript
// Person works 70% on Pod A, 30% on Pod B
// POST /api/pods/podA_id/members
{ person_id: "carol_id", start_date: "2025-01-15", allocation_pct: 70 }

// POST /api/pods/podB_id/members
{ person_id: "carol_id", start_date: "2025-01-15", allocation_pct: 30 }
```

### 4. Assign Project to Pod
```typescript
// POST /api/pods/[podId]/projects
{
  project_id: "project_xyz",
  start_date: "2025-02-01",
  end_date: null  // Currently active
}
```

### 5. Remove Member from Pod
```typescript
// DELETE /api/pods/[podId]/members/[personId]
// Sets end_date = now() on active membership
```

### 6. Query Current Pod Members
```sql
SELECT * FROM PodMembership
WHERE pod_id = ?
  AND end_date IS NULL  -- Active members only
```

### 7. Query Member's Pod History
```sql
SELECT * FROM PodMembership
WHERE person_id = ?
ORDER BY start_date DESC
```

### 8. Get Pod's Active Projects
```sql
SELECT * FROM PodProjectMapping
WHERE pod_id = ?
  AND end_date IS NULL  -- Active projects only
```

## API Endpoints

### Pod Management

#### GET /api/pods
List all pods with optional filters.

**Query Params:**
- `status`: Filter by status (active, inactive, archived)
- `leader_id`: Filter by leader
- `include_members`: Include member count
- `include_projects`: Include active project count

**Response:**
```json
{
  "pods": [
    {
      "id": "pod_123",
      "name": "Cloud Infrastructure Pod",
      "description": "...",
      "leader": {
        "id": "alice_id",
        "name": "Alice Smith"
      },
      "status": "active",
      "member_count": 8,
      "active_project_count": 3,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/pods
Create a new pod.

**Body:**
```json
{
  "name": "Pod Name",
  "description": "Optional description",
  "leader_id": "person_id",
  "status": "active"
}
```

#### PATCH /api/pods/[id]
Update pod details (name, description, leader, status).

#### DELETE /api/pods/[id]
Delete pod (only if no active members).

### Pod Membership

#### GET /api/pods/[id]/members
List pod members.

**Query Params:**
- `active`: Filter active members only (default: true)
- `date`: Get members active on specific date

**Response:**
```json
{
  "members": [
    {
      "id": "membership_123",
      "person": {
        "id": "bob_id",
        "name": "Bob Johnson",
        "employee_code": "EMP001"
      },
      "start_date": "2025-01-01",
      "end_date": null,
      "allocation_pct": 100
    }
  ]
}
```

#### POST /api/pods/[id]/members
Add member to pod.

**Body:**
```json
{
  "person_id": "person_id",
  "start_date": "2025-01-01",
  "allocation_pct": 100
}
```

**Validation:**
- Check if total allocation across all pods ≤ 100%
- Warn if person already in another pod

#### PATCH /api/pods/[id]/members/[membershipId]
Update membership (change allocation, dates).

#### DELETE /api/pods/[id]/members/[personId]
Remove person from pod (sets end_date = now).

### Pod Project Mapping

#### GET /api/pods/[id]/projects
List projects assigned to pod.

**Query Params:**
- `active`: Filter active projects only (default: true)
- `date`: Get projects active on specific date

#### POST /api/pods/[id]/projects
Assign project to pod.

**Body:**
```json
{
  "project_id": "project_id",
  "start_date": "2025-02-01",
  "end_date": null
}
```

#### PATCH /api/pods/[id]/projects/[mappingId]
Update project mapping dates.

#### DELETE /api/pods/[id]/projects/[projectId]
Unassign project from pod (sets end_date = now).

### Person Pod Info

#### GET /api/people/[id]/pods
Get person's pod memberships (current and historical).

**Query Params:**
- `active`: Filter active memberships only

**Response:**
```json
{
  "current_pods": [
    {
      "pod": {
        "id": "pod_123",
        "name": "Pod A"
      },
      "allocation_pct": 70,
      "start_date": "2025-01-01"
    }
  ],
  "historical_pods": [...]
}
```

## UI Pages

### 1. Pods List Page (`/pods`)

**Features:**
- List all pods with leader, member count, project count
- Filter by status (active/inactive/archived)
- Search by name
- Create new pod button
- Quick actions: View Details, Edit, Manage Members, Manage Projects

**Layout:**
```
Financial Pods                    [+ Create Pod] [Filter: Active ▼]

┌──────────────────────────────────────────────────┐
│ Cloud Infrastructure Pod                         │
│ Leader: Alice Smith | 8 Members | 3 Projects    │
│ [View] [Edit] [Members] [Projects]               │
└──────────────────────────────────────────────────┘
```

### 2. Pod Detail Page (`/pods/[id]`)

**Sections:**
1. **Pod Info**: Name, description, leader, status, created date
2. **Current Members**: Table with name, start date, allocation %, actions
3. **Historical Members**: Collapsed section with past members
4. **Current Projects**: Table with project name, client, start date, actions
5. **Historical Projects**: Collapsed section with past projects

**Actions:**
- Edit Pod
- Change Leader
- Add Member
- Add Project
- Archive Pod

### 3. Create/Edit Pod Modal

**Fields:**
- Pod Name (required)
- Description (optional, textarea)
- Leader (required, person selector)
- Status (active/inactive)

### 4. Add Member Modal

**Fields:**
- Person (required, searchable dropdown)
- Start Date (required, date picker, default: today)
- Allocation % (required, number 0-100, default: 100)
- End Date (optional, for planned departures)

**Validations:**
- Show warning if person's total allocation > 100%
- Show warning if person already in this pod

### 5. Add Project Modal

**Fields:**
- Project (required, searchable dropdown with client name)
- Start Date (required, default: today)
- End Date (optional)

### 6. Employee Page Enhancement (`/employees/[id]`)

Add "Pod Membership" section showing:
- Current pod(s) with allocation %
- Pod leaders
- Pod history timeline

## Reporting & Analytics

### Cost by Pod
Total salary cost per pod (allocation-weighted).

```sql
SELECT
  p.name as pod_name,
  SUM(ps.base_salary * (pm.allocation_pct / 100.0)) as total_cost
FROM FinancialPod p
JOIN PodMembership pm ON p.id = pm.pod_id
JOIN Person per ON pm.person_id = per.id
JOIN PersonSalary ps ON per.id = ps.person_id
WHERE pm.end_date IS NULL  -- Active members
  AND ps.month = '2025-01-01'  -- Specific month
GROUP BY p.id, p.name
```

### Revenue by Pod
Revenue from projects assigned to pod.

```sql
SELECT
  p.name as pod_name,
  SUM(i.amount) as total_revenue
FROM FinancialPod p
JOIN PodProjectMapping ppm ON p.id = ppm.pod_id
JOIN Project proj ON ppm.project_id = proj.id
JOIN Invoice i ON proj.id = i.project_id
WHERE ppm.end_date IS NULL  -- Active projects
  AND i.status = 'paid'
GROUP BY p.id, p.name
```

### Utilization by Pod
Billable hours per pod.

```sql
SELECT
  p.name as pod_name,
  SUM(te.hours_logged) as total_hours,
  SUM(te.hours_billable) as billable_hours,
  (SUM(te.hours_billable) / SUM(te.hours_logged)) * 100 as utilization_pct
FROM FinancialPod p
JOIN PodMembership pm ON p.id = pm.pod_id
JOIN TimesheetEntry te ON pm.person_id = te.person_id
WHERE pm.end_date IS NULL  -- Active members
  AND te.work_date BETWEEN '2025-01-01' AND '2025-01-31'
GROUP BY p.id, p.name
```

## Migration & Rollout

### Phase 1: Infrastructure (Complete)
- ✅ Database schema created
- ✅ Prisma models defined
- ✅ Relations established

### Phase 2: API (Next)
- Create pod CRUD endpoints
- Create membership management endpoints
- Create project mapping endpoints
- Add validation logic

### Phase 3: UI (Following)
- Build pods list page
- Build pod detail page
- Build modals for create/edit/add operations
- Add pod section to employee pages

### Phase 4: Reporting (Future)
- Add pod filters to existing reports
- Create pod-specific cost/revenue reports
- Add pod analytics dashboard

## Notes

- No data migration needed (new feature)
- Pods start empty, users gradually assign members and projects
- Reporting hierarchy (manager_id) remains unchanged
- Pod system is additive, doesn't replace anything

## Status

✅ **Schema Design**: Complete
✅ **Database Sync**: Complete
⏳ **API Endpoints**: Pending
⏳ **UI Components**: Pending
⏳ **Reporting Integration**: Pending

---

Last Updated: October 27, 2025
