# Integration Setup Guide

This file explains exactly what you need to do to finish the MongoDB + Auth.js + Resend integration.

## What You Need To Set Up

You need 3 external pieces configured:

1. A MongoDB database
2. A Resend account with a verified sender
3. Environment variables in this project and in your deployment platform

The app code is already wired to read these variables from:

- local development: `.env.local`
- production: your hosting provider's environment variable settings

## Step 1: Fill In `.env.local`

The file to edit is:

- [.env.local](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/stochastic-app-DB/.env.local)

These are the variables the app expects:

```bash
AUTH_SECRET=
MONGODB_URI=
MONGODB_DB=
AUTH_RESEND_KEY=
AUTH_EMAIL_FROM=
AUTH_URL=
AUTH_TRUST_HOST=true
```

What each one means:

- `AUTH_SECRET`: random secret used by Auth.js
- `MONGODB_URI`: MongoDB connection string
- `MONGODB_DB`: database name used by both Auth.js and your app data
- `AUTH_RESEND_KEY`: your Resend API key
- `AUTH_EMAIL_FROM`: the verified sender email address Resend is allowed to send from
- `AUTH_URL`: the full base URL of the app
- `AUTH_TRUST_HOST`: leave this as `true`

## Step 2: Generate `AUTH_SECRET`

Run this in your terminal:

```bash
openssl rand -base64 32
```

Paste the output into:

```bash
AUTH_SECRET=PASTE_THE_OUTPUT_HERE
```

## Step 3: Set Up MongoDB

If you are using MongoDB Atlas:

1. Create a project.
2. Create a cluster.
3. Create a database user.
4. Add your IP address to Network Access.
5. Copy the connection string from Atlas.

Put the connection string into:

```bash
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
```

Then choose one database name and put it here:

```bash
MONGODB_DB=markov_side_by_side
```

Important:

- use the same `MONGODB_DB` for both auth data and saved simulations
- if your password contains special characters, URL-encode it in the URI

If you are using local MongoDB instead:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=markov_side_by_side
```

## Step 4: Set Up Resend

1. Create a Resend account.
2. Verify a sending domain in Resend.
3. Create an API key with email sending access.
4. Choose a sender address on that verified domain.

Put the API key here:

```bash
AUTH_RESEND_KEY=re_xxxxxxxxxxxxxxxxx
```

Put the verified sender email here:

```bash
AUTH_EMAIL_FROM=login@yourdomain.com
```

Important:

- `AUTH_EMAIL_FROM` must be a sender that Resend accepts for your account
- in production, this should come from your verified domain
- if this address is not verified properly, magic-link emails will fail

## Step 5: Set The App URL

For local development:

```bash
AUTH_URL=http://localhost:3000
```

For production, use your real domain:

```bash
AUTH_URL=https://yourdomain.com
```

Keep this set:

```bash
AUTH_TRUST_HOST=true
```

## Step 6: Install Dependencies

If you have not already done so:

```bash
npm install
```

## Step 7: Run The App

Start the dev server:

```bash
npm run dev
```

Then open:

- [http://localhost:3000](http://localhost:3000)

## Step 8: Test The Auth Flow

Do this in order:

1. Go to `/login`
2. Enter your email
3. Confirm the email arrives from Resend
4. Click the magic link
5. Confirm you are redirected back into the app
6. Confirm the navbar now shows dashboard/logout state

## Step 9: Test Saved Simulations

After logging in:

1. Open `/gillespie`
2. Enter a model name in the save area
3. Click `Save New`
4. Confirm it succeeds
5. Repeat on `/ctmp-inhomo`
6. Repeat on `/sde`
7. Open `/dashboard`
8. Confirm the saved models appear
9. Open one from the dashboard
10. Confirm the editor state loads correctly
11. Click `Update`
12. Confirm changes persist
13. Delete one model from the dashboard
14. Confirm it disappears

## Step 10: Add The Same Variables In Production

On your deployment provider, add the exact same variable names:

- `AUTH_SECRET`
- `MONGODB_URI`
- `MONGODB_DB`
- `AUTH_RESEND_KEY`
- `AUTH_EMAIL_FROM`
- `AUTH_URL`
- `AUTH_TRUST_HOST`

Do not rename them.

The app is already coded to read those exact names.

## Where Each Secret Goes

### MongoDB connection string

Put it in:

```bash
MONGODB_URI=
```

### MongoDB database name

Put it in:

```bash
MONGODB_DB=
```

### Resend API key

Put it in:

```bash
AUTH_RESEND_KEY=
```

### Resend sender email

Put it in:

```bash
AUTH_EMAIL_FROM=
```

### Auth.js secret

Put it in:

```bash
AUTH_SECRET=
```

### App base URL

Put it in:

```bash
AUTH_URL=
```

## If Something Fails

### No login email arrives

Check:

- `AUTH_RESEND_KEY`
- `AUTH_EMAIL_FROM`
- Resend domain verification
- spam folder

### Login link opens but auth fails

Check:

- `AUTH_SECRET`
- `AUTH_URL`
- `AUTH_TRUST_HOST=true`

### Saving models fails

Check:

- `MONGODB_URI`
- `MONGODB_DB`
- MongoDB IP access rules
- MongoDB user permissions

### App boots but dashboard/save endpoints error

Check server logs and confirm:

- MongoDB is reachable
- Resend key is valid
- all env vars are actually loaded in the runtime

## Final Checklist

- `.env.local` is filled in
- MongoDB is reachable
- Resend sender/domain is verified
- `npm run dev` starts cleanly
- `/login` sends a magic link
- `/dashboard` loads after sign-in
- all three simulators can save and reopen models
