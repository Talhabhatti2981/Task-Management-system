# TaskFlow

TaskFlow stores employee profiles and tasks in Supabase. Administrators can invite employees, assign tasks, and review team activity. Employees can set their own password from the invitation email and manage their own tasks.

## Supabase setup

1. Run `supabase/schema.sql` in the Supabase SQL Editor.
2. In Supabase Authentication, create the first administrator using the email you want to use for the `Admin` login alias.
3. Promote that account by running this SQL with the administrator's email:

   ```sql
   update public.profiles
   set role = 'admin'
   where user_id = (
     select id from auth.users
     where lower(email) = lower('admin@example.com')
   );
   ```

4. Add the following values to `.env`. `ADMIN_EMAIL` must match the Auth account created above.

   ```text
   SUPABASE_URL=your-project-url
   SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   SUPABASE_SECRET_KEY=your-secret-key
   ADMIN_EMAIL=admin@example.com
   ```

5. Configure Supabase Auth email delivery (SMTP) and add your local and deployed app URLs to the Auth redirect URL allowlist. Invitation links return to the app where employees create their passwords.
6. Start the app with `npm run dev`.

The `Admin` username is an alias for `ADMIN_EMAIL`; its password is managed by Supabase Auth. Do not use the example password `admin123` for a real deployment. Keep `SUPABASE_SECRET_KEY` server-side and set it in the server environment of the deployment host. Never expose it as a `VITE_` variable.

## Data and access

- `profiles` stores each Auth user's role, employee link, and last active time.
- `members` stores employee details and invitation linkage.
- `tasks` stores each task and its assignment.
- Row Level Security is enabled. The app accesses data through authenticated server API routes; administrators can view the whole team, and members can access only their own tasks.