# KunThai admin case controls and decisions

This guide explains the admin workspace, the case drawer, every important case-control button, the decision buttons, and the current path for verifying operators, sellers, companies, fleets, and Area View submissions.

The most important rule is this: statuses manage the case workflow, while decisions change the actual source record when the backend supports that case type. A status update can move work along without approving or rejecting the underlying user, seller, operator, post, or location.

## Who can do what

Admin access is controlled by role, sector scope, and authority level.

- `cases.view`: can see accessible cases.
- `cases.manage`: can claim cases, update case status, add notes, and apply decisions.
- `cases.approve`: can review sensitive decision approvals.
- Authority level 3: required for `Approve`, `Reject`, `Remove content`, `Restrict`, and `Suspend`.
- Authority level 4: required to approve another admin's sensitive action request.
- Super Admin: can apply `Remove content` and `Suspend` without the extra approval step.

For normal verification work, a Verification Officer or sector manager with the correct sector scope should handle the case. For high-risk actions, use a second administrator for approval.

## Main admin areas

- Command center: summary cards, urgent work, queue load, and sector shortcuts.
- My work: assigned and unassigned cases available to handle.
- Users: user directory and account-status controls.
- Explore: content, profiles, adverts, reports, and community safety.
- UrMall: seller, product, order, dispute, and marketplace verification work.
- Transport: operator, fleet, company, trip, incident, and Area View work.
- Verification: seller, operator, company, fleet, document, and profile review queue.
- Reports and safety: content reports, fraud, safety incidents, and Area View validation.
- Support and disputes: My Voice, user, seller, order, trip, and operator support.
- Notifications: platform notification campaigns.
- Finance: finance cases. Live money movement is still disabled until the payment provider is connected.
- Analytics: workload and SLA overview.
- Admin team: grant and revoke admin assignments.
- Audit log: immutable record of admin decisions, access changes, approvals, and settings changes.
- Settings: high-impact feature flags.

## Queue and case-table buttons

- `Refresh`: reloads the dashboard summary and latest cases.
- `Open queue`: moves from the command center into the work queue.
- Sector cards, such as `Explore`, `UrMall`, and `Transport`: open that sector's case view.
- Search field: searches case number, title, description, sector, queue, type, country, and source metadata.
- Status filter: shows open work, new cases, in-review cases, waiting-information cases, resolved cases, or all cases.
- Content-type filter: limits the queue to one case type, such as seller verification, operator verification, or reported post.
- Case row: opens the case drawer.
- Arrow button on a case row: also opens the case drawer.
- Global country scope: filters cases by country when the case source contains country information.

## Case drawer sections

When you open a case, the drawer shows:

- Case number, sector, queue, priority, title, description, status, type, country, opened time, and SLA due time.
- Reported or attached content. For posts, comments, profiles, locations, and media, this is where you inspect the source.
- Source information. This is raw metadata from the source record.
- Attachments and evidence. This can include screenshots, recordings, documents, fleet photos, IDs, or registration evidence.
- Sensitive action approvals, when another admin requested an action that needs a second person.
- Case controls, if your role has `cases.manage`.
- Internal notes.

## Case drawer buttons

- `Close case` / `X`: closes the drawer without changing the case.
- `Open map point`: opens a linked Area View/location point when the case has coordinates.
- `Open file`: opens a document or evidence attachment in a new tab.
- Image tile: opens an image preview.
- Video or audio controls: lets the admin play submitted media evidence.
- Media preview `X`: closes the media preview.
- Approval `Approve`: approves a pending sensitive action request. Requires `cases.approve`, authority level 4, and a different admin from the requester.
- Approval `Reject`: rejects a pending sensitive action request and returns the case to `in_review`.
- Status dropdown: chooses the workflow state for the case.
- `Update status`: saves the selected workflow status. This does not approve/reject the source record by itself.
- `Claim case`: assigns the case to you. If the case is `new`, `triaged`, or `reopened`, it becomes `assigned`.
- Decision dropdown: chooses the actual admin decision to apply.
- `Apply decision`: applies the selected decision with the required reason. Some source records are updated immediately; `Remove content` and `Suspend` may create an approval request instead.
- Required decision reason box: the explanation written to the case, case event, and audit log.
- Internal note box: private admin context for the next reviewer.
- `Add note`: saves the internal note.

## Case statuses

- `new`: the case was created and has not been triaged.
- `triaged`: someone reviewed the case enough to know what queue or action it needs.
- `assigned`: the case has an owner.
- `in_review`: the owner is checking evidence, policy, history, or documents.
- `waiting_information`: the admin needs more information from the user, seller, operator, or another source.
- `action_proposed`: an admin has prepared an action but it has not fully completed.
- `approval_required`: a sensitive action is waiting for a second admin.
- `actioned`: an action was taken but the case is not fully resolved yet.
- `appeal_window`: the user may still appeal or the admin is waiting through a dispute window.
- `resolved`: the admin decision is complete.
- `closed`: the case is fully closed after resolution and any appeal/retention period.
- `reopened`: a closed or resolved case came back because of an appeal, new information, or a repeated issue.

Use statuses to describe work progress. Use decisions when you are ready to change the outcome.

## Decision buttons

The current decision options are:

- `Approve`: approves a verification or validates a source when the case type supports approval.
- `Reject`: rejects a verification or declines a source when the case type supports rejection.
- `Dismiss`: closes a report or concern because it is not actionable, is false, lacks evidence, or does not violate policy.
- `Remove content`: for supported Explore post reports, marks the report reviewed and blocks the reported post. It needs authority level 3 and, unless the actor is a Super Admin, second-admin approval.
- `Restrict`: for supported Explore post reports, blocks/restricts the reported post. It needs authority level 3.
- `Suspend`: records a suspension decision. It needs authority level 3 and, unless the actor is a Super Admin, second-admin approval. Use the Users account control for platform account status.
- `Resolve`: closes the case with a general resolution and no special source-record change.
- `Request information`: moves the case to `waiting_information` and keeps it unresolved.

Every decision requires a reason. If the reason field is empty, the button is disabled.

## What decisions currently update

The backend function `admin_apply_case_decision` is the source of truth for decision effects.

- `explore_post_report`: `Dismiss` marks the report dismissed. Other decisions mark it reviewed. `Remove content` and `Restrict` block the reported Explore post.
- `explore_comment_report`: marks the report dismissed or reviewed. It does not currently hide/delete the comment.
- `explore_profile_report`: marks the report dismissed or reviewed. It does not currently suspend the profile by itself.
- `marketplace_verification`: `Approve` sets the verification request to approved and the business to `verified`; `Reject` sets the request to rejected and the business to `rejected`.
- `marketplace_business_registration`: `Approve` sets the business `verification_status` to `verified`; `Reject` sets it to `rejected`.
- `marketplace_case`: `Request information` keeps it in review; other decisions resolve it.
- `transport_support`: `Request information` keeps it in review; other decisions resolve it.
- `transport_operator_verification`: `Approve` sets the operator to `verified` and account status to `approved`; `Reject` sets verification to `not_verified` and account status to `rejected`.
- `transport_company_verification`: `Approve` sets the company to `verified` and account status to `approved`; `Reject` sets it to `rejected`.
- `transport_fleet_verification`: `Approve` sets the company fleet to `verified`; `Reject` sets it to `rejected`.
- `transport_solo_fleet_verification`: `Approve` sets the public fleet to `verified`; `Reject` sets it to `not_verified`.
- `area_location_verification`: `Approve` makes the location `approved` and public; `Reject` makes it rejected/private.
- `area_report`: `Approve` sets the report to `verified`; `Dismiss` sets it to `rejected`; other decisions clear it.

After a non-information decision, the case becomes `resolved`. After `Request information`, the case becomes `waiting_information`.

## Sensitive action approvals

`Remove content` and `Suspend` create a pending approval request when the requester is not a Super Admin.

The flow is:

1. First admin opens the case, chooses `Remove content` or `Suspend`, enters a reason, and selects `Apply decision`.
2. The case moves to `approval_required`.
3. A second admin with `cases.approve` and authority level 4 opens the case.
4. The second admin selects `Approve` or `Reject` in the Sensitive action approvals section.
5. If approved, the original decision is applied. If rejected, the case goes back to `in_review`.

The same admin cannot request and approve the sensitive action.

## How to verify an operator today

Use this when the operator should show the normal blue `Verified` badge.

1. Go to Admin > Verification or Admin > Transport.
2. Open the relevant `Operator verification` or `Fleet verification` case.
3. Review source information, registration documents, fleet photos, and any attached evidence.
4. Select `Claim case` if nobody owns it.
5. Set status to `in_review` if you are actively checking it, then select `Update status`.
6. When the evidence is acceptable, choose decision `Approve`.
7. Enter a clear reason, for example: `Identity, license, and fleet documents reviewed and accepted.`
8. Select `Apply decision`.

For `transport_operator_verification`, the operator record becomes `verified` and `approved`. For `transport_solo_fleet_verification`, the public fleet becomes `verified`. The transport UI maps `verified` to the `Verified` badge.

## How to show Verified Recommended

The display layer already understands a recommended status:

- Transport maps `verified_recommended` or `recommended` to `Verified Recommended`.
- UrMall maps `recommended`, `verified_recommended`, `verify-recommended`, or `verified recommended` to `Verified recommended`.

The current admin case decision UI does not yet include a `Verify recommended` decision, and the current admin decision SQL writes normal `verified` for approved transport and UrMall verification cases. So, today, `Approve` gives `Verified`, not `Verified Recommended`.

The clean implementation is to add a dedicated decision called `verify_recommended` and make the SQL sync it to the recommended status.

Recommended implementation checklist:

1. Add this option in `web/src/admin/adminConfig.js`:

```js
{ key: "verify_recommended", label: "Verify recommended" }
```

2. Update `admin_apply_case_decision` in the Supabase migration/function so `verify_recommended` is an accepted decision.

3. Treat `verify_recommended` like `approve` for authority checks.

4. For transport operator and solo-fleet cases, write `verified_recommended` instead of `verified`.

5. If `public.transport_verification_status` is an enum in the deployed database, add the enum value first:

```sql
alter type public.transport_verification_status
  add value if not exists 'verified_recommended';
```

6. If a table uses a text check constraint, such as some company/fleet tables, update the constraint to allow `verified_recommended`.

7. Update registration decision sync triggers so `new.resolution_code = 'verify_recommended'` also updates source records.

8. Keep the reason requirement and audit logging exactly like other decisions.

Example SQL logic for the transport operator branch:

```sql
set verification_status = case
      when normalized_decision = 'verify_recommended' then 'verified_recommended'::public.transport_verification_status
      when normalized_decision = 'approve' then 'verified'::public.transport_verification_status
      else 'not_verified'::public.transport_verification_status
    end,
    account_status = case
      when normalized_decision in ('approve', 'verify_recommended') then 'approved'
      else 'rejected'
    end
where id = target_case.resource_id
  and normalized_decision in ('approve', 'verify_recommended', 'reject');
```

For UrMall, store either `recommended` or `verified_recommended`; the frontend accepts both. Prefer one value consistently. `verified_recommended` is clearer because it says the seller is verified first and recommended second.

Avoid direct manual SQL updates in production unless it is an emergency. Manual updates can bypass the admin case audit trail unless you also create the case decision, event, and audit record.

## User account controls

The Users page is separate from case decisions.

- Search field: finds users by name, username, email, or phone.
- Shield button: opens account control for that user.
- Status dropdown:
  - `Active`: normal account.
  - `Warned`: account has a warning.
  - `Restricted`: account has limited sector access.
  - `Suspended`: account is temporarily or indefinitely suspended.
  - `Banned`: account is banned.
- Restricted sectors checkboxes: choose all sectors or specific sectors affected by a restriction.
- Expires field: optional end time for the control.
- Required reason: why the control is being applied.
- `Apply account status`: saves the control through the admin RPC and audit path.

Use this for account-level restrictions. Do not assume `Suspend` in a case decision will automatically suspend the user's whole platform account.

## Notification campaign buttons

- `New campaign`: opens the notification composer.
- Composer `X` or `Cancel`: closes the composer without saving.
- `Save campaign`: creates the campaign.
- Campaign `Approve`: approves a draft or pending campaign. Requires `notifications.approve`.
- Campaign `Publish`: publishes an approved campaign. Requires `notifications.approve`.

Campaign forms include sector, audience, priority, optional schedule, and audience-specific targeting fields.

## Admin team buttons

- `Add administrator`: opens the assignment form.
- Sector checkboxes: choose all sectors or a narrower admin scope.
- Authority level slider: sets authority from 1 to 5.
- `Grant admin access`: grants or updates the assignment.
- Remove-access icon: revokes an active assignment after entering a reason.
- Dialog `X`: closes the form without saving.

Admin assignments require an existing KunThai account email. They do not create a user account.

## Settings buttons

- Feature switch: enables or disables a feature flag after the admin enters a reason.

Feature flag changes are high-impact and are written to the audit log.

## Audit and activity

- Bell button: opens recent admin activity.
- `Read all`: marks all activity notifications read.
- Activity item: opens the most relevant admin area. Case intake goes to the right queue; admin action activity goes to the audit log.
- `Open audit log`: opens immutable audit history.
- `Campaigns`: opens notification campaigns.

For every important decision, verify the Audit log afterward. It should show the actor, action, sector, resource type, reason, and time.

## Good admin practice

- Claim the case before making a decision, unless it is urgent and unassigned handling is acceptable.
- Put the case in `in_review` while you inspect evidence.
- Use `Request information` when documents are unclear, incomplete, expired, mismatched, or unreadable.
- Use `Approve` only when the required checks are complete.
- Use `Reject` when the source cannot pass verification or policy requirements.
- Use `Dismiss` when the report or request should not lead to action.
- Use account controls for account-level warnings, restrictions, suspensions, and bans.
- Use second-admin approval for sensitive or irreversible actions.
- Always write a reason that another admin can understand later.
- Check the source UI after verification to confirm the public badge changed as expected.
