# OAuth Configuration Guide

**Status**: ✅ **Fully Implemented** (Requires OAuth App Setup)

---

## Overview

InterviewLM supports authentication via:
- ✅ **GitHub OAuth**
- ✅ **Google OAuth**
- ✅ **Email/Password** (Credentials)

All providers are configured in `auth.config.ts` and the sign-in UI (`app/auth/signin/page.tsx:82-127`) includes OAuth buttons.

---

## GitHub OAuth Setup

### 1. Create GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click **"New OAuth App"**
3. Fill in the application details:

   ```
   Application name: InterviewLM (Dev)
   Homepage URL: http://localhost:3000
   Authorization callback URL: http://localhost:3000/api/auth/callback/github
   ```

4. Click **"Register application"**
5. Copy the **Client ID**
6. Click **"Generate a new client secret"**
7. Copy the **Client Secret** (you won't be able to see it again!)

### 2. Add Environment Variables

In `.env.local`:

```bash
GITHUB_CLIENT_ID="your-github-client-id-here"
GITHUB_CLIENT_SECRET="your-github-client-secret-here"
```

### 3. Production Setup

For production deployment:

1. Create a **new** OAuth App with production URLs:
   ```
   Homepage URL: https://your-domain.com
   Authorization callback URL: https://your-domain.com/api/auth/callback/github
   ```

2. Add to production environment variables (Vercel, AWS, etc.):
   ```bash
   GITHUB_CLIENT_ID="prod-client-id"
   GITHUB_CLIENT_SECRET="prod-client-secret"
   ```

---

## Google OAuth Setup

### 1. Create Google OAuth App

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a new project (or select existing)
3. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
4. Configure the OAuth consent screen if prompted:
   - User Type: **External**
   - App name: **InterviewLM**
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `email` and `profile` (default)

5. Back to **"Create OAuth client ID"**:
   - Application type: **Web application**
   - Name: **InterviewLM (Dev)**
   - Authorized JavaScript origins:
     ```
     http://localhost:3000
     ```
   - Authorized redirect URIs:
     ```
     http://localhost:3000/api/auth/callback/google
     ```

6. Click **"Create"**
7. Copy the **Client ID** and **Client Secret**

### 2. Add Environment Variables

In `.env.local`:

```bash
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### 3. Production Setup

For production:

1. Add production URLs to the same OAuth client:
   - Authorized JavaScript origins:
     ```
     https://your-domain.com
     ```
   - Authorized redirect URIs:
     ```
     https://your-domain.com/api/auth/callback/google
     ```

2. **OR** create a separate production OAuth client

3. Add to production environment variables:
   ```bash
   GOOGLE_CLIENT_ID="prod-client-id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="prod-client-secret"
   ```

---

## Verification

### 1. Check Environment Variables

Make sure `.env.local` contains all required OAuth credentials:

```bash
# GitHub OAuth
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."

# Google OAuth
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."

# NextAuth (required)
NEXTAUTH_SECRET="your-secret-here"  # Generate: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
```

### 2. Test OAuth Flow

**GitHub:**
1. Visit `http://localhost:3000/auth/signin`
2. Click **"Continue with GitHub"**
3. Authorize the app in GitHub
4. Should redirect to `/dashboard`

**Google:**
1. Visit `http://localhost:3000/auth/signin`
2. Click **"Continue with Google"**
3. Select Google account and authorize
4. Should redirect to `/dashboard`

### 3. Verify Database

After successful OAuth signin, check the database:

```sql
-- User should be created
SELECT * FROM users WHERE email = 'your@email.com';

-- Account should be linked
SELECT * FROM accounts WHERE provider = 'github' OR provider = 'google';

-- Organization should be auto-created
SELECT * FROM organizations WHERE slug LIKE '%your-email%';

-- User should be OWNER of organization
SELECT * FROM organization_members WHERE role = 'OWNER';
```

---

## How OAuth Works in InterviewLM

### Authentication Flow

```
1. User clicks "Continue with GitHub/Google" → auth/signin/page.tsx:47-55
2. NextAuth redirects to OAuth provider
3. User authorizes on provider's site
4. Provider redirects back with code → /api/auth/callback/[provider]
5. NextAuth exchanges code for tokens
6. PrismaAdapter creates/updates user → auth.ts:13
7. Organization auto-creation (if new user) → app/api/auth/register/route.ts
8. JWT session created → auth.ts:18-24
9. Redirect to /dashboard
```

### Code References

| Feature | File | Lines |
|---------|------|-------|
| OAuth Providers | `auth.config.ts` | 2-17 |
| OAuth Buttons | `app/auth/signin/page.tsx` | 82-127 |
| OAuth Handler | `auth.ts` | 1-32 |
| Callback Route | NextAuth internal | `/api/auth/callback/[provider]` |

### Auto-Created Resources

When a user signs in with OAuth for the first time:

1. **User** created in `users` table
2. **Account** linked in `accounts` table (provider + providerAccountId)
3. **Organization** auto-created (via PrismaAdapter or callback)
4. **OrganizationMember** created with role=OWNER
5. **Free trial credits** (3) added to organization

---

## Troubleshooting

### "Invalid callback URL"

**Problem**: OAuth provider rejects the callback URL.

**Solution**:
- Make sure the redirect URI is **exactly** registered in OAuth app
- Check for trailing slashes (don't include them)
- Verify the domain matches (http vs https)

### "Configuration error"

**Problem**: Environment variables not set.

**Solution**:
- Check `.env.local` file exists in project root
- Restart the dev server after adding env vars
- Use `process.env.GITHUB_CLIENT_ID` to verify (add console.log in auth.config.ts)

### User created but no organization

**Problem**: OAuth user signs in but doesn't have an organization.

**Solution**:
- Check the registration callback in auth.ts
- Manual fix: Run SQL to create organization for existing user:

```sql
-- 1. Create organization
INSERT INTO organizations (id, name, slug, plan, credits)
VALUES ('org-xxx', 'My Org', 'my-org', 'FREE', 3);

-- 2. Link user to organization
INSERT INTO organization_members (id, organization_id, user_id, role)
VALUES ('member-xxx', 'org-xxx', 'user-id-here', 'OWNER');
```

### Database adapter errors

**Problem**: PrismaAdapter fails to create user/account.

**Solution**:
- Run migrations: `npx prisma migrate dev`
- Check database connection (DATABASE_URL in .env.local)
- Verify schema is up to date: `npx prisma generate`

---

## Security Best Practices

### Client Secrets

- ✅ **Never commit** client secrets to git
- ✅ Use different secrets for dev/prod
- ✅ Store in secure environment variables (Vercel Secrets, AWS Secrets Manager)
- ✅ Rotate secrets periodically

### Redirect URIs

- ✅ Only whitelist exact URLs you control
- ✅ Use HTTPS in production
- ✅ Don't use wildcards

### Scopes

Both providers request minimal scopes:
- **Email**: To identify user
- **Profile**: For name and avatar

No additional permissions requested (no write access to GitHub/Google data).

---

## Next Steps

1. ✅ Configure OAuth apps (GitHub + Google)
2. ✅ Add environment variables
3. ✅ Test signin flow
4. ✅ Verify organization auto-creation
5. ✅ Set up production OAuth apps before deployment

---

**Last Updated**: 2025-11-15
**Implementation Status**: Complete (Backend + Frontend)
**Estimated Setup Time**: 15-20 minutes per provider
