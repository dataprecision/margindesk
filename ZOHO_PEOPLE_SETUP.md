# Zoho People OAuth Setup Guide

## Overview

MarginDesk syncs employee data from Zoho People. This guide shows you how to set up OAuth authentication using your existing Zoho credentials.

---

## ✅ Good News!

You can **reuse your existing Zoho OAuth credentials** (Client ID and Secret) for Zoho People. The same credentials work for all Zoho services - you just need to authorize the correct scopes.

---

## Quick Setup (3 Steps)

### Step 1: Start Your Dev Server

```bash
cd frontend
pnpm dev
```

### Step 2: Open Zoho People Authorization URL

**For US region (.com):**

Open this URL in your browser:
```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoPeople.forms.READ,ZohoPeople.employee.READ&client_id=1000.8RDHFJ32K1E900FIQ2ZKGVJIKWAE8E&response_type=code&access_type=offline&redirect_uri=http://localhost:3000/api/zoho-people/callback
```

**For India region (.in):**

```
https://accounts.zoho.in/oauth/v2/auth?scope=ZohoPeople.forms.READ,ZohoPeople.employee.READ&client_id=1000.8RDHFJ32K1E900FIQ2ZKGVJIKWAE8E&response_type=code&access_type=offline&redirect_uri=http://localhost:3000/api/zoho-people/callback
```

### Step 3: Authorize and You're Done!

1. You'll be asked to sign in to Zoho (if not already signed in)
2. Review the permissions:
   - **ZohoPeople.forms.READ** - Read employee forms
   - **ZohoPeople.employee.READ** - Read employee data
3. Click **Accept**
4. You'll be redirected back to MarginDesk Settings page
5. You should see "✅ Connected to Zoho People"

---

## Using the Settings Page (Recommended)

Instead of copying URLs, you can use the Settings page:

1. **Navigate to Settings**: http://localhost:3000/settings
2. **Find Zoho People card** (orange "ZP" icon)
3. **Click "Connect" button**
4. **Authorize** when redirected to Zoho
5. **Done!** You'll be redirected back with success message

---

## What Gets Synced

### Employee Data
- **Employee ID** - Unique identifier from Zoho People
- **Name** - First + Last name
- **Email** - Work email address
- **Designation** - Job title/role
- **Date of Joining** - Start date
- **Billable Status** - Defaults to true (can be changed)

### Default Settings
- **Utilization Target**: 85% (can be adjusted per person)
- **CTC Monthly**: 0 (update manually or sync salary data later)
- **Role**: From Zoho People designation, default "Employee"

---

## Syncing Employees

After connecting, you can sync employees in two ways:

### Option 1: Via API (for scripts/automation)
```bash
curl -X POST http://localhost:3000/api/sync/zoho-people \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{"syncType": "employees"}'
```

### Option 2: Via Settings Page (coming soon)
A "Sync Now" button will be added to the Settings page.

---

## Environment Variables Reference

Your `.env` file should have:

```env
# Zoho OAuth (shared across Books and People)
ZOHO_REGION="US"  # or "IN" for India
ZOHO_CLIENT_ID="1000.8RDHFJ32K1E900FIQ2ZKGVJIKWAE8E"
ZOHO_CLIENT_SECRET="bd7ae3d68aff694ad3c97718f085ab1e14821a4bf3"

# Public environment variables (for browser)
NEXT_PUBLIC_ZOHO_REGION="US"
NEXT_PUBLIC_ZOHO_CLIENT_ID="1000.8RDHFJ32K1E900FIQ2ZKGVJIKWAE8E"
```

**Note**: The tokens are stored in the database, not in environment variables!

---

## API Scopes Required

MarginDesk needs these Zoho People scopes:

```
ZohoPeople.forms.READ        # Read employee forms
ZohoPeople.employee.READ     # Read employee data
```

---

## Troubleshooting

### "Invalid Client" Error
- ✅ **Fixed!** The client_id is now included in the URL
- Make sure you're using the correct regional URL (.com vs .in)

### "Invalid Scope" Error
- Check that the scope is exactly: `ZohoPeople.forms.READ,ZohoPeople.employee.READ`
- Note: It's `.employee.` (singular), not `.employees.` (plural)

### Redirect URI Mismatch
- Callback URI must be: `http://localhost:3000/api/zoho-people/callback`
- In Zoho API Console, add this to authorized redirect URIs

### Connection Shows as Disconnected
- Check browser console for errors
- Make sure dev server is running
- Try disconnecting and reconnecting

### Sync Returns "Not Connected"
- Go to Settings and verify Zoho People shows as connected
- If not, click "Connect" and authorize again

---

## Testing the Setup

### 1. Test Connection Status
```bash
curl http://localhost:3000/api/settings/zoho-people
```

Expected response:
```json
{
  "connected": true,
  "organization_name": "Zoho People",
  "connected_at": "2025-10-23T..."
}
```

### 2. Test Employee Sync
```bash
curl -X POST http://localhost:3000/api/sync/zoho-people \
  -H "Content-Type: application/json" \
  -d '{"syncType": "employees"}'
```

Expected response:
```json
{
  "success": true,
  "syncLog": {
    "processed": 25,
    "synced": 25,
    "created": 15,
    "updated": 10,
    "errors": 0
  }
}
```

---

## Database Storage

Tokens are stored in the `IntegrationSettings` table:

```sql
-- Check Zoho People connection
SELECT * FROM "IntegrationSettings" WHERE key = 'zoho_people';

-- Check synced employees
SELECT * FROM "Person" WHERE zoho_employee_id IS NOT NULL;
```

---

## Security Notes

1. **Tokens are stored in database**, not .env files
2. **Refresh tokens never expire** (unless revoked)
3. **Access tokens auto-refresh** when they expire (1 hour)
4. **Only owner/finance can**:
   - Connect/disconnect integrations
   - Trigger syncs
5. **Client Secret is never exposed** to the browser

---

## Next Steps

After connecting and syncing:

1. **Review synced employees**: Check the People page
2. **Update CTC values**: Add monthly compensation
3. **Set billable status**: Mark non-billable employees
4. **Adjust utilization targets**: Per person or role
5. **Create allocations**: Assign people to projects

---

## Additional Resources

- [Zoho People API Documentation](https://www.zoho.com/people/api/)
- [Zoho OAuth Documentation](https://www.zoho.com/accounts/protocol/oauth.html)
- [MarginDesk Settings Page](http://localhost:3000/settings)

---

## Support

If you encounter issues:

1. Check this guide's troubleshooting section
2. Check browser console for errors: F12 → Console
3. Check server logs: Terminal where `pnpm dev` is running
4. Verify all environment variables are set correctly

---

**Status**: ✅ Ready to use!

Just open the Settings page and click "Connect" on the Zoho People card.
