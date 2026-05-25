# Supabase Project Migration Guide

## Overview
Migration from US-region Supabase to Asia-region (Seoul, ap-northeast-2).

- **Old project**: `mlnhznrtqwgjsaaesrlh` (US West 2)
- **New project**: `pzozanrirwjnlrgvqlzj` (Seoul, ap-northeast-2)

---

## Prerequisites

Install PostgreSQL client tools (needed because Supabase CLI runs pg_dump inside Docker, which fails through VPN):

```bash
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## Step 1: Dump Schema & Data from Old Project

Use the **session-mode pooler** (port 5432) instead of direct connection (VPN blocks direct DB hostnames).

```bash
# Find your pooler URL in: Supabase Dashboard -> Settings -> Database -> Connection string -> URI

# Schema
pg_dump "postgresql://postgres.<OLD_REF>:<PASSWORD>@<POOLER_HOST>:5432/postgres" \
  --schema-only --no-owner --no-privileges -f schema.sql

# Data
pg_dump "postgresql://postgres.<OLD_REF>:<PASSWORD>@<POOLER_HOST>:5432/postgres" \
  --data-only --no-owner --no-privileges -f data.sql
```

**Note:** If password contains special characters (e.g. `?`), URL-encode them (`?` -> `%3F`).

### Example (this migration):
```bash
# Schema
pg_dump "postgresql://postgres.mlnhznrtqwgjsaaesrlh:<REDACTED_PASSWORD>@aws-0-us-west-2.pooler.supabase.com:5432/postgres" \
  --schema-only --no-owner --no-privileges -f schema.sql

# Data
pg_dump "postgresql://postgres.mlnhznrtqwgjsaaesrlh:<REDACTED_PASSWORD>@aws-0-us-west-2.pooler.supabase.com:5432/postgres" \
  --data-only --no-owner --no-privileges -f data.sql
```

---

## Step 2: Restore to New Project

```bash
# Schema first
psql "postgresql://postgres.<NEW_REF>:<PASSWORD>@<NEW_POOLER_HOST>:5432/postgres" \
  -f schema.sql

# Then data
psql "postgresql://postgres.<NEW_REF>:<PASSWORD>@<NEW_POOLER_HOST>:5432/postgres" \
  -f data.sql
```

### Example (this migration):
```bash
psql "postgresql://postgres.pzozanrirwjnlrgvqlzj:<REDACTED_PASSWORD>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres" \
  -f schema.sql

psql "postgresql://postgres.pzozanrirwjnlrgvqlzj:<REDACTED_PASSWORD>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres" \
  -f data.sql
```

**Expected errors during restore:**
- `schema "auth" already exists` / `permission denied for schema auth` -> Supabase-managed, safe to ignore
- `permission denied for schema storage` -> Supabase-managed, safe to ignore
- `function ... already exists` -> Internal functions, safe to ignore

---

## Step 3: Grant Table Permissions

`pg_dump --no-privileges` strips grants. You must re-grant access to Supabase roles:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role;
```

Run via:
```bash
psql "postgresql://postgres.<NEW_REF>:<PASSWORD>@<NEW_POOLER_HOST>:5432/postgres" -c "
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role;
"
```

---

## Step 4: Update .env

Update `mobile_app/.env` to point to the new project:

```
EXPO_PUBLIC_SUPABASE_URL=https://<NEW_REF>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<new anon key from Dashboard -> Settings -> API>
```

---

## Step 5: Re-register Users

Auth users (`auth.users`) cannot be migrated via SQL dump. Users must re-register on the new project. If old data should remain accessible, the new user UUIDs must match the old `user_id` values in the tables.

---

## Step 6: Clear App Cache & Rebuild

```bash
# Kill Metro
lsof -ti:8081 | xargs kill -9

# Restart with clean cache
npx expo start --port 8081 --clear

# In iOS Simulator: Device -> Erase All Content and Settings (clears old session tokens)
# In Xcode: Cmd+R to rebuild
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `198.18.0.x` IP in errors | VPN intercepting DNS | Use pooler URL instead of direct `db.xxx.supabase.co` |
| `Tenant or user not found` | Wrong pooler region | Check exact pooler URL in Supabase Dashboard |
| `permission denied for table` | Missing GRANT or RLS policy | Run Step 3 grants; verify policies exist |
| Blank screen after migration | Stale session in SecureStore | Erase simulator content and re-login |
| `server closed the connection` | VPN blocking port 5432 direct | Use session-mode pooler (port 5432 on pooler host) |

---

## Key Lessons

1. **Always use the pooler URL** from the Supabase Dashboard - don't guess the region prefix (`aws-0` vs `aws-1`).
2. **`pg_dump --no-privileges` strips both RLS policies AND table grants** - you must restore both.
3. **Auth data doesn't transfer** - plan for user re-registration.
4. **VPN causes Docker DNS failures** - use native `pg_dump`/`psql` (install via `brew install libpq`).
5. **Special characters in passwords** must be URL-encoded in connection strings.
