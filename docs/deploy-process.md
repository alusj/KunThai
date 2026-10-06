# Testing changes before they go public

The public site is built from `main`. Nothing goes to `main` until it has been
checked automatically and tried by hand on a private preview.

## The flow

1. **Work on a branch**, never directly on `main`.
2. **Push the branch.** Two things happen on their own:
   - **CI** (`.github/workflows/ci.yml`) runs lint, the translation check, the
     unit tests and a production build. A red check means the change is not ready.
   - **Vercel** builds a private preview of that branch at its own URL. Find it
     in the Vercel dashboard under Deployments, or on the pull request.
3. **Try the change on the preview**, on a phone as well as a laptop.
4. **Open a pull request into `main`.** Merge only when CI is green and the
   preview looks right. Merging publishes to the public site.
5. **If something slips through**, use Vercel → Deployments → the previous
   production deployment → *Instant Rollback*.

## One-time setup (done in the dashboards, not in code)

- **GitHub → Settings → Branches → add a rule for `main`**: require a pull
  request and require the **CI / Lint, test and build** check to pass.
- **Vercel → Settings → Environment Variables → Preview**: give previews their
  own values so testing never touches real users or real money:
  - a separate Supabase project (URL + anon key + service key),
  - Monime and Flutterwave **test/sandbox** keys,
  - WhatsApp OTP pointed at a test number, or disabled.

## Things a preview cannot test

- **Cron jobs** in `vercel.json` only run on production. Call the endpoint on
  the preview URL by hand to test one.
- **Payment webhooks** are registered against the production URL; use the
  provider's sandbox webhook settings to aim one at a preview.
- **The native iOS/Android apps** bundle the web build at release time, so a
  preview tests the web app. Test native-only behaviour with a local build.
