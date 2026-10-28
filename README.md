# MATRYX ESPORTS — Tournament & Guild vs Guild Starter

Responsive static website with Supabase authentication/database setup for community Free Fire tournaments and Guild vs Guild (GvG).

## Features in this starter
- Responsive dark/red esports UI
- Email/password signup and login
- Player profile + Free Fire UID
- Admin-created tournaments; players can join
- Guild registration with admin approval
- Guild leaderboard based on admin-verified completed matches
- Admin match scheduling, tournament management, guild approval and monthly prize descriptions
- Monthly champion history table (admin can declare champions through Supabase for now)
- Supabase Row Level Security policies in `schema.sql`

## 1. Create the free backend
1. Create a project at https://supabase.com/ (free plan).
2. Open **SQL Editor** and run all of `schema.sql`.
3. Open **Project Settings → API** (or Connect) and copy the Project URL and `anon` / publishable key.
4. Open `config.js`; replace the two placeholder values. Never put a `service_role` key in `config.js` or any browser file.
5. In Supabase **Authentication → URL Configuration**, add your eventual website URL to Site URL and Redirect URLs. For local testing, use a local static server URL.

## 2. Make your account admin
1. Sign up on the website first.
2. In Supabase **SQL Editor**, run this command after replacing the email:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
   ```
3. Refresh the website. The Admin Control Room will appear inside My Dashboard.

Do not share your login password or service_role key. The public anon key is designed for browser use when RLS is configured.

## 3. Preview locally
You can upload the files to any static host. For local testing, from this folder run:
```bash
python -m http.server 8080
```
Then open `http://localhost:8080` in your browser. If opening from Android/Termux, keep the server running and use the phone browser.

## 4. Deploy free
- Upload this folder/repository to GitHub.
- In Cloudflare Pages, create a project from the repository, choose no build command, and set the output directory to `/` (or leave the root directory as default).
- Your free `*.pages.dev` URL will be assigned after deploy.

## Important honest limitations
- Free service plans have usage limits and may change.
- This is a starter project, not a fully audited production platform.
- For safety, the browser cannot use the Supabase service_role key. RLS is required.
- Guild challenge acceptance, automatic champion declaration, roster UI, room credentials, match evidence uploads, push notifications, and automated prize payout are not fully implemented in this starter. The database has basic membership/champion tables, but those workflows need a further development pass.
- Monthly prize is a description/tracking feature, not a payment system. You are responsible for actually providing any prize you advertise.
- Use only authorized Free Fire tournament formats and follow Garena's current rules. This is an independent community project and is not affiliated with Garena.
