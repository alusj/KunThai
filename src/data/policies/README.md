# KunThai Policy Center Data

Policy documents live in `policyDocuments.js`, categories live in `policyCategories.js`, and shared prohibited-product groups live in `prohibitedProducts.js`.

To add a policy, create a new object with the existing schema, add its id to one category, add related policies, and add a changelog entry if the change affects users. To update a version, change the policy version/date fields through `src/config/legalConfig.js` or a per-policy override, then add a real changelog entry.

Legal contact placeholders are centralized in `src/config/legalConfig.js`. The unresolved business name, contact emails, registered address, governing law, dispute jurisdiction, effective date, last updated date, and deletion timeframe must be confirmed before public launch.

Conditional policies include payments, refunds, verification, marketplace, transport, and any service that is unavailable in a country or account. Do not describe a future service as live unless the product flow is actually enabled.

These documents are product policy drafts, not legal advice. A qualified lawyer should review the full Policy Center before launch.
