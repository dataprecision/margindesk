# Zoho Books API Setup Guide

## Overview

MarginDesk syncs clients and cash receipts from Zoho Books. This guide explains how to set up OAuth 2.0 authentication to get the necessary access tokens.

---

## Step 1: Create Zoho API Console Application

1. **Go to Zoho API Console**
   - Visit: https://api-console.zoho.com/
   - Sign in with your Zoho account

2. **Create New Client**
   - Click "Add Client" button
   - Select "Server-based Applications"

3. **Fill in Application Details**
   - **Client Name**: `MarginDesk`
   - **Homepage URL**: `http://localhost:3000` (for development)
   - **Authorized Redirect URIs**: `http://localhost:3000/api/zoho/callback`

4. **Click "CREATE"**
   - You'll receive:
     - **Client ID**
     - **Client Secret**
   - Save these credentials securely

---

## Step 2: Generate Authorization Code

### Manual Authorization (One-Time Setup)

1. **Construct Authorization URL**

Replace `YOUR_CLIENT_ID` with your actual Client ID.

**For India (default)**:
```
https://accounts.zoho.in/oauth/v2/auth?scope=ZohoBooks.contacts.READ,ZohoBooks.customerpayments.READ&client_id=YOUR_CLIENT_ID&response_type=code&access_type=offline&redirect_uri=http://localhost:3000/api/zoho/callback
```

**For US**:
```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoBooks.contacts.READ,ZohoBooks.customerpayments.READ&client_id=YOUR_CLIENT_ID&response_type=code&access_type=offline&redirect_uri=http://localhost:3000/api/zoho/callback
```

**For EU**:
```
https://accounts.zoho.eu/oauth/v2/auth?scope=ZohoBooks.contacts.READ,ZohoBooks.customerpayments.READ&client_id=YOUR_CLIENT_ID&response_type=code&access_type=offline&redirect_uri=http://localhost:3000/api/zoho/callback
```

2. **Open URL in Browser**
   - Paste the URL in your browser
   - You'll be redirected to Zoho login page
   - Sign in with your Zoho account

3. **Authorize Application**
   - Review the permissions requested
   - Click "Accept"

4. **Copy Authorization Code**
   - After authorization, you'll be redirected to: `http://localhost:3000/api/zoho/callback?code=AUTHORIZATION_CODE`
   - Copy the `code` parameter value from the URL
   - **Important**: This code expires in 60 seconds, use it immediately

---

## Step 3: Exchange Code for Access & Refresh Tokens

### Using cURL

Replace placeholders with your actual values.

**For India**:
```bash
curl -X POST https://accounts.zoho.in/oauth/v2/token \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=http://localhost:3000/api/zoho/callback" \
  -d "grant_type=authorization_code"
```

**For US**:
```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=http://localhost:3000/api/zoho/callback" \
  -d "grant_type=authorization_code"
```

### Response

You'll receive a JSON response:

```json
{
  "access_token": "1000.abc123...",
  "refresh_token": "1000.def456...",
  "api_domain": "https://www.zohoapis.com",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Important**:
- `access_token`: Valid for 1 hour
- `refresh_token`: Valid indefinitely (use to get new access tokens)

---

## Step 4: Get Organization ID

### Using cURL

Replace `YOUR_ACCESS_TOKEN` with the access token from Step 3.

**For India**:
```bash
curl -X GET https://books.zoho.in/api/v3/organizations \
  -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN"
```

**For US**:
```bash
curl -X GET https://books.zoho.com/api/v3/organizations \
  -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN"
```

### Response

```json
{
  "organizations": [
    {
      "organization_id": "123456789",
      "name": "Your Company Name",
      "contact_name": "Your Name",
      "email": "you@example.com",
      ...
    }
  ]
}
```

Copy the `organization_id` value.

---

## Step 5: Configure Environment Variables

Add to your `.env` file:

```env
# Zoho Books API Configuration
ZOHO_REGION="IN"  # Options: US, EU, IN, AU, JP, CA, CN
ZOHO_CLIENT_ID="your_client_id_here"
ZOHO_CLIENT_SECRET="your_client_secret_here"
ZOHO_REFRESH_TOKEN="your_refresh_token_here"
ZOHO_ORGANIZATION_ID="your_organization_id_here"

# Temporary (for testing)
ZOHO_ACCESS_TOKEN="your_current_access_token_here"
```

### Region Configuration

MarginDesk automatically uses the correct API endpoints based on your `ZOHO_REGION`:

| Region | Code | Accounts URL | API Domain | Books API |
|--------|------|--------------|------------|-----------|
| **India** | `IN` | accounts.zoho.in | zohoapis.in | books.zoho.in |
| United States | `US` | accounts.zoho.com | zohoapis.com | books.zoho.com |
| Europe | `EU` | accounts.zoho.eu | zohoapis.eu | books.zoho.eu |
| Australia | `AU` | accounts.zoho.com.au | zohoapis.com.au | books.zoho.com.au |
| Japan | `JP` | accounts.zoho.jp | zohoapis.jp | books.zoho.jp |
| Canada | `CA` | accounts.zoho.ca | zohoapis.ca | books.zoho.ca |
| China | `CN` | accounts.zoho.com.cn | zohoapis.com.cn | books.zoho.com.cn |

**For India**: Set `ZOHO_REGION=IN` (default)

---

## Step 6: Implement Token Refresh (Recommended)

Since access tokens expire after 1 hour, you should implement automatic token refresh.

### Create Token Refresh Utility

Create file: `/src/lib/zoho/token-manager.ts`

```typescript
let cachedAccessToken: string | null = null;
let tokenExpiry: number = 0;

export async function getZohoAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }

  // Refresh the token
  const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Zoho access token');
  }

  const data = await response.json();

  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min before expiry

  return cachedAccessToken;
}
```

### Update Sync Code

In `/src/app/api/sync/zoho/route.ts`, replace:

```typescript
const zohoAccessToken = process.env.ZOHO_ACCESS_TOKEN!;
```

With:

```typescript
import { getZohoAccessToken } from '@/lib/zoho/token-manager';

const zohoAccessToken = await getZohoAccessToken();
```

---

## Quick Setup (For Testing)

If you just want to test quickly without implementing full OAuth:

1. **Get a temporary access token** (valid for 1 hour):
   - Follow Steps 1-3 above
   - Add only `ZOHO_ACCESS_TOKEN` and `ZOHO_ORGANIZATION_ID` to `.env`

2. **Test the sync**:
   - Go to http://localhost:3000/clients
   - Click "Sync from Zoho"
   - Should work for 1 hour

3. **When token expires**:
   - You'll see error: "Failed to fetch contacts from Zoho Books"
   - Repeat Step 3 to get a new access token
   - Update `.env` with new token

---

## Production Setup

For production, you **must** implement token refresh:

1. ✅ Store `ZOHO_REFRESH_TOKEN` in environment variables
2. ✅ Implement `getZohoAccessToken()` utility
3. ✅ Use refresh token to automatically get new access tokens
4. ✅ Update `.env` to remove `ZOHO_ACCESS_TOKEN` (use refresh token instead)

---

## API Scopes Required

MarginDesk needs these Zoho Books scopes:

```
ZohoBooks.contacts.READ          # For syncing clients
ZohoBooks.customerpayments.READ  # For syncing cash receipts
ZohoBooks.invoices.READ          # For matching payments to invoices
```

If you need additional features, add these scopes:

```
ZohoBooks.projects.READ          # For syncing projects
ZohoBooks.purchaseorders.READ    # For syncing POs
```

---

## Troubleshooting

### "Invalid Client" Error
- Check that `CLIENT_ID` and `CLIENT_SECRET` are correct
- Verify redirect URI matches exactly (including trailing slash)

### "Invalid Code" Error
- Authorization codes expire in 60 seconds
- Generate a new code and use it immediately

### "Invalid Refresh Token" Error
- Refresh tokens can be invalidated if:
  - User changes password
  - User revokes access
  - Multiple refresh tokens generated (old ones invalidated)
- Solution: Generate new authorization code and refresh token

### "Organization Not Found" Error
- Check `ZOHO_ORGANIZATION_ID` is correct
- Use the GET organizations API to verify ID

### Sync Returns "Zoho Books credentials not configured"
- Ensure all required env variables are set:
  - `ZOHO_ORGANIZATION_ID`
  - `ZOHO_ACCESS_TOKEN` (or refresh token setup)

---

## Security Best Practices

1. **Never commit credentials**
   - Add `.env` to `.gitignore`
   - Use environment variables in production

2. **Use refresh tokens in production**
   - Don't rely on manually updated access tokens
   - Implement automatic token refresh

3. **Rotate secrets regularly**
   - Regenerate client secrets periodically
   - Update refresh tokens if compromised

4. **Limit API scopes**
   - Only request scopes you actually need
   - Review permissions regularly

---

## Testing the Setup

1. **Test token refresh**:
   ```bash
   curl -X POST https://accounts.zoho.com/oauth/v2/token \
     -d "refresh_token=YOUR_REFRESH_TOKEN" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "grant_type=refresh_token"
   ```

2. **Test contacts API**:
   ```bash
   curl -X GET "https://books.zoho.com/api/v3/contacts?organization_id=YOUR_ORG_ID" \
     -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN"
   ```

3. **Test sync in app**:
   - Navigate to http://localhost:3000/clients
   - Click "Sync from Zoho"
   - Verify success message and new clients appear

---

## Additional Resources

- [Zoho OAuth Documentation](https://www.zoho.com/accounts/protocol/oauth.html)
- [Zoho Books API Documentation](https://www.zoho.com/books/api/v3/)
- [API Console](https://api-console.zoho.com/)

---

## Support

If you encounter issues:
1. Check the browser console for detailed error messages
2. Check server logs: `pnpm dev` output
3. Verify all environment variables are set correctly
4. Test API credentials using cURL commands above
