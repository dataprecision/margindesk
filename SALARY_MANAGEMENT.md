# Salary Management System

## Overview

The salary system has been updated to handle **variable monthly compensation** instead of assuming a constant monthly CTC. This reflects real-world scenarios where salaries vary due to bonuses, deductions, overtime, etc.

## Schema Changes

### Person Model
- **`ctc_monthly`** field remains for reference/baseline salary
- New relation: `salary_records` → PersonSalary[]

### PersonSalary Model (NEW)
Tracks actual monthly compensation with all variations:

```prisma
model PersonSalary {
  id          String   @id
  person_id   String
  month       DateTime // First day of month (2024-01-01 for Jan 2024)
  base_salary Decimal  // Base monthly salary
  bonus       Decimal  // Performance bonus, incentives
  deductions  Decimal  // Deductions (unpaid leave, etc.)
  overtime    Decimal  // Overtime pay
  total       Decimal  // Calculated: base + bonus + overtime - deductions
  notes       String?  // Reason for variations

  @@unique([person_id, month]) // One record per person per month
}
```

## How It Works

### 1. Monthly Salary Records
- **One record per person per month**
- Month is stored as the **first day of the month** (e.g., `2024-01-01` for January 2024)
- Unique constraint prevents duplicate entries for the same person/month

### 2. Salary Components

#### Base Salary
The regular monthly compensation before any additions or deductions.

#### Bonus
- Performance bonuses
- Quarterly/annual incentives
- Achievement rewards
- Commission

#### Overtime
- Extra hours worked
- Weekend/holiday work
- On-call compensation

#### Deductions
- Unpaid leave (LWP)
- Salary advances
- Fine/penalties
- Other deductions

#### Total
Automatically calculated:
```
total = base_salary + bonus + overtime - deductions
```

### 3. Notes Field
Free-text field to explain variations:
- "Q4 performance bonus"
- "3 days unpaid leave"
- "Holiday overtime pay"
- "Project completion incentive"

## API Endpoints

### GET /api/people/[id]/salaries
List all salary records for a person.

**Query Parameters**:
- `year` (optional): Filter by year (e.g., `2024`)
- `month` (optional): Filter by specific month (requires year, e.g., `month=1&year=2024`)

**Response**:
```json
{
  "salaries": [
    {
      "id": "...",
      "person_id": "...",
      "month": "2024-01-01",
      "base_salary": 150000.00,
      "bonus": 50000.00,
      "deductions": 0.00,
      "overtime": 10000.00,
      "total": 210000.00,
      "notes": "Q4 bonus + holiday overtime",
      "person": {
        "id": "...",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ],
  "total": 12
}
```

### POST /api/people/[id]/salaries
Create or update salary record for a specific month.

**Auth**: Owner/Finance only

**Request Body**:
```json
{
  "month": "2024-01-01",
  "base_salary": 150000,
  "bonus": 50000,
  "deductions": 0,
  "overtime": 10000,
  "notes": "Q4 bonus + holiday overtime"
}
```

**Behavior**:
- If salary record exists for that month → **UPDATE** (returns 200)
- If no record exists → **CREATE** (returns 201)
- Total is automatically calculated
- Month is normalized to first day of month
- Audit log is created

## Usage Examples

### Recording Regular Monthly Salary
```json
POST /api/people/[person_id]/salaries
{
  "month": "2024-01-01",
  "base_salary": 150000
}
// Total: 150000
```

### Recording Salary with Bonus
```json
POST /api/people/[person_id]/salaries
{
  "month": "2024-03-01",
  "base_salary": 150000,
  "bonus": 100000,
  "notes": "Q1 performance bonus"
}
// Total: 250000
```

### Recording Salary with Deductions
```json
POST /api/people/[person_id]/salaries
{
  "month": "2024-02-01",
  "base_salary": 150000,
  "deductions": 15000,
  "notes": "3 days unpaid leave"
}
// Total: 135000
```

### Recording Salary with Multiple Components
```json
POST /api/people/[person_id]/salaries
{
  "month": "2024-12-01",
  "base_salary": 150000,
  "bonus": 200000,
  "overtime": 20000,
  "deductions": 5000,
  "notes": "Annual bonus + holiday overtime - advance deduction"
}
// Total: 365000
```

## Integration with Cost Calculations

### Accrual Calculations
When calculating monthly accruals, the system will:

1. Check if `PersonSalary` record exists for that month
2. If YES → Use `PersonSalary.total` for calculations
3. If NO → Fall back to `Person.ctc_monthly`

### Example Query for Monthly Costs
```typescript
// Get person's salary for a specific month
const month = new Date("2024-01-01");
const salary = await prisma.personSalary.findUnique({
  where: {
    person_id_month: {
      person_id: personId,
      month: month
    }
  }
});

const monthlyCost = salary?.total || person.ctc_monthly;
```

## Migration Impact

### Existing Data
- All existing `Person` records remain unchanged
- `ctc_monthly` field is still available as baseline/reference
- No existing data is lost

### New Workflow
1. **Create Person** → Set `ctc_monthly` as baseline
2. **Each Month** → Create `PersonSalary` record if there are variations
3. **Cost Calculations** → Check `PersonSalary` first, fall back to `ctc_monthly`

## Audit Logging

All salary create/update operations are logged:
- Actor: Who made the change
- Entity: PersonSalary
- Action: create or update
- Before/After: Full salary record state

## Permissions

- **Read Salaries**: Any authenticated user (for transparency)
- **Create/Update Salaries**: Owner and Finance only
- **Delete Salaries**: Not implemented (maintain complete history)

## Benefits

✅ **Accurate Cost Tracking**: Real monthly costs, not averages
✅ **Bonus Management**: Track performance bonuses separately
✅ **Deduction Handling**: Properly account for unpaid leave
✅ **Overtime Tracking**: Capture extra compensation
✅ **Audit Trail**: Complete salary history with reasons
✅ **Flexibility**: Easy to add new compensation types
✅ **Backward Compatible**: Falls back to `ctc_monthly` if no record exists

## Future Enhancements

Potential additions:
- Bulk salary upload (CSV import for monthly payroll)
- Salary approval workflow
- Salary slip generation
- Tax calculation integration
- Salary comparison/analytics
- Automatic bonus calculation rules
