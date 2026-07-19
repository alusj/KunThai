# KunThai Admin Case Controls and Decisions

This guide is the operating file for KunThai admin case handling. It explains the admin workspace, the case drawer, the decision buttons, action undo, related account controls, activity notification actions, and the current account-deletion review flow.

The main rule is simple: **case statuses manage workflow, while decisions change the source record when the backend supports that case type**. A status update can move work forward without approving, rejecting, deleting, restricting, or verifying the underlying record.

## Admin Access Model

Admin access is enforced by database RPCs, RLS policies, role scope, sector scope, and authority level. The UI should make the controls understandable, but the backend remains the source of truth.

- `cases.view`: can see cases inside the admin's allowed scope.
- `cases.manage`: can claim cases, update case status, add notes, apply decisions, and use case-level undo when permitted.
- `cases.approve`: can approve or reject sensitive action requests.
- `users.view`: can view user/account records when the admin role includes that permission.
- `users.manage`: can update related account access from the Users page or from an eligible case drawer.
- Authority level 3: required for `Approve`, `Reject`, `Remove content`, `Restrict`, and `Suspend`.
- Authority level 4: required to approve another admin's sensitive action request.
- Super Admin: can apply sensitive decisions without the second-admin approval step.
- Chief Admin or Super Admin: can undo eligible case actions performed by another admin.

Use the narrowest suitable role and sector. Verification officers should handle normal verification; sector managers and risk roles should handle complex reviews; Chief/Super Admins should handle destructive, policy-sensitive, or disputed actions.

## Admin Workspace Map

- Command center: summary cards, urgent work, queue load, and sector shortcuts.
- My work: assigned and unassigned cases available to handle.
- Users: user directory and account-status controls.
- Explore: content, profiles, adverts, reports, and community safety.
- UrMall: seller, product, order, dispute, and marketplace verification work.
- Transport: operator, fleet, company, trip, incident, and Area View work.
- Verification: seller, operator, company, fleet, document, and profile review queue.
- Reports and safety: content reports, fraud, safety incidents, and Area View validation.
- Support and disputes: My Voice, user, seller, order, trip, operator, and account-deletion support.
- Notifications: platform notification campaigns.
- Finance: finance cases. Live money movement is disabled until the payment provider is connected.
- Analytics: workload and SLA overview.
- Admin team: grant and revoke admin assignments.
- Action history: operational history for recent admin actions.
- Audit log: immutable record of admin decisions, access changes, approvals, undo events, and settings changes.
- Settings: high-impact feature flags.

## Queue and Case Table Controls

- `Refresh`: reloads dashboard summary and latest cases.
- `Open queue`: opens the work queue from the command center.
- Sector cards such as `Explore`, `UrMall`, and `Transport`: open that sector's case view.
- Search field: searches case number, title, description, sector, queue, type, country, and source metadata.
- Status filter: shows open work, new, in-review, waiting-information, resolved, or all cases.
- Content-type filter: limits the queue to one case type, such as seller verification, operator verification, reported post, or account deletion request.
- Case row: opens the case drawer.
- Arrow button: opens the same case drawer.
- Global country scope: filters cases by country when country data exists on the case source.

## Case Drawer Reference

When a case opens, the drawer can show these sections:

- Case summary: case number, sector, queue, priority, title, description, status, type, country, opened time, and SLA due time.
- Reported or attached content: source content and direct media previews for posts, comments, profiles, map points, documents, images, video, and audio.
- Source information: structured metadata from the source record.
- Attachments and evidence: screenshots, recordings, documents, fleet photos, IDs, registration evidence, or support files.
- Sensitive action approvals: second-admin review for actions that need approval.
- Case controls: workflow status, claim button, recent actions, related account access, decision controls, and required reason boxes.
- Internal notes: private admin context for the next reviewer.

## Case Drawer Buttons

- `Close case` / `X`: closes the drawer without changing the case.
- `Open map point`: opens a linked Area View or location point.
- `Open file`: opens a document or evidence attachment in a new tab.
- Image tile: opens an image preview.
- Video or audio controls: plays submitted media evidence.
- Media preview `X`: closes the preview.
- Approval `Approve`: approves a pending sensitive action. Requires `cases.approve`, authority level 4, and a different admin from the requester.
- Approval `Reject`: rejects a pending sensitive action and returns the case to `in_review`.
- Status dropdown: chooses the workflow state.
- `Update status`: saves the selected workflow status. This does not approve, reject, delete, verify, or restrict the source record by itself.
- `Claim case`: assigns the case to you. If the case is `new`, `triaged`, or `reopened`, it becomes `assigned`.
- Recent actions `Undo`: starts an undo for an eligible case action.
- Undo `Confirm undo`: restores the case to the previous case state after a required undo reason is entered.
- Related account access `Restore`: sets the related user's platform account control back to active.
- Related account access `Edit`: opens the account-access form inside the case drawer.
- Related account access `Save access`: saves status, sectors, expiry, and reason through the audited admin user-status RPC.
- Decision dropdown: chooses the actual admin decision to apply.
- `Apply decision`: applies the selected decision with the required reason. Some source records update immediately; sensitive actions may first create an approval request.
- Internal note box: private admin context for future reviewers.
- `Add note`: saves the internal note.

## Case Statuses

- `new`: the case was created and has not been triaged.
- `triaged`: someone reviewed the case enough to know what queue or action it needs.
- `assigned`: the case has an owner.
- `in_review`: the owner is checking evidence, policy, history, or documents.
- `waiting_information`: the admin needs more information from the user, seller, operator, or another source.
- `action_proposed`: an admin has prepared an action that is not fully completed.
- `approval_required`: a sensitive action is waiting for a second admin.
- `actioned`: an action was taken but the case is not fully resolved yet.
- `appeal_window`: the user may still appeal, or the admin is waiting through a dispute window.
- `resolved`: the admin decision is complete.
- `closed`: the case is fully closed after resolution and any appeal or retention period.
- `reopened`: a closed or resolved case came back because of an appeal, new information, or a repeated issue.

Use statuses to describe progress. Use decisions only when you are ready to record the outcome.

## Decision Buttons

The current decision options are:

- `Approve`: approves a verification, validates a source, or accepts a user-requested action when the case type supports approval.
- `Reject`: rejects a verification or declines a request when the case type supports rejection.
- `Dismiss`: closes a report or concern because it is not actionable, is false, lacks evidence, is duplicated, or does not violate policy.
- `Remove content`: removes or blocks supported content. It needs authority level 3 and, unless the actor is a Super Admin, second-admin approval.
- `Restrict`: applies a restriction where the case type supports it. It needs authority level 3.
- `Suspend`: records a suspension decision. It needs authority level 3 and, unless the actor is a Super Admin, second-admin approval. Use the Users account control for platform-wide account status.
- `Resolve`: closes the case with a general resolution and no special source-record change.
- `Request information`: moves the case to `waiting_information` and keeps it unresolved.

Every decision requires a reason. If the reason field is empty, the decision button is disabled.

## Decision Effects

The backend function `admin_apply_case_decision` and the connected decision-sync triggers are the source of truth for source-record updates.

| Case resource type | Current effect |
| --- | --- |
| `explore_post_report` | `Dismiss` marks the report dismissed. Other decisions mark it reviewed. `Remove content` and `Restrict` block the reported Explore post. |
| `explore_comment_report` | Marks the report dismissed or reviewed. It does not currently hide or delete the comment. |
| `explore_profile_report` | Marks the report dismissed or reviewed. It does not suspend the profile by itself. |
| `marketplace_verification` | `Approve` approves the verification request and sets the business to `verified`; `Reject` sets the request to rejected and the business to `rejected`. |
| `marketplace_business_registration` | Decision-sync trigger sets the business verification status to `verified` on `Approve` or `rejected` on `Reject`. |
| `marketplace_property_listing` | Decision-sync trigger sets listing authorization to `verified` and publishes it on `Approve`; sets authorization to `rejected` on `Reject`. |
| `marketplace_case` | `Request information` keeps it in review; other decisions resolve it. |
| `transport_support` | `Request information` keeps it in review; other decisions resolve it. |
| `transport_operator_verification` | `Approve` sets the operator to `verified` and account status to `approved`; `Reject` sets verification to `not_verified` and account status to `rejected`. |
| `transport_company_verification` | `Approve` sets the company to `verified` and account status to `approved`; `Reject` sets it to `rejected`. |
| `transport_fleet_verification` | `Approve` sets the company fleet to `verified`; `Reject` sets it to `rejected`. |
| `transport_solo_fleet_verification` | Decision-sync trigger sets the public fleet to `verified` on `Approve` or `not_verified` on `Reject`. |
| `area_location_verification` | Decision-sync trigger makes the location approved/public on `Approve` or rejected/private on `Reject`. |
| `area_report` | `Approve` sets the report to `verified`; `Dismiss` sets it to `rejected`; other decisions clear it. |
| `urmall_account_deletion_request` | `Approve` or `Remove content` deletes the matching UrMall business row when the requester owns it. `Reject`, `Dismiss`, and `Resolve` close the case without deleting the business. |
| `urride_account_deletion_request` | `Approve` or `Restrict` applies a transport-sector restriction in `platform_account_controls`. It does not delete the auth user or the full KunThai identity. |

After a non-information decision, the case becomes `resolved`. After `Request information`, the case becomes `waiting_information`.

## Sensitive Action Approvals

The following decisions create a pending approval request when the requester is not a Super Admin:

- `Remove content`
- `Suspend`
- `Approve` on `urmall_account_deletion_request`
- `Approve` on `urride_account_deletion_request`

The flow is:

1. First admin opens the case, chooses the decision, enters a clear reason, and selects `Apply decision`.
2. The case moves to `approval_required`.
3. A second admin with `cases.approve` and authority level 4 opens the case.
4. The second admin selects `Approve` or `Reject` in the Sensitive action approvals section.
5. If approved, the stored decision is applied through `admin_apply_case_decision`.
6. If rejected, the case returns to `in_review`.

The same admin cannot request and approve the sensitive action.

## Account Deletion Requests

Account deletion requests are submitted by users but reviewed by admin before any destructive or access-changing action happens.

Current supported surfaces:

- `urmall_business`: creates a marketplace support case with resource type `urmall_account_deletion_request`.
- `urride_account`: creates a transport support case with resource type `urride_account_deletion_request`.

Each request stores a compact source snapshot in the case metadata. For UrMall, the snapshot can include business ID, business name, business kind, owner user ID, country, city, and reason. For UrRide, the snapshot includes the requesting user, surface, account name when supplied, and reason.

### How To Review A Deletion Request

1. Go to Admin > Support and disputes, or open the relevant sector queue.
2. Filter or search for `Account deletion request`.
3. Open the case and review Source information, evidence, previous support history, orders, trips, disputes, messages, and any legal or safety retention needs.
4. Confirm that `subject_user_id` and `reporter_user_id` match the requester, and that the requested target belongs to that user.
5. Select `Claim case`.
6. If anything is unclear, choose `Request information`, enter the exact missing information, and apply the decision.
7. If the request is invalid, unsafe, duplicated, or cannot be processed, choose `Reject` or `Dismiss` with a clear reason.
8. If the request is valid and ready, choose `Approve`, enter a reason, and apply the decision.
9. If second-admin approval is required, wait for the approval reviewer to approve the pending action.
10. After completion, verify the Audit log and the source UI.

### How UrMall Business Deletion Works

Use `Approve` for a valid user-requested UrMall deletion. When the decision is finally applied, the database deletes the matching row from `marketplace_businesses` only if the business ID matches the case resource and the business owner matches the case subject user.

Important guardrails:

- Do not use `Approve` until ownership, support risk, orders, disputes, and retention needs are checked.
- Non-Super Admin approval requires a second administrator.
- Case undo can restore the case status and decision state, but it does **not** recreate a deleted UrMall business row.
- If a business was deleted by mistake, recovery requires a technical restore from backups or a manual reconstruction path. Treat approval as destructive.

### How UrRide Account Deletion Works Today

The current UrRide deletion decision is conservative. `Approve` or `Restrict` writes a transport-sector restriction to `platform_account_controls`. It does not delete the Supabase auth user, the user's full KunThai identity, or all platform data.

Use this when the user requested transport account removal but the platform must retain identity, support, trip, safety, legal, or audit records. If the product later needs full auth-user deletion from admin, add a separate audited backend function instead of overloading the existing case decision.

If a user still sees a restricted screen after a mistaken decision is undone, open the same case and use `Related account access` > `Restore`.

## Recent Actions And Undo

The case drawer now shows recent undoable actions for:

- `case.claimed`
- `case.status_changed`
- `case.decision_applied`

An `Undo` button appears when:

- the action has a previous case state,
- the action has not already been undone,
- the current admin performed the action, or the current admin is a Chief Admin or Super Admin,
- the admin has permission to manage the case.

Undo requires a reason. When confirmed, it restores the case status, assignee, assigned time, resolution code, resolution note, resolved time, and closed time from the audit log's previous state. It also writes a new case event and audit-log entry.

Undo is not a universal source-data rollback. It is a controlled case rollback. For source effects:

- UrRide account-deletion restrictions can be restored to active by the undo helper when the current control is still restricted.
- General account restrictions can be fixed through `Related account access` or the Users page.
- Deleted UrMall business rows are not recreated by undo.
- Removed or restricted content should be checked in the source UI after undo.

## Related Account Access

When a case has `subject_user_id` and the admin has `users.manage`, the case drawer shows Related account access.

Controls:

- Status badge: shows the current account control status, such as `Active`, `Warned`, `Restricted`, `Suspended`, or `Banned`.
- Sector badge: shows restricted sectors when a sector restriction exists.
- `Restore`: sets the related account back to `Active`, clears expiry, and sets sectors to `all`.
- `Edit`: opens the account-access form.
- Status field: chooses `Active`, `Warned`, `Restricted`, `Suspended`, or `Banned`.
- Expires field: optional expiry for temporary account controls.
- Restricted sectors: selects `All sectors`, `Explore`, `UrMall`, or `Transport` when status is `Restricted`.
- Required account access reason: records why the account control is being changed.
- `Save access`: applies the control through the audited admin user-status RPC.

Use this panel when a case action created or exposed an account-access problem. For example, if an admin undoes a decision but the user still sees "This sector is restricted", restore or edit the related account access from the case drawer.

## Activity Notification Actions

The admin activity bell has a per-notification `...` menu. Available actions depend on the notification, actor, and role.

Common actions:

- `Open notification`: opens the most relevant admin view.
- `Open related case`: opens the connected case when one exists.
- `Mark read` / `Mark unread`: updates only the current admin's notification state.
- `Copy details`: copies useful notification details.
- `Dismiss`: archives the notification for the current admin.

Admin action notifications can also expose undo:

- The admin who performed the action can request or apply undo from their own notification when the notification is connected to an audit record.
- The upgraded undo path routes through the central audit undo function, so eligible case actions and account-status actions follow the same authorization and audit rules.
- Chief/Super Admin review remains the correct path for actions that are not safely auto-undoable.

Notification RLS only allows admins to update their own notification read/archive state. It does not let one admin silently change another admin's notification inbox.

## User Account Controls

The Users page and Related account access panel both use audited account-control paths.

- Search field: finds users by name, username, email, or phone.
- Shield button: opens account control for that user.
- Status dropdown:
  - `Active`: normal account.
  - `Warned`: account has a warning.
  - `Restricted`: account has limited sector access.
  - `Suspended`: account is temporarily or indefinitely suspended.
  - `Banned`: account is banned.
- Restricted sectors: choose all sectors or specific sectors affected by a restriction.
- Expires field: optional end time.
- Required reason: why the control is being applied.
- `Apply account status` or `Save access`: saves the control and audit record.

Use account controls for account-level restrictions. Do not assume `Suspend` in a case decision will automatically suspend the user's whole platform account.

## Verification Workflows

### Verify An Operator

Use this when the operator should show the normal `Verified` badge.

1. Go to Admin > Verification or Admin > Transport.
2. Open the relevant `Operator verification` or `Fleet verification` case.
3. Review source information, registration documents, fleet photos, and attached evidence.
4. Select `Claim case` if nobody owns it.
5. Set status to `in_review` while actively checking it, then select `Update status`.
6. When the evidence is acceptable, choose decision `Approve`.
7. Enter a clear reason, for example: `Identity, license, and fleet documents reviewed and accepted.`
8. Select `Apply decision`.

For `transport_operator_verification`, the operator becomes `verified` and `approved`. For `transport_solo_fleet_verification`, the public fleet becomes `verified` through the decision-sync trigger.

### Verified Recommended

The display layer already understands a recommended status:

- Transport maps `verified_recommended` or `recommended` to `Verified Recommended`.
- UrMall maps `recommended`, `verified_recommended`, `verify-recommended`, or `verified recommended` to `Verified recommended`.

The current admin case decision UI does not yet include a `Verify recommended` decision, and the current decision SQL writes normal `verified` for approved transport and UrMall verification cases. Today, `Approve` gives `Verified`, not `Verified Recommended`.

The clean implementation is to add a dedicated decision called `verify_recommended` and sync it to the recommended status.

Recommended implementation checklist:

1. Add this option in `web/src/admin/adminConfig.js`:

```js
{ key: "verify_recommended", label: "Verify recommended" }
```

2. Update `admin_apply_case_decision` so `verify_recommended` is accepted.
3. Treat `verify_recommended` like `approve` for authority checks.
4. For transport operator and solo-fleet cases, write `verified_recommended` instead of `verified`.
5. If `public.transport_verification_status` is an enum, add the enum value first:

```sql
alter type public.transport_verification_status
  add value if not exists 'verified_recommended';
```

6. If a table uses a text check constraint, update the constraint to allow `verified_recommended`.
7. Update registration decision-sync triggers so `new.resolution_code = 'verify_recommended'` also updates source records.
8. Keep the reason requirement and audit logging exactly like other decisions.

Avoid direct manual SQL updates in production unless it is an emergency. Manual updates can bypass the admin case audit trail unless you also create the case decision, event, and audit record.

## Notification Campaign Buttons

- `New campaign`: opens the notification composer.
- Composer `X` or `Cancel`: closes the composer without saving.
- `Save campaign`: creates the campaign.
- Campaign `Approve`: approves a draft or pending campaign. Requires `notifications.approve`.
- Campaign `Publish`: publishes an approved campaign. Requires `notifications.approve`.

Campaign forms include sector, audience, priority, optional schedule, and audience-specific targeting fields.

## Admin Team Buttons

- `Add administrator`: opens the assignment form.
- Sector checkboxes: choose all sectors or a narrower admin scope.
- Authority level slider: sets authority from 1 to 5.
- `Grant admin access`: grants or updates the assignment.
- Remove-access icon: revokes an active assignment after entering a reason.
- Dialog `X`: closes the form without saving.

Admin assignments require an existing KunThai account email. They do not create a user account.

## Settings Buttons

- Feature switch: enables or disables a feature flag after the admin enters a reason.

Feature flag changes are high-impact and are written to the audit log.

## Audit Practice

For every important action, verify the Audit log afterward. It should show the actor, action, sector, resource type, reason, before/after state when available, and time.

Use this standard for reasons:

- Be specific about what was reviewed.
- Name the policy, evidence, or user request that justifies the action.
- Avoid vague reasons such as `done`, `ok`, or `bad user`.
- For undo, explain what was wrong and what state should be restored.
- For account deletion, record ownership checks, retention checks, and the final action taken.

## Good Admin Practice

- Claim the case before making a decision unless the situation is urgent.
- Put the case in `in_review` while you inspect evidence.
- Use `Request information` when documents are unclear, incomplete, expired, mismatched, or unreadable.
- Use `Approve` only when the required checks are complete.
- Use `Reject` when the source cannot pass verification, deletion checks, or policy requirements.
- Use `Dismiss` when the report or request should not lead to action.
- Use account controls for account-level warnings, restrictions, suspensions, and bans.
- Use second-admin approval for sensitive or destructive actions.
- Always write a reason that another admin can understand later.
- Check the source UI after verification, restriction, deletion, or undo.
- Treat UrMall deletion approval as destructive because case undo does not recreate the business row.
