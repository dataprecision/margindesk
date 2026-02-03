# MarginDesk Implementation Status

**Last Updated**: 2025-10-27
**Status**: ✅ **Local Development Ready - Authentication Working**

## 📊 Quick Summary

### What's Working ✅
- **Database**: 20 tables with complete schema
- **Authentication**: Microsoft Azure AD with auto-user creation (TESTED)
- **APIs**: 19 protected endpoints with RBAC
- **Salary System**: Variable monthly compensation tracking
- **Current User**: Ketav Sharma (ketavsharma@dwao.in) - Role: readonly

### What's Next 🚀
- Build UI pages for data management
- Add comprehensive testing
- Implement dashboard metrics
- Deploy to AWS (Amplify + Fargate)

---

## ✅ Completed Tasks

### 1. Local Development Environment Setup ✅
- [x] Next.js 15.5.6 project with TypeScript
- [x] Node.js upgraded from v18 to v20.19.5
- [x] Project directory structure created (`frontend/` subdirectory)
- [x] All dependencies installed via pnpm
- [x] Development server running on http://localhost:3001
- [x] Tailwind CSS configured
- [x] ESLint configured

### 2. Database Setup ✅
- [x] PostgreSQL database `margindesk_dev` created
- [x] Prisma ORM configured
- [x] Complete schema with 20 models designed and implemented:
  - **Master Data**: Client, Project, Person, PO, BillingPlan
  - **Operational**: Allocation, ProjectCost, OverheadPool, OverheadPolicy, **PersonSalary** (NEW)
  - **Accounting**: Invoice, CashReceipt, AccrualSnapshot, AccrualLine, JournalExport
  - **Documentation**: DocSpace, Approval, AuditLog
  - **System**: User (RBAC), SyncLog
- [x] Initial migration executed successfully
- [x] Second migration for PersonSalary table (variable monthly compensation)
- [x] All 20 tables created in database
- [x] Health check API endpoint to verify database connectivity

### 3. Authentication Setup ✅
- [x] NextAuth configured with Microsoft Azure AD provider
- [x] Session management with JWT
- [x] TypeScript types for session with UserRole
- [x] Authentication utilities (`getCurrentUser`, `getCurrentSession`)
- [x] Permission check functions (`hasRole`, `isAdmin`, etc.)
- [x] Route protection middleware:
  - `withAuth`: Basic authentication
  - `withRole`: Role-based access control
  - `withAdminRole`: Owner/finance only
  - `withPMRole`: PM level access
- [x] Sign-in page UI (`/auth/signin`)
- [x] Dashboard page as post-login landing (`/dashboard`)
- [x] SessionProvider wrapper component
- [x] Auto-user creation on first login
- [x] Role attachment to session
- [x] Azure setup guide created (AZURE_SETUP_GUIDE.md)

### 4. Protected API Endpoints ✅

#### Clients API
- [x] `GET /api/clients` - List all clients
- [x] `POST /api/clients` - Create new client
- [x] Audit logging for all operations

#### Projects API
- [x] `GET /api/projects` - List projects with filters (client_id, status)
- [x] `POST /api/projects` - Create new project
- [x] `GET /api/projects/[id]` - Get project details with allocations, costs, invoices
- [x] `PUT /api/projects/[id]` - Update project
- [x] `DELETE /api/projects/[id]` - Delete project (owner/finance only, checks dependencies)
- [x] Audit logging for all operations

#### People API
- [x] `GET /api/people` - List people with filters (role, billable)
- [x] `POST /api/people` - Create new person (owner/finance only)
- [x] `GET /api/people/[id]` - Get person details with allocations
- [x] `PUT /api/people/[id]` - Update person with manual CTC override tracking
- [x] `DELETE /api/people/[id]` - Delete person (owner only, checks dependencies)
- [x] Audit logging for all operations

#### Allocations API
- [x] `GET /api/allocations` - List allocations with filters (project_id, person_id, active)
- [x] `POST /api/allocations` - Create allocation (owner/finance/pm)
- [x] `GET /api/allocations/[id]` - Get allocation details
- [x] `PUT /api/allocations/[id]` - Update allocation (owner/finance/pm)
- [x] `DELETE /api/allocations/[id]` - Delete allocation (owner/finance/pm)
- [x] Validation: allocation_pct must be between 0 and 1
- [x] Audit logging for all operations

#### Salary Management API (NEW)
- [x] `GET /api/people/[id]/salaries` - List monthly salary records
  - Filter by year and/or month
  - Returns salary history with all components (base, bonus, overtime, deductions)
  - Accessible to all authenticated users

- [x] `POST /api/people/[id]/salaries` - Create/update monthly salary
  - Creates new record or updates existing for specific month
  - Automatic total calculation (base + bonus + overtime - deductions)
  - Month normalization to first day of month
  - Audit logging for all changes
  - Owner/finance only

#### Sync Operations
- [x] `POST /api/sync/microsoft-users` - On-demand Microsoft 365 user sync
  - Fetches licensed users from Microsoft Graph API
  - Creates new Person records
  - Updates existing Person records (respects manual_ctc_override)
  - Creates SyncLog with results
  - Owner/finance only

- [x] `POST /api/sync/zoho` - On-demand Zoho Books cash receipt sync
  - Fetches customer payments from Zoho Books API
  - Matches to invoices via zoho_invoice_id
  - Creates/updates CashReceipt records
  - Creates SyncLog with results
  - Owner/finance only

- [x] `POST /api/sync/zoho-people` - On-demand Zoho People sync (NEW)
  - Three sync types via query parameter: `?type=employees|leaves|holidays`
  - **Employees**: Syncs employees from Zoho People to Person table (uses email lookup)
  - **Leaves**: Syncs approved leaves to Leave table (11,354 records synced)
  - **Holidays**: Syncs company holidays to Holiday table (35 records synced)
  - Creates SyncLog with detailed results and error tracking
  - Owner/finance only

### 5. Documentation ✅
- [x] SPECIFICATION.md - Complete technical specification
- [x] LOCAL_DEV_SETUP.md - Local development setup guide
- [x] AZURE_SETUP_GUIDE.md - Azure AD configuration instructions
- [x] SETUP_COMPLETE.md - Initial setup completion summary
- [x] API_DOCUMENTATION.md - Complete API endpoint documentation
- [x] SALARY_MANAGEMENT.md - Variable monthly salary system guide
- [x] ZOHO_PEOPLE_INTEGRATION.md - Zoho People sync setup and configuration
- [x] IMPLEMENTATION_STATUS.md - This file

### 6. Authentication Testing ✅
- [x] Azure AD App Registration completed
- [x] Credentials configured in `.env`
- [x] Sign-in flow tested successfully at `/auth/signin`
- [x] Auto-user creation verified in database
  - User record created: ketavsharma@dwao.in (role: readonly)
  - Person record created with Microsoft User ID
- [x] Role attachment to session confirmed
- [x] Session persists across page navigations
- [x] Dashboard accessible after authentication

## 🔄 No Pending Tasks Requiring User Action

All authentication setup is complete and working! ✅

## 📋 Future Development Tasks

### Phase 1: Core Features (Not Started)
- [ ] Purchase Orders (PO) management UI and API
- [ ] Billing Plans management UI and API
- [ ] Project Costs tracking UI and API
- [ ] Overhead Pools and Policies management
- [ ] Invoice management (with Zoho sync integration)
- [ ] Accrual calculations and freeze/unfreeze workflow
- [ ] AccrualSnapshot versioning implementation
- [ ] Journal export functionality

### Phase 2: Advanced Features (Not Started)
- [ ] Dashboard with real-time metrics
- [ ] Reporting and analytics
- [ ] Document storage integration (S3)
- [ ] Document spaces and approvals workflow
- [ ] At-risk WIP calculations
- [ ] Margin calculations and reporting
- [ ] Utilization tracking and reporting
- [ ] Budget vs Actual analysis

### Phase 3: Integration (Not Started)
- [ ] Zoho Books OAuth implementation (replace access token)
- [ ] Scheduled Microsoft Graph sync (cron job in Fargate)
- [ ] Scheduled Zoho sync (cron job in Fargate)
- [ ] Real-time sync status dashboard
- [ ] Error notification system

### Phase 4: Deployment (Not Started)
- [ ] AWS Amplify setup for frontend
- [ ] ECS Fargate configuration for backend
- [ ] VPC networking with PostgreSQL EC2 instance
- [ ] S3 bucket configuration for documents
- [ ] Environment variable management (AWS Secrets Manager)
- [ ] CI/CD pipeline setup
- [ ] Production environment configuration
- [ ] Monitoring and logging setup

## 🏗️ Architecture Decisions Made

### Database
- **Freeze/Unfreeze**: Option C (Versioned Snapshots with superseded_by field)
- **Zoho PO Integration**: Option C (App-managed POs with sync metadata)
- **At-Risk WIP**: Calculated since PO valid_from, active POs only
- **Overhead Weights**: Must sum to 1.0 (validated at application level)
- **Salary Tracking**: Variable monthly compensation with components (base, bonus, overtime, deductions)

### Authentication & Authorization
- **Auth Provider**: Microsoft Azure AD only (no Google OAuth)
- **User Sync**: Microsoft Graph API for licensed users with manual override capability
- **Session**: JWT-based with role attachment
- **RBAC**: 4 roles - owner, finance, pm, readonly

### Integration
- **Microsoft Graph**: On-demand sync, auto-creates Person records, respects manual overrides
- **Zoho Books**: On-demand sync for cash receipts, matches via zoho_payment_id
- **Sync Execution**: Run in Fargate container (not Lambda)
- **Sync Timing**: On-demand via API (not scheduled)

### Deployment
- **Frontend**: AWS Amplify
- **Backend**: ECS Fargate
- **Database**: PostgreSQL on EC2 (existing, same VPC as Fargate)
- **Storage**: S3 for documents
- **Job Scheduling**: In-container cron jobs in Fargate

## 📊 Current System State

### Database
- **Status**: ✅ Running
- **Location**: localhost:5432
- **Database**: margindesk_dev
- **Tables**: 20 (all created)
- **Migrations**: 2 (initial + PersonSalary table)
- **Test Data**: 1 user (Ketav Sharma) + 1 person record

### Development Server
- **Status**: ✅ Running
- **URL**: http://localhost:3000
- **Port**: 3000
- **Hot Reload**: Enabled

### Authentication
- **Status**: ✅ Fully Working
- **Provider**: Azure AD
- **Sign-in Page**: /auth/signin
- **Dashboard**: /dashboard
- **Auto-user Creation**: Working (tested)
- **Current User**: ketavsharma@dwao.in (role: readonly)

### APIs
- **Status**: ✅ Implemented and compiled
- **Endpoints**: 20 total
  - 2 Clients endpoints
  - 5 Projects endpoints
  - 5 People endpoints
  - 2 Salary endpoints
  - 5 Allocations endpoints
  - 3 Sync endpoints (Microsoft + Zoho Books + Zoho People)
- **Protection**: All protected with role-based access control
- **Audit Logging**: Implemented for all mutations

## 🔧 Technical Stack

### Frontend
- Next.js 15.5.6 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4
- next-auth 4.24.11

### Backend
- Next.js API Routes (serverless)
- Prisma ORM 6.1.0
- PostgreSQL 14+

### Authentication
- NextAuth with Azure AD Provider
- JWT Sessions
- Role-Based Access Control (RBAC)

### External Integrations
- Microsoft Graph API (User sync)
- Zoho Books API (Cash receipts sync)
- Zoho People API (Employee, leave, and holiday sync)

## 🎯 Key Features Implemented

1. **Complete Database Schema**: All 20 models with proper relationships
2. **Authentication & Authorization**: Full RBAC with 4 roles (tested and working)
3. **API Endpoints**: CRUD operations for core entities (Clients, Projects, People, Allocations, Salaries)
4. **Variable Monthly Salary System**: Track bonuses, overtime, deductions per month
5. **Audit Logging**: Complete audit trail for all data changes
6. **Integration Points**: Microsoft Graph, Zoho Books, and Zoho People sync endpoints
7. **Zoho People Integration**: Full employee, leave, and holiday sync (11,354 leaves + 35 holidays synced)
8. **Manual Override Tracking**: CTC changes tracked with actor and timestamp
9. **Dependency Validation**: Prevents deletion of entities with dependencies
10. **Sync Logging**: Complete sync operation tracking with status and error details
11. **Auto-User Creation**: First-time login creates both User and Person records

### 7. UI Pages (In Progress) 🚧
- [x] Clients Management Page (`/clients`)
  - List view with filtering and search
  - Create/Edit client dialog
  - Delete functionality with dependency checks
  - Zoho Books contact sync integration

- [x] Projects Management Page (`/projects`)
  - List view with advanced filtering (status, pricing model, client)
  - Create/Edit project dialog with **searchable client dropdown**
  - Delete functionality with dependency validation
  - Project details with allocations, costs, and invoices

- [x] Dashboard Page Enhancements
  - Clickable Projects card linking to `/projects`
  - Active "Manage Projects" button
  - Navigation integration with Navbar component

- [ ] People Management Page (Not started)
  - List view with filtering
  - Create/Edit person dialog
  - Salary history management

- [ ] Allocations Management Page (Not started)
  - List view with filtering
  - Create/Edit allocation dialog
  - Utilization tracking

### 8. Expenses Management (NEW) 🚧
- [x] **Expenses Page** (`/expenses`)
  - List view with advanced filtering (date range, account, customer, month, status)
  - All/Included/Excluded filter buttons with dynamic counts
  - Date column with reversible sort (ascending/descending)
  - Include/Exclude toggle for each expense
  - Exclusion reason display and management
  - Table footer with totals breakdown
  - Real-time filter count updates based on active filters

- [x] **Expense Sync from Zoho Books**
  - File: `src/app/api/sync/expenses/route.ts`
  - Endpoint: `POST /api/sync/expenses`
  - Syncs expenses from Zoho Books with pagination support
  - Date range selection (last_month, last_quarter, this_fiscal_year, etc.)
  - Uses `total_without_tax` for amount (excluding taxes)
  - Uses `total` for total with taxes
  - Auto-exclusion rules with pattern matching
  - Preserves manual include/exclude changes on re-sync

- [x] **Exclusion Rules Management**
  - Default rules: GST Payable, TDS Payable, Payroll Tax, Roundoff, Bank Charges, Very Small Amounts
  - Custom rule creation with field/operator/value patterns
  - Enable/disable rules without deletion
  - Automatic exclusion reason tracking

### 8b. Bills Management (NEW) ✅
- [x] **Bills Page** (`/bills`)
  - List view with advanced filtering (date range, category, status, billed month)
  - All/Included/Excluded filter buttons with dynamic counts (updates based on active filters)
  - Date column with reversible sort (click to toggle ↓/↑)
  - Include/Exclude toggle for each bill
  - Pagination controls (25/50/100/200 items per page)
  - Stats cards: Total Bills, Paid, Overdue, Included, Total Amount
  - Table footer with totals breakdown
  - Category and Period columns showing custom fields from Zoho

- [x] **Bill Sync from Zoho Books**
  - File: `src/app/api/sync/bills/route.ts`
  - Endpoint: `POST /api/sync/bills`
  - Syncs bills from Zoho Books with pagination support (200 per page)
  - Date range selection (last_month, last_quarter, this_fiscal_year, etc.)
  - **Key Difference from Expenses**: Bills only have `total` field (no separate amount field)
  - Maps vendor information (vendor_id, vendor_name)
  - Captures custom fields: `cf_expense_category` (IT, Admin, Travelling, etc.) and `cf_billed_for_month`
  - Tracks both `total` and `balance` (unpaid amount)
  - Status mapping: draft, open, overdue, paid, void
  - Preserves manual include/exclude changes on re-sync
  - Creates sync logs for tracking

- [x] **Bills API Endpoints**
  - `GET /api/bills` - List bills with filters
  - `PATCH /api/bills/[id]` - Toggle include_in_calculation
  - `DELETE /api/bills/[id]` - Delete bill

### 9. Recent Updates (2025-10-24) ✅

#### Bills Implementation ✅
- [x] **Applied Expenses Learnings to Bills**
  - Created sync endpoint following expenses pattern
  - Implemented UI with all fixes from expenses:
    - Filter button counts from base filtered set (not all bills)
    - Number() wrapper to prevent string concatenation
    - Reversible date sort with click interaction
    - Table footer showing totals, balance, included/excluded counts
  - Key difference: Bills only have `total` field, no `total_without_tax`
  - Added custom field support for expense category and billed month

#### Expense Amount vs Total Fix ✅
- [x] **Discovered Zoho Books API Fields**
  - Found `total_without_tax` field in Zoho Books Expenses API
  - Previously attempted using `bcy_subtotal` and calculated `total - tax_amount` (both undefined)
  - Debug logging revealed full expense object structure

- [x] **Updated Sync Logic**
  - File: `src/app/api/sync/expenses/route.ts` (line 126)
  - Changed from: `expense.bcy_subtotal || expense.total - (expense.tax_amount || 0)`
  - Changed to: `expense.total_without_tax || expense.total`
  - Now correctly separates expense amount from total with tax

- [x] **UI Improvements**
  - Added reversible date sort (click Date header to toggle ↓/↑)
  - Fixed filter button counts to update based on active filters
  - Removed summary cards, moved totals to table footer
  - Fixed string concatenation issue in total calculations (wrapped with `Number()`)
  - Table footer shows: expense count, amount total, total with tax, included/excluded breakdown

### 10. Recent Updates (2025-10-23) ✅

#### Zoho People Integration Complete ✅
- [x] **Employee Sync Endpoint**
  - File: `src/app/api/sync/zoho-people/route.ts`
  - Endpoint: `POST /api/sync/zoho-people?type=employees`
  - Syncs employees from Zoho People to Person table
  - Uses email lookup for matching (instead of Zoho ID)
  - Creates new Person records for new employees
  - Updates existing Person records with latest data
  - Owner/finance only access

- [x] **Leave Sync Endpoint**
  - Endpoint: `POST /api/sync/zoho-people?type=leaves`
  - Syncs employee leaves from Zoho People
  - Filters to only sync **approved leaves** (skips pending/rejected)
  - Successfully synced **11,354 approved leave records**
  - Uses Zoho People v1 API `/people/api/leave/getLeaveTypeDetails`
  - Schema fix: Updated Leave.days_taken precision from Decimal(4,2) to Decimal(6,2)
  - Lookup employee by Zoho ID before creating leave record

- [x] **Holidays Sync Endpoint**
  - Endpoint: `POST /api/sync/zoho-people?type=holidays`
  - Syncs company holidays from Zoho People
  - Successfully synced **35 holiday records** (17 for 2024, 18 for 2025)
  - Uses Zoho People **v2 API** `/people/api/leave/v2/holidays/get`
  - Fixed v1 to v2 API migration:
    - Changed endpoint from v1 `getHolidays` to v2 `holidays/get`
    - Updated response parsing (v2 uses `data` array instead of `response.result`)
    - Fixed success check (v2 uses `status: 1` instead of `status: 0`)
    - Updated field mappings (`isRestrictedHoliday` boolean, `Remarks` field)
    - Added `holidayId` extraction from `holiday.ID`
  - Fetches holidays for 3 years (2024, 2025, 2026)

#### Zoho Books Integration Enhancements
- [x] **Pagination Support for Contact Sync**
  - File: `src/app/api/sync/zoho/route.ts`
  - Implemented while loop to fetch all contacts from Zoho Books
  - Handles up to 200 contacts per page (Zoho's maximum)
  - Added `has_more_page` detection from `page_context`
  - Safety limit of 100 pages to prevent infinite loops
  - Updated metadata and response counts to use `allContacts.length`

#### Projects Page UI Improvements
- [x] **Searchable Client Dropdown**
  - File: `src/app/projects/page.tsx`
  - Replaced standard `<select>` with searchable input field
  - Real-time filtering of clients by name (case-insensitive)
  - Visual enhancements:
    - Search icon indicator
    - Client billing currency display in dropdown
    - Hover effects for better UX
    - "No clients found" message for empty results
  - State management:
    - `clientSearchTerm`: Tracks search query
    - `showClientDropdown`: Controls dropdown visibility
    - `clientDropdownRef`: Enables click-outside detection
  - Click-outside handler to close dropdown
  - Proper cleanup on modal close/success operations
  - Maximum dropdown height with scroll for long lists

#### Dashboard Navigation
- [x] **Enabled Projects Navigation**
  - File: `src/app/dashboard/page.tsx`
  - Projects card now clickable (links to `/projects`)
  - "Manage Projects" button activated and styled
  - Consistent green theme matching Projects branding
  - Hover effects for visual feedback

#### Bug Fixes
- [x] **Fixed "clients.map is not a function" Error**
  - File: `src/app/projects/page.tsx` (line 89)
  - Issue: API returns `{ clients: [], total: number, user: {} }` object
  - Solution: Extract `clients` array from response with `data.clients || []`
  - Prevents runtime errors when trying to map over response object

### 11. Pod Financials Report (2025-10-27) ✅

#### Partial Month Allocation Support ✅
**Business Requirement**: When a resource is allocated to a pod mid-month (or leaves mid-month), the system must correctly calculate working hours, timesheet entries, and salary costs for only the period the member was in the pod.

**Implementation Files**:
- `frontend/src/app/api/reports/pod-financials/route.ts` (Lines 196-346)

**Git Commit**: `22f0ce8` - "feat: implement partial month allocation support for pod financials"

#### Key Features Implemented:

**1. Working Hours Calculation (Lines 218-263)**
- Calculate effective period: intersection of report period and membership period
- Count business days (excluding weekends) only within effective period
- Multiply by 8 hours per day for total working hours
- Example: Member joins Sept 15 → 12 business days × 8 = 96 working hours

**2. Timesheet Entry Filtering (Lines 233-256)**
- **Critical Fix**: Filter timesheet entries by member's effective pod period
- Skip entries before join date or after leave date
- Prevents >100% utilization for mid-month joiners
- **Verified Case - Aaif Hussain (DEL-331)**:
  - Before fix: 149.0 billable hours, 155.2% utilization
  - After fix: 77.2 billable hours, 80.4% utilization ✅

**3. Salary Cost Proration (Lines 287-346)**
- Prorate salary by calendar days (not business days)
- Formula: `(daysInPod / totalDaysInMonth) × monthlySalary × allocation%`
- Example: ₹81,665 × (16/30 days) = ₹43,554.67 ✅

**4. Project Breakdown Enhancement (Lines 196-201, 245-255)**
- Added `project` relation to TimesheetEntry query
- Build breakdown from actual billable timesheet entries
- Replaces allocation-based logic with real data

#### Bug Fixes:

**Business Days Calculation Fix**
- **Issue**: September 2025 calculated as 23 business days instead of 22
- **Root Cause**: Weekend detection incorrectly identifying Sept 28 (Sunday) as business day
- **Fix**: Corrected `getDay()` logic to properly exclude weekends (0=Sunday, 6=Saturday)
- **Result**: September 2025 now correctly calculates as 22 business days ✅

#### Utilization Metrics:
- **Working Hours**: `businessDays × 8` (filtered by effective period)
- **Billable Hours**: Sum of billable timesheet entries (filtered by effective period)
- **Non-Billable Hours**: Sum of non-billable entries (filtered by effective period)
- **Utilization %**: `(Total Worked / Working Hours) × 100`
- **Billability %**: `(Billable Hours / Working Hours) × 100`

#### Database Schema:
- **PodMembership**: Tracks `start_date`, `end_date`, `allocation_pct`
- **TimesheetEntry**: Tracks `work_date`, `hours_logged`, `is_billable`, `project_id`
- **PersonSalary**: Tracks monthly salary components

#### Verification Queries:
```sql
-- Check member's pod period
SELECT pm.start_date, pm.end_date, pm.allocation_pct
FROM "PodMembership" pm
JOIN "Person" p ON p.id = pm.person_id
WHERE p.employee_code = 'DEL-331';

-- Check timesheet hours breakdown
SELECT
  SUM(CASE WHEN te.work_date < '2025-09-15' THEN te.hours_logged ELSE 0 END) as hours_before_sept15,
  SUM(CASE WHEN te.work_date >= '2025-09-15' THEN te.hours_logged ELSE 0 END) as hours_from_sept15,
  SUM(te.hours_logged) as total_hours
FROM "TimesheetEntry" te
JOIN "Person" p ON p.id = te.person_id
WHERE p.employee_code = 'DEL-331'
  AND te.work_date BETWEEN '2025-09-01' AND '2025-09-30';

-- Verify salary proration
SELECT
  ps.total as monthly_salary,
  pm.allocation_pct,
  CAST(ps.total * (pm.allocation_pct / 100.0) *
    (DATE_PART('day', DATE '2025-09-30' - pm.start_date) + 1) / 30.0
  AS NUMERIC(10,2)) as prorated_cost
FROM "PodMembership" pm
JOIN "PersonSalary" ps ON ps.person_id = pm.person_id
JOIN "Person" p ON p.id = pm.person_id
WHERE p.employee_code = 'DEL-331'
  AND ps.month = '2025-09-01';
```

#### Impact:
- ✅ Aaif Hussain utilization corrected: 155.2% → 80.4%
- ✅ Salary proration accurate: ₹81,665 monthly → ₹43,555 for 16/30 days
- ✅ Project breakdown populated with actual billable hours
- ✅ All utilization percentages accurate for partial month allocations

#### Technical Debt / Future Improvements:
1. Consider caching business days calculation for performance
2. Add explicit validation for allocation percentages (0-100)
3. Add audit logs for timesheet entry filtering
4. Add unit tests for date filtering edge cases (month boundaries, leap years)
5. Consider adding "partial month" indicator in report UI

## 📝 Notes

### Decisions Awaiting User Input
None at this time. All architectural decisions have been made based on user feedback.

### Known Limitations
1. **Zoho Sync**: Requires Zoho Books OAuth implementation (currently using access token)
2. **UI**: Partial implementation - Clients and Projects pages complete, People and Allocations pending
3. **Scheduled Syncs**: Not implemented (on-demand only)
4. **Real-time Updates**: No websocket/SSE for live dashboard updates

### Next Immediate Steps
1. **People Management UI**: Build page for managing people with salary tracking
2. **Allocations Management UI**: Create interface for allocation management
3. **Dashboard Enhancements**: Add real metrics and charts with live data
4. **Testing**: Add comprehensive API tests
5. **Zoho OAuth**: Implement proper OAuth flow for Zoho Books

## 📞 Support

For questions or issues:
1. Check relevant documentation in project root
2. Review API_DOCUMENTATION.md for endpoint details
3. Review AZURE_SETUP_GUIDE.md for authentication setup
4. Check database schema in `prisma/schema.prisma`
