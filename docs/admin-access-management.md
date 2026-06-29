# KunThai administrator access

KunThai administrator access is an assignment attached to an existing KunThai account. Never create a second account table, share administrator passwords, or place the Supabase service-role key in the browser.

## One-time: appoint the first Super Admin

1. Create the person’s normal KunThai account and verify its email.
2. In Supabase, open **Authentication → Users** and copy that user’s UUID.
3. Open **SQL Editor** and run:

```sql
select public.bootstrap_kunthai_chief_admin(
  'PASTE-AUTH-USER-UUID-HERE'::uuid,
  true
);
```

`true` appoints the first **Super Admin**. Use this bootstrap only for initial recovery/setup. Routine appointments belong in the Admin Team screen so they carry the signed-in actor and reason in the audit log.

## Add an administrator

1. Confirm the person already has a verified KunThai account.
2. Sign in at `/admin` with a Super Admin or Chief Admin account and complete MFA.
3. Open **Governance → Admin team → Add administrator**.
4. Enter the exact email used by the person’s KunThai account.
5. Select a role, sector scope, region scope, and authority level.
6. Enter a specific assignment reason, then choose **Grant admin access**.

A Chief Admin can appoint roles below Chief Admin. Only a Super Admin can appoint another Chief Admin or Super Admin. The new administrator uses their existing KunThai email to sign in at `/admin` and must complete MFA.

## Choose the position

- **Super Admin** — platform ownership, security recovery, and authority to appoint peer leadership. Keep this group very small.
- **Chief Admin** — all operational sectors, team management, audit history, and all admin-action alerts.
- **Operations Lead** — cross-sector cases and escalations without team appointment authority.
- **Explore / UrMall / Transport Manager** — operational leadership for one product sector.
- **Risk and Fraud Officer** — high-risk abuse and fraud investigations.
- **Reports and Safety Officer** — user/content reports and safety incidents.
- **Verification Officer** — seller, operator, company, document, and fleet checks.
- **Support Officer** — user requests, complaints, and disputes.
- **Finance Officer** — finance cases and approvals when the payment provider is connected.
- **Notification Officer** — user notification campaigns.
- **Technical Admin** — feature controls and technical operations.
- **Auditor** — read-only audit/case oversight.
- **Analyst** — read-only operational analytics.

Use the narrowest suitable role and sector. Authority levels are: **1 read/observe**, **2 routine handling**, **3 decisions**, **4 lead/escalation**, and **5 platform leadership**.

## Change a position or scope

Open **Admin team → Add administrator**, enter the same account email, and select the same role with the new scopes/authority. KunThai updates that assignment and writes `team.access_changed` to the immutable audit log. If the person is moving to a different role, grant the new role first, verify access, then revoke the old assignment.

## Remove an administrator

1. Open **Governance → Admin team**.
2. Find the exact person and role assignment.
3. Choose the remove-access icon and enter a concrete revocation reason.
4. Confirm the assignment shows **Revoked**.

Revocation removes only administrator privileges; it does not delete the person’s KunThai user account or their lawful product data. Administrators cannot revoke their own active assignment, Chief Admins cannot revoke equal/higher leadership, and the final Super Admin cannot be revoked.

## Verify the result

- Open **Governance → Audit log** and confirm the named actor, target action, reason, and time.
- Ask the appointed person to sign in at `/admin`; do not test by sharing credentials.
- For report roles, submit a harmless test report from a separate user account. It should appear in the relevant Reports or Support queue and produce an Admin Activity alert.
