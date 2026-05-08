# Supabase setup

## 1. Run the initial migration

1. Open your Supabase project
2. Go to **SQL Editor** → **New query**
3. Open `migrations/0001_init.sql` and paste the entire contents
4. Click **Run**
5. Confirm tables appear under **Database → Tables**: `profiles`, `traces`, `spans`, `feedback`, `rule_violations`, `backend_heartbeat`, `audit_log`, `api_keys`

## 2. Get the JWT secret for backend verification

1. **Project Settings → API → JWT Settings**
2. Copy the **JWT Secret** (click the reveal eye)
3. Paste into `.env` as `SUPABASE_JWT_SECRET=...`

## 3. (Optional, can do later) Custom SMTP via Resend

Lets your auth emails come from your own domain instead of Supabase's branded sender.

1. **Project → Authentication → Emails → SMTP Settings**
2. Enable **Custom SMTP**
3. Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: your `RESEND_API_KEY`
4. Sender email + name: anything you want
5. Save

## 4. Make yourself an admin

After signing up via the Next.js app, run this in SQL Editor (replace the email):

```sql
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = 'you@example.com');
```
