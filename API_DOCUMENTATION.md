# MarginDesk API Documentation

## Authentication

All API routes are protected using NextAuth with Microsoft Azure AD. Users must be authenticated to access any endpoint.

### Authentication Flow
1. Visit `/auth/signin` to sign in with Microsoft
2. On successful authentication, users are redirected to `/dashboard`
3. Session includes user role (owner, finance, pm, readonly) for authorization

## API Endpoints

### Health Check

#### `GET /api/health`
Check API and database connectivity status.

**Auth**: Not required

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected"
}
```

---

### Clients

#### `GET /api/clients`
List all clients.

**Auth**: Required (any authenticated user)

**Response**:
```json
{
  "clients": [...],
  "total": 10,
  "user": {
    "email": "user@example.com",
    "role": "owner"
  }
}
```

#### `POST /api/clients`
Create a new client.

**Auth**: Required (any authenticated user)

**Request Body**:
```json
{
  "name": "Client Name",
  "billing_currency": "INR",
  "gstin": "27AABCU9603R1ZM",
  "pan": "AABCU9603R",
  "tags": ["consulting", "retainer"]
}
```

**Response**: `201 Created`
```json
{
  "id": "clx...",
  "name": "Client Name",
  "billing_currency": "INR",
  ...
}
```

---

### Projects

#### `GET /api/projects`
List all projects with optional filters.

**Auth**: Required (any authenticated user)

**Query Parameters**:
- `client_id` (optional): Filter by client ID
- `status` (optional): Filter by status (Active, Completed, On Hold)

**Response**:
```json
{
  "projects": [
    {
      "id": "clx...",
      "name": "Project Alpha",
      "client": {
        "id": "clx...",
        "name": "Client Name"
      },
      "_count": {
        "allocations": 5,
        "costs": 20,
        "invoices": 3
      }
    }
  ],
  "total": 15,
  "user": {...}
}
```

#### `POST /api/projects`
Create a new project.

**Auth**: Required (any authenticated user)

**Request Body**:
```json
{
  "client_id": "clx...",
  "name": "Project Alpha",
  "status": "Active",
  "billing_type": "T&M",
  "start_date": "2024-01-01",
  "estimated_hours": 500,
  "hourly_rate": 5000,
  "currency": "INR",
  "overhead_markup": 0.15
}
```

**Response**: `201 Created`

#### `GET /api/projects/[id]`
Get detailed project information including allocations, costs, and invoices.

**Auth**: Required

**Response**:
```json
{
  "id": "clx...",
  "name": "Project Alpha",
  "client": {...},
  "allocations": [...],
  "costs": [...],
  "invoices": [...],
  "_count": {...}
}
```

#### `PUT /api/projects/[id]`
Update a project.

**Auth**: Required (any authenticated user)

**Request Body**: Same as POST (all fields optional)

#### `DELETE /api/projects/[id]`
Delete a project (only if no allocations exist).

**Auth**: Required (owner/finance only)

**Response**: `200 OK`

---

### People

#### `GET /api/people`
List all people with optional filters.

**Auth**: Required (any authenticated user)

**Query Parameters**:
- `role` (optional): Filter by role
- `billable` (optional): Filter by billable status (true/false)

**Response**:
```json
{
  "people": [
    {
      "id": "clx...",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "Developer",
      "billable": true,
      "ctc_monthly": 150000,
      "_count": {
        "allocations": 2
      }
    }
  ],
  "total": 25,
  "user": {...}
}
```

#### `POST /api/people`
Create a new person.

**Auth**: Required (owner/finance only)

**Request Body**:
```json
{
  "email": "john@example.com",
  "name": "John Doe",
  "role": "Developer",
  "department": "Engineering",
  "billable": true,
  "ctc_monthly": 150000,
  "utilization_target": 0.80,
  "start_date": "2024-01-01",
  "microsoft_user_id": "uuid...",
  "manual_ctc_override": false
}
```

**Response**: `201 Created`

#### `GET /api/people/[id]`
Get detailed person information including allocations.

**Auth**: Required

#### `PUT /api/people/[id]`
Update a person. Tracks manual CTC overrides.

**Auth**: Required (owner/finance only)

**Request Body**: Same as POST (all fields optional)

**Note**: If `ctc_monthly` is changed, automatically sets:
- `manual_ctc_override`: true
- `manual_override_by`: current user ID
- `manual_override_at`: current timestamp

#### `DELETE /api/people/[id]`
Delete a person (only if no allocations exist).

**Auth**: Required (owner only)

---

### Allocations

#### `GET /api/allocations`
List all allocations with optional filters.

**Auth**: Required (any authenticated user)

**Query Parameters**:
- `project_id` (optional): Filter by project
- `person_id` (optional): Filter by person
- `active` (optional): Filter active allocations (true/false)

**Response**:
```json
{
  "allocations": [
    {
      "id": "clx...",
      "person": {
        "id": "clx...",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "Developer",
        "billable": true
      },
      "project": {
        "id": "clx...",
        "name": "Project Alpha",
        "client": {
          "id": "clx...",
          "name": "Client Name"
        }
      },
      "start_date": "2024-01-01",
      "end_date": null,
      "allocation_pct": 0.5,
      "notes": "50% allocated"
    }
  ],
  "total": 30,
  "user": {...}
}
```

#### `POST /api/allocations`
Create a new allocation.

**Auth**: Required (owner/finance/pm only)

**Request Body**:
```json
{
  "person_id": "clx...",
  "project_id": "clx...",
  "start_date": "2024-01-01",
  "end_date": "2024-06-30",
  "allocation_pct": 0.5,
  "notes": "50% allocated to Project Alpha"
}
```

**Validation**:
- `allocation_pct` must be between 0 and 1

**Response**: `201 Created`

#### `GET /api/allocations/[id]`
Get detailed allocation information.

**Auth**: Required

#### `PUT /api/allocations/[id]`
Update an allocation.

**Auth**: Required (owner/finance/pm only)

**Request Body**: Same as POST (all fields optional)

#### `DELETE /api/allocations/[id]`
Delete an allocation.

**Auth**: Required (owner/finance/pm only)

---

### Sync Operations

#### `POST /api/sync/microsoft-users`
On-demand sync of licensed users from Microsoft 365.

**Auth**: Required (owner/finance only)

**Process**:
1. Fetches all licensed users from Microsoft Graph API
2. For new users: Creates Person records with Microsoft data
3. For existing users: Updates name, department, role UNLESS `manual_ctc_override` is true
4. Creates SyncLog record with results
5. Creates AuditLog entry

**Response**:
```json
{
  "success": true,
  "syncLog": {
    "id": "clx...",
    "status": "success",
    "processed": 50,
    "synced": 45,
    "skipped": 5,
    "errors": 0,
    "duration": 3500
  }
}
```

**Error Response** (if errors occurred):
```json
{
  "success": true,
  "syncLog": {
    "status": "completed_with_errors",
    ...
  },
  "details": [
    "user@example.com: Error message"
  ]
}
```

#### `POST /api/sync/zoho`
On-demand sync of cash receipts from Zoho Books.

**Auth**: Required (owner/finance only)

**Request Body**:
```json
{
  "syncType": "cash_receipts"
}
```

**Process**:
1. Fetches customer payments from Zoho Books API
2. Matches payments to invoices via `zoho_invoice_id`
3. Creates or updates CashReceipt records
4. Creates SyncLog record with results
5. Creates AuditLog entry

**Response**: Same format as Microsoft sync

---

## Authorization Matrix

| Endpoint | Owner | Finance | PM | Readonly |
|----------|-------|---------|----|---------:|
| GET /api/clients | ✅ | ✅ | ✅ | ✅ |
| POST /api/clients | ✅ | ✅ | ✅ | ✅ |
| GET /api/projects | ✅ | ✅ | ✅ | ✅ |
| POST /api/projects | ✅ | ✅ | ✅ | ✅ |
| PUT /api/projects | ✅ | ✅ | ✅ | ✅ |
| DELETE /api/projects | ✅ | ✅ | ❌ | ❌ |
| GET /api/people | ✅ | ✅ | ✅ | ✅ |
| POST /api/people | ✅ | ✅ | ❌ | ❌ |
| PUT /api/people | ✅ | ✅ | ❌ | ❌ |
| DELETE /api/people | ✅ | ❌ | ❌ | ❌ |
| GET /api/allocations | ✅ | ✅ | ✅ | ✅ |
| POST /api/allocations | ✅ | ✅ | ✅ | ❌ |
| PUT /api/allocations | ✅ | ✅ | ✅ | ❌ |
| DELETE /api/allocations | ✅ | ✅ | ✅ | ❌ |
| POST /api/sync/microsoft-users | ✅ | ✅ | ❌ | ❌ |
| POST /api/sync/zoho | ✅ | ✅ | ❌ | ❌ |

## Audit Logging

All create, update, and delete operations automatically create AuditLog entries with:
- `actor_id`: User who performed the action
- `entity`: Entity type (Client, Project, Person, etc.)
- `entity_id`: ID of the affected entity
- `action`: create, update, or delete
- `before_json`: State before change (for updates/deletes)
- `after_json`: State after change (for creates/updates)
- `timestamp`: When the action occurred

## Environment Variables Required

### Authentication
```bash
NEXTAUTH_URL="http://localhost:3001"
NEXTAUTH_SECRET="your-secret-key"
AZURE_AD_CLIENT_ID="your-azure-client-id"
AZURE_AD_CLIENT_SECRET="your-azure-client-secret"
AZURE_AD_TENANT_ID="your-azure-tenant-id"
```

### Database
```bash
DATABASE_URL="postgresql://user@localhost:5432/margindesk_dev"
```

### Zoho Books (for sync)
```bash
ZOHO_ORGANIZATION_ID="your-zoho-org-id"
ZOHO_ACCESS_TOKEN="your-zoho-access-token"
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Description of what went wrong"
}
```

Common HTTP status codes:
- `200 OK`: Success
- `201 Created`: Resource created
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## Next Steps

1. **Complete Azure AD Setup**: Configure Azure AD App Registration and add credentials to `.env`
2. **Test Authentication**: Sign in at `/auth/signin` and verify session
3. **Test APIs**: Use the endpoints with authenticated session
4. **Configure Zoho**: Add Zoho Books credentials for cash receipt sync
5. **Build UI**: Create client-side pages for managing clients, projects, people, and allocations
