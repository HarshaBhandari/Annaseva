# AnnaSeva

AnnaSeva is a ration distribution demo built with React, TanStack Start, a Node.js API, and MySQL 8.

## Requirements

- Git
- Node.js 22 or newer and npm
- MySQL 8

## Setup on Windows

Clone the team repository and install the locked dependencies:

```powershell
git clone https://github.com/HarshaBhandari/Annaseva.git
cd Annaseva
npm ci
```

Start the MySQL service. For a new local database, run the complete database file once from Command Prompt. It creates all current tables and adds synthetic demo shops, ration items, entitlements, stock, and forecasts:

```cmd
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < "mysql\annaseva.mysql.sql"
```

This is the only SQL file needed for a fresh setup. It does not contain user accounts or beneficiary personal data; each friend should create their own account in the app. Do not run this file against an existing/live database because its demo seed statements can reset demo inventory values.

For an existing database created from an older version, apply the relevant upgrade scripts once instead of running the fresh-install file. Do not run these upgrades on a database initialized by the current `annaseva.mysql.sql`:

```cmd
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < "mysql\upgrade_verification_ops.sql"
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < "mysql\upgrade_ration_registration.sql"
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < "mysql\upgrade_household_bookings.sql"
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < "mysql\upgrade_beneficiary_profile_details.sql"
```

Copy the MySQL template to `.env` and set `MYSQL_PASSWORD` to your local MySQL password. Keep `.env` private; it is excluded from Git.

```cmd
copy .env.example .env
notepad .env
```

Start both the API and web app:

```cmd
npm run dev
```

Open [http://localhost:8081](http://localhost:8081). Keep the terminal open while using the app. The API listens on port 3001 and is available through the Vite `/api` proxy; MySQL is not exposed to browser code. If port 8081 is already in use, stop the other process before starting the app.

## Team Workflow

For a private GitHub repository, the repository owner must add each member under **Settings > Collaborators and teams**. Each member should work on a separate branch and open a pull request into `main`:

```powershell
git switch -c feature/short-description
git add .
git commit -m "Describe the change"
git push -u origin feature/short-description
```

Never commit `.env`, database passwords, access tokens, or real beneficiary data. `.env.example` contains placeholder settings for local setup.

## Accounts

Create beneficiary or shopkeeper accounts from the app's sign-up page. Admin signup is intentionally disabled. To promote a trusted existing account, replace the email and run this in MySQL:

```sql
DELETE ur FROM user_roles ur
JOIN app_users u ON u.id = ur.user_id
WHERE u.email = 'admin@example.com';

INSERT INTO user_roles (id, user_id, role)
SELECT UUID(), id, 'admin'
FROM app_users
WHERE email = 'admin@example.com';
```

This switches the app runtime to MySQL. The original hosted Supabase project, if any, is separate and is not modified or deleted by this code change.

## Verification and Operations

Beneficiaries request and verify a development-only OTP, submit only the last four Aadhaar digits for manual admin review, and can book only after approval. In development, the simulated OTP is shown in the app; no SMS is sent. This demo does not verify Aadhaar with UIDAI and does not collect face images, fingerprints, or biometric templates. Production verification requires an approved identity/SMS provider and any required consent, legal review, and hardware.

The beneficiary profile can display household names, Aadhaar address and linked mobile, scheme, and FPS contact/location when these are present in the database. The current app does not connect to UIDAI or a ration-card registry, so those details must come from a verified, authorized import/provider integration; the new nullable profile fields and `ration_card_members` table only provide storage and display support.

Beneficiaries can select collection dates from tomorrow through the end of the current month; next month's ration can only be booked next month. Accounts registered with the same ration-card number share a household limit of one booking per collection month. Mobile OTP verification is required again each month before booking, along with admin identity approval. The admin dashboard lists households with no recorded distribution for three months.

Admins can review identity submissions, open/close shops, approve/reject stock refill requests, view stock and operational alerts, monitor uncollected entitlements, and resolve complaints. Shopkeepers can review complaints for their shop, respond to beneficiaries, track refill requests, and see booking/shop/refill notifications.
