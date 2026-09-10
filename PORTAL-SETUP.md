# Setting up the student portal

The portal login page and documents page are built to work with [Supabase](https://supabase.com), which gives you real tenant accounts and private document storage for free at this scale. Until you connect it, the portal runs as a preview: anyone can log in with any details and sees a sample documents page.

## 1. Create your Supabase project

1. Go to supabase.com and create a free account, then a new project. Pick any name and a strong database password (you won't need the password day to day, just keep it somewhere safe).
2. Wait for the project to finish setting up (a minute or two).

## 2. Run the database setup

1. In your project, go to the SQL Editor and open a new query.
2. Before running it: go to Storage in the sidebar and create a new bucket called exactly `tenant-documents`. Leave it **private** (not public) — that's what makes sure tenants can only see their own files.
3. Back in the SQL Editor, paste the contents of `supabase-schema.sql` (included alongside this file) and run it. This creates the documents table, the tenant_details table (for the "Your details" box), the maintenance_requests table (for maintenance reports), and the access rules so a tenant can only ever see and create their own rows.

## 3. Connect the website to your project

1. In your Supabase project, go to Settings -> API.
2. Copy the **Project URL** and the **anon public** key (not the "service_role" key — never put that one in this website, it bypasses all the access rules).
3. Open `assets/supabase-config.js` and paste them in:
   ```js
   const SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```
4. Save, and re-upload the site to wherever it's hosted. The portal now uses real logins.

## 4. Giving a tenant access

1. In Supabase, go to Authentication -> Users -> Add user.
2. Enter their email address and a temporary password, and untick "Auto confirm" only if you want them to verify their email first (leave it ticked for the simplest setup).
3. Optional but recommended: open "User Metadata" on the same screen and add `{"first_name": "Sarah"}` (with their actual first name). The dashboard greets them by this name — "Welcome back, Sarah". If you skip this, it falls back to guessing a name from their email address, which is not always right.
4. Tell the tenant their email and temporary password by whatever means you'd normally use (email, text). They can log in straight away at Portal Login on the site. There's no self-service "sign up" on the site on purpose, so you stay in control of who gets an account.

## 5. Uploading a document for a tenant

Each document needs two things: the file itself in Storage, and a row in the `documents` table pointing to it.

1. Find the tenant's user ID: Authentication -> Users, click their row, copy the ID (a long string like `3fa85f64-5717-4562-...`).
2. Go to Storage -> tenant-documents. Create a folder named exactly with that user ID, then upload the file into it (e.g. `3fa85f64-.../Tenancy-Agreement.pdf`).
3. Go to Table Editor -> documents -> Insert row, and fill in:
   - `user_id`: the same ID you just used for the folder
   - `name`: what the tenant should see, e.g. "Tenancy Agreement"
   - `category`: optional, e.g. "Signed 14 June 2025"
   - `valid_until`: optional, only relevant for things like certificates
   - `file_path`: the path inside the bucket, e.g. `3fa85f64-.../Tenancy-Agreement.pdf`
4. Save. The tenant will see it next time they log in or refresh the documents page. Download links are generated on the spot and expire after five minutes, so files are never left sitting on the open internet.

This is a click-through process in the Supabase dashboard, no code involved. If you end up adding documents often enough that this gets tedious, the next step would be a small upload page built just for you, which I can build once the basics above are live and working.

## 6. Filling in a tenant's "Your details" box

The property, tenancy period, and utility package shown on the documents page come from the `tenant_details` table, one row per tenant.

1. Find the tenant's user ID the same way as above: Authentication -> Users, click their row, copy the ID.
2. Go to Table Editor -> tenant_details -> Insert row, and fill in:
   - `user_id`: the tenant's user ID
   - `property`: e.g. "Horning Close"
   - `tenancy_period`: e.g. "2026/27 academic year"
   - `utility_package`: e.g. "Silver"
3. Save. Any field left blank just does not show a line for that tenant, rather than showing something wrong. If you skip this step for a tenant entirely, they will see a note asking them to contact the management team instead of blank or sample details.

**This step also switches on maintenance reporting.** The "Report a maintenance issue" form on the dashboard only appears once a tenant has a `property` set here — that's the "designated by admin" link between a tenant and their maintenance form. Until you set it, they see a message asking them to contact you directly instead of the form.

## 7. Handling a maintenance report

When a tenant submits the maintenance form, two things happen: it's saved to the `maintenance_requests` table (so it shows on their "Your reports" list and you have a permanent record), and it's emailed straight to houseagopropertiesltd@gmail.com the same way the contact form works, so you don't have to go looking in Supabase to notice a new one.

To see all reports, or update one as you work on it: Table Editor -> maintenance_requests. Change the `status` field to "In progress" or "Resolved" (typed exactly like that, capital letter) and the tenant sees the updated status next time they open the dashboard. There's no notification back to the tenant when you change the status — they check the dashboard, or you email them separately.

## 8. Setting up the admin page

There's also a private admin page at `admin.html` (not linked from the menu anywhere — you just go to it directly). It lets you do everything above from a simple page on the site itself instead of clicking through Supabase: add a tenant account and their details in one go, upload and delete their documents, and update maintenance report statuses. You still don't need any code for this — it's just a nicer front end onto the same database.

**One-off setup, do this once:**

1. In your Supabase project, go to Authentication -> Providers -> Email, and turn **off** "Confirm email". This lets a tenant you create log in immediately with the password you set, rather than needing to click a confirmation link first (which they'd never see, since it's you creating the account, not them).
2. Make sure you've run the latest `supabase-schema.sql` in the SQL Editor (the version alongside this file includes an "Admin support" section at the bottom — if you set up your project before this was added, just paste the whole file in and run it again, it's safe to re-run).
3. Create your own admin account the same way you'd create a tenant's (Authentication -> Users -> Add user), using your own email and a password you'll remember.
4. Copy your own user ID from that same screen, then in the SQL Editor run:
   ```sql
   insert into public.admins (user_id) values ('paste-your-user-id-here');
   ```
5. Go to `admin.html` on your site and log in with that email and password. You're now in the admin page.

**Using it day to day**, once set up:

- **Add a tenant**: fill in their email, a temporary password, and (optionally) their property/tenancy/utility details in the same form, then "Create tenant account". They can log in straight away with the email and password you set — send that to them however you'd normally get in touch.
- **All tenants**: every tenant you've created shows in a list. Click one (or "Manage") to open their panel.
- **Details**: edit and save their property, tenancy period, and utility package.
- **Documents**: pick a file, give it a name (and optionally a category and expiry date), and upload — it's stored and added to their document list in one step, no folders or table rows to fill in by hand. "Delete" removes a document for good.
- **Maintenance reports**: see everything a tenant has reported, and change the status with the dropdown next to each one (New / In progress / Resolved) — it updates on their dashboard immediately.

If you ever want a second admin (a colleague, say), create their account as normal and add their user ID to the `admins` table the same way you added your own — there's no limit on how many admins there can be.

## Notes

- Nothing about your public marketing pages changes. Only `portal.html`, `portal-dashboard.html`, and `admin.html` talk to Supabase.
- `admin.html` isn't linked from anywhere on the site, but it also isn't a secret by itself — anyone who finds the URL still has to log in, and only accounts listed in the `admins` table can do anything from it. That's enforced by the database, not by the page being hidden.
