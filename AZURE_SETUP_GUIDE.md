# Azure AD App Registration Setup Guide

## Step 1: Create App Registration

1. Go to **Azure Portal**: https://portal.azure.com
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **+ New registration**

### Registration Details:
```
Name: MarginDesk Local Dev
Supported account types: Accounts in this organizational directory only (Single tenant)
Redirect URI:
  - Platform: Web
  - URL: http://localhost:3001/api/auth/callback/azure-ad
```

4. Click **Register**

---

## Step 2: Note Your IDs

After registration, copy these values (you'll need them for `.env`):

1. **Application (client) ID**:
   - Found on the Overview page
   - Example: `12345678-1234-1234-1234-123456789abc`
   - Goes in `.env` as `AZURE_AD_CLIENT_ID`

2. **Directory (tenant) ID**:
   - Found on the Overview page
   - Example: `87654321-4321-4321-4321-cba987654321`
   - Goes in `.env` as `AZURE_AD_TENANT_ID`

---

## Step 3: Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **+ New client secret**
3. Description: `MarginDesk Dev Secret`
4. Expires: **6 months** (for dev) or **24 months** (for prod)
5. Click **Add**
6. **IMPORTANT**: Copy the **Value** immediately (you won't see it again!)
   - Goes in `.env` as `AZURE_AD_CLIENT_SECRET`

---

## Step 4: Configure API Permissions

### For NextAuth (User Login):
1. Go to **API permissions**
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Select **Delegated permissions**
5. Add these permissions:
   - ✅ `openid`
   - ✅ `profile`
   - ✅ `email`
   - ✅ `User.Read`

### For Microsoft Graph API (User Sync):
1. Click **+ Add a permission** again
2. Select **Microsoft Graph**
3. Select **Application permissions** (not Delegated)
4. Add these permissions:
   - ✅ `User.Read.All` - Read all users' profiles
   - ✅ `Directory.Read.All` - Read directory data

5. Click **Grant admin consent for [Your Organization]**
   - **Important**: This requires admin rights
   - All permissions should show green checkmarks

---

## Step 5: Configure Authentication Settings

1. Go to **Authentication**
2. Under **Platform configurations** → **Web**, verify:
   - Redirect URIs: `http://localhost:3001/api/auth/callback/azure-ad`
3. Under **Implicit grant and hybrid flows**:
   - ✅ Check **ID tokens** (for NextAuth)
4. Under **Advanced settings**:
   - Allow public client flows: **No**
5. Click **Save**

---

## Step 6: Add Production Redirect URI (Later)

When deploying to production, add:
```
https://margindesk.yourcompany.com/api/auth/callback/azure-ad
```

---

## Summary of Values Needed

Copy these to your `.env` file:

```bash
AZURE_AD_CLIENT_ID="your-application-client-id-here"
AZURE_AD_CLIENT_SECRET="your-client-secret-value-here"
AZURE_AD_TENANT_ID="your-directory-tenant-id-here"
```

---

## Verification Checklist

- [ ] App registration created
- [ ] Client ID copied
- [ ] Tenant ID copied
- [ ] Client secret created and copied
- [ ] Redirect URI configured: `http://localhost:3001/api/auth/callback/azure-ad`
- [ ] Delegated permissions added: openid, profile, email, User.Read
- [ ] Application permissions added: User.Read.All, Directory.Read.All
- [ ] Admin consent granted (green checkmarks)
- [ ] ID tokens enabled under Authentication

---

**Once you have these 3 values, we'll update the `.env` file and configure NextAuth!**
