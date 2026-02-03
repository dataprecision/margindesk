# Zoho People Integration Design

**Created**: 2025-10-23
**Status**: Design Phase

## Overview

Integration with Zoho People API to sync employee data into MarginDesk's `Person` table. **Zoho People is the primary and authoritative source** for all employee master data including email addresses, names, start/end dates, department, and job titles. Microsoft Graph sync becomes optional and can be used only for supplementary data like billable status detection.

## Integration Strategy

### Primary Source Approach
MarginDesk will use **Zoho People as the primary source** for all employee master data:

1. **Zoho People API** (Primary)
   - Source: HRIS/Zoho People employee records
   - Primary use: **All employee master data** (authoritative)
   - Data synced:
     - Email address (work email)
     - Name (first + last)
     - Start date (date of joining)
     - End date (date of leaving)
     - Department
     - Designation/Job title
     - Employee ID
     - Employment status (Active/Inactive)

2. **Microsoft Graph API** (Optional/Supplementary)
   - Source: Microsoft 365 licenses
   - Optional use: Billable status detection (has M365 license = billable)
   - Use case: Can validate email exists in M365 for active employees
   - **Not required for core employee data**

### Sync Priority Rules

**Zoho People is authoritative for ALL employee data:**
- ✅ **Email**: Zoho People work email address
- ✅ **Name**: Zoho People (first name + last name)
- ✅ **Start Date**: Zoho People date of joining
- ✅ **End Date**: Zoho People date of leaving
- ✅ **Department**: Zoho People department
- ✅ **Role/Job Title**: Zoho People designation
- ⚠️ **Billable Status**: Default to `true`, can be manually adjusted or detected from M365 license (optional)

## Data Mapping

### Zoho People → MarginDesk Person Table

| Zoho People Field | MarginDesk Field | Notes |
|-------------------|------------------|-------|
| `Employee ID` | `zoho_employee_id` (new) | Unique identifier |
| `Email Address` | `email` | Used to match with Microsoft 365 |
| `First Name + Last Name` | `name` | Concatenate if separate |
| `Date of Joining` | `start_date` | **Authoritative** |
| `Date of Leaving` | `end_date` | **Authoritative**, null if active |
| `Department` | `department` | Sync if available |
| `Designation/Job Title` | `role` | Sync if available |
| `Employment Status` | Used for logic | Active/Inactive determines end_date |

### Schema Changes Required

Add new field to `Person` model:

```prisma
model Person {
  // ... existing fields ...

  zoho_employee_id   String?   @unique // Zoho People Employee ID

  // Sync metadata
  zoho_synced_at     DateTime? // Last sync timestamp from Zoho People
  microsoft_synced_at DateTime? // Last sync timestamp from Microsoft Graph

  // ... rest of model ...

  @@index([zoho_employee_id])
}
```

## API Endpoints

### Zoho People API Endpoints to Use

1. **Get All Employees**
   ```
   GET https://people.zoho.com/people/api/forms/P_EmployeeView/records
   ```
   - Returns: All employee records with custom fields
   - Pagination: Yes (similar to Zoho Books)
   - Authentication: OAuth 2.0 token

2. **Get Employee by ID**
   ```
   GET https://people.zoho.com/people/api/forms/P_EmployeeView/records/{recordId}
   ```
   - Use for individual updates

### Authentication

**OAuth 2.0 Flow** (similar to Zoho Books):
- Store tokens in database (same table as Zoho Books or separate)
- Scope required: `ZohoPeople.employees.READ`
- Refresh token mechanism for long-term access

## Sync Logic

### Initial Sync (Bulk)

```typescript
async function syncEmployeesFromZohoPeople() {
  // 1. Fetch all employees from Zoho People (with pagination)
  const employees = await fetchAllZohoPeopleEmployees();

  // 2. For each employee:
  for (const employee of employees) {
    // 3. Find existing Person by email
    const existingPerson = await prisma.person.findUnique({
      where: { email: employee.emailAddress }
    });

    if (existingPerson) {
      // 4. UPDATE existing person
      await prisma.person.update({
        where: { id: existingPerson.id },
        data: {
          zoho_employee_id: employee.employeeId,
          start_date: employee.dateOfJoining,
          end_date: employee.dateOfLeaving || null,
          department: employee.department || existingPerson.department,
          role: employee.designation || existingPerson.role,
          zoho_synced_at: new Date(),
        }
      });
    } else {
      // 5. CREATE new person (without Microsoft data yet)
      await prisma.person.create({
        data: {
          email: employee.emailAddress,
          name: `${employee.firstName} ${employee.lastName}`,
          zoho_employee_id: employee.employeeId,
          start_date: employee.dateOfJoining,
          end_date: employee.dateOfLeaving || null,
          department: employee.department,
          role: employee.designation,
          billable: true, // Default, will be updated by Microsoft sync
          ctc_monthly: 0, // Finance sets manually
          zoho_synced_at: new Date(),
        }
      });
    }
  }

  // 6. Create sync log
  await createSyncLog({
    entity: 'Person',
    source: 'ZohoPeople',
    status: 'success',
    records_processed: employees.length,
    records_synced: syncedCount,
  });
}
```

### Delta Sync (Incremental)

For regular syncs, only fetch employees modified since last sync:
- Use `modifiedTime` filter if available in Zoho People API
- Or fall back to full sync (if dataset is small)

### Conflict Resolution

When both Microsoft Graph and Zoho People update the same Person:

1. **Start Date**: Always use Zoho People value
2. **End Date**: Always use Zoho People value
3. **Name**: Use most recent sync (compare `microsoft_synced_at` vs `zoho_synced_at`)
4. **Department/Role**: Use Zoho People if available, else Microsoft

## Implementation Plan

### Phase 1: Database Schema Update
- [ ] Add `zoho_employee_id` field to Person model
- [ ] Add `zoho_synced_at` and `microsoft_synced_at` timestamps
- [ ] Create migration
- [ ] Run migration on dev database

### Phase 2: Zoho People OAuth Setup
- [ ] Create Zoho People OAuth app
- [ ] Configure redirect URLs
- [ ] Store client ID/secret in `.env`
- [ ] Create OAuth connection flow UI (similar to Zoho Books)
- [ ] Store tokens in database

### Phase 3: API Integration
- [ ] Create Zoho People API client utilities
  - Token management
  - API request helpers
  - Pagination handling
- [ ] Implement employee data fetching
- [ ] Add error handling and retry logic

### Phase 4: Sync Endpoint
- [ ] Create `POST /api/sync/zoho-people` endpoint
- [ ] Implement bulk employee sync logic
- [ ] Add sync logging
- [ ] Add audit logging
- [ ] Test with real Zoho People data

### Phase 5: UI Integration
- [ ] Add Zoho People connection status to Settings page
- [ ] Add "Connect to Zoho People" button
- [ ] Add "Sync Employees" trigger button
- [ ] Display last sync timestamp
- [ ] Show sync results/errors

### Phase 6: Testing & Validation
- [ ] Test with sample employees
- [ ] Verify start/end date accuracy
- [ ] Test conflict resolution with Microsoft sync
- [ ] Test pagination for large employee lists
- [ ] Validate error handling

## API Endpoint Specification

### POST /api/sync/zoho-people

**Authorization**: Owner or Finance role only

**Request Body**:
```json
{
  "syncType": "full" | "delta"
}
```

**Response**:
```json
{
  "success": true,
  "syncLog": {
    "id": "sync_log_id",
    "status": "success" | "completed_with_errors" | "failed",
    "processed": 150,
    "synced": 148,
    "created": 10,
    "updated": 138,
    "errors": 2,
    "duration": 4500
  },
  "details": ["Employee john@company.com not found", ...]
}
```

## Sync Frequency Recommendations

### Option 1: On-Demand Only
- User triggers sync manually from Settings page
- Pros: Simple, no scheduling needed
- Cons: Requires manual intervention

### Option 2: Scheduled Daily
- Run sync every night at 2 AM
- Pros: Automatic, always up-to-date
- Cons: Requires cron job setup in Fargate

### Option 3: Hybrid (Recommended)
- Scheduled sync: Daily at 2 AM
- Manual trigger: Available in Settings
- Webhook (future): Real-time updates when employee added/updated

## Data Privacy & Security

1. **Token Storage**: Encrypt OAuth tokens at rest
2. **Access Control**: Only Owner/Finance can trigger sync
3. **Audit Logging**: Log all sync operations and data changes
4. **Data Retention**: Maintain sync history for compliance
5. **Field Privacy**: Salary data NOT synced from Zoho People (managed manually in MarginDesk)

## Benefits of Zoho People Integration

### Authoritative HR Data
- ✅ Official start/end dates from HRIS
- ✅ Single source of truth for employment lifecycle
- ✅ Reduces manual data entry

### Improved Accuracy
- ✅ Automatic updates when employees join/leave
- ✅ Consistent department/role information
- ✅ Eliminates discrepancies between systems

### Reduced Manual Work
- ✅ Auto-populate Person records
- ✅ No need to manually track start/end dates
- ✅ Automatic offboarding updates

### Better Reporting
- ✅ Accurate utilization calculations (based on actual employment periods)
- ✅ Correct allocation tracking (respects start/end dates)
- ✅ Historical employee data for analysis

## Coordination with Microsoft Graph Sync (Optional)

### Microsoft Graph Now Optional

Since **Zoho People provides all core employee data** including email addresses:
- Microsoft Graph sync is **optional**
- Can be used only for:
  - Billable status detection (has M365 license = billable)
  - Validation that employee has active M365 account
  - No longer needed for email, name, department, or role

### If Both Sources Used (Optional Configuration)

| Field | Primary Source | Optional Enhancement |
|-------|---------------|---------------------|
| email | **Zoho People** ✅ | - |
| name | **Zoho People** ✅ | - |
| start_date | **Zoho People** ✅ | - |
| end_date | **Zoho People** ✅ | - |
| department | **Zoho People** ✅ | - |
| role | **Zoho People** ✅ | - |
| billable | Default `true` | Microsoft Graph (license detection) |
| microsoft_user_id | - | Microsoft Graph (for reference) |

## Example Scenarios

### Scenario 1: New Employee Onboarding (Zoho People Only)
1. HR adds employee to Zoho People with start date 2025-11-01
2. HR enters work email: john.doe@company.com
3. Zoho People sync runs → Creates complete Person record
4. Result: Person record ready with all data from Zoho People
   - Email: john.doe@company.com
   - Name: John Doe
   - Start date: 2025-11-01
   - Department: Engineering
   - Role: Software Engineer
   - Billable: true (default)

### Scenario 2: Employee Offboarding (Zoho People Only)
1. Employee's last day: 2025-12-31
2. HR updates Zoho People with end date 2025-12-31
3. Zoho People sync runs → Updates Person.end_date = 2025-12-31
4. Result: Person record shows HR's official end date, no M365 sync needed

### Scenario 3: Department Transfer (Zoho People Only)
1. Employee moves from Engineering to Sales on 2025-11-15
2. HR updates department in Zoho People
3. Zoho People sync runs → Updates Person.department = "Sales"
4. Result: Department updated from authoritative HR source

### Scenario 4: With Optional Microsoft Graph (Billable Detection)
1. Employee exists in Zoho People (from HR)
2. Optional: Microsoft Graph sync runs
3. Detects M365 license → Sets billable = true
4. No M365 license found → Sets billable = false
5. Result: Billable status auto-detected based on M365 license

## Questions for User

Before implementation, please confirm:

1. **Zoho People Access**: Do you have admin access to Zoho People?
2. **Employee Count**: Approximately how many employees will be synced?
3. **Data Fields**: Are there any custom fields in Zoho People you want to sync?
4. **Sync Frequency**: Prefer daily scheduled sync, on-demand only, or both?
5. **OAuth Setup**: Can you create a Zoho People OAuth app (similar to Books)?

## Next Steps

1. ✅ Design document created (this file)
2. ⏳ User confirmation on questions above
3. ⏳ Schema migration for new fields
4. ⏳ Zoho People OAuth setup
5. ⏳ API integration implementation
6. ⏳ Testing with real data

---

**Related Documentation**:
- ZOHO_SETUP_GUIDE.md (for Zoho Books OAuth - similar process)
- API_DOCUMENTATION.md (existing sync endpoints)
- SPECIFICATION.md (Person table structure)
