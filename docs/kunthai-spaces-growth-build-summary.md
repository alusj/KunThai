# KunThai Spaces, Roadmap, and Growth CTA Build Summary

This file summarizes the major frontend, backend, and database work completed for the KunThai Explore Spaces task.

## Product Direction

KunThai now uses **Spaces** as managed identities for businesses, brands, organizations, schools, NGOs, clubs, communities, media houses, creators, and teams.

Spaces are designed to feel like a first-class KunThai identity, not a clone of Pages from other platforms. A user can switch from their personal profile into a Space, post and interact as that Space, then switch back to the personal profile.

The language also moved from **follow** toward **connect**, so the product feels more relational and more appropriate for people, businesses, and organizations.

## Space Creation

Added a real Space creation flow with:

- Space name
- Handle / slug
- Category
- Bio
- Contact email
- Phone
- Website
- Location
- Avatar upload
- Cover upload or preset cover
- Automatic default departments

Categories include:

- Business
- Brand
- Organization
- School
- Community
- NGO
- Government Agency
- Religious Organization
- Sports Club
- Entertainment
- Personal Brand
- News & Media
- Event

Primary frontend file:

- `src/components/Explore/SocialMenu/spaces/SpaceCreateScreen.jsx`

Primary backend service:

- `src/Backend/services/explore/spaceService.js`

Primary migration:

- `supabase/migrations/20260715143000_explore_spaces_identity.sql`

## Space Identity Switching

Spaces can now be selected from the Explore social menu/profile area.

When a user switches into a Space:

- The active Explore identity becomes the Space.
- The personal profile is minimized at the top of the Space dashboard.
- Posting and relevant actions use the Space identity.
- UrMall and UrRide are not affected by the active Explore Space identity.
- Switching back returns the user to their personal Explore profile.

Primary frontend wiring:

- `src/components/Explore/Explore.jsx`
- `src/components/Explore/components/header/HeaderMenu.jsx`
- `src/components/Explore/SocialMenu/profile/ProfileScreen.jsx`

Primary identity helpers:

- `src/Backend/services/explore/identityService.js`
- `src/Backend/services/explore/spaceService.js`

## Space Dashboard

Added a functional Space dashboard with:

- Minimized personal profile strip
- Space identity header
- Space avatar
- Space category and role display
- Feed count
- Swip count
- Connections count
- Team count
- Team member list
- Member role editing
- Responsibility editing
- Team invitation form
- Department assignment
- Member removal

Primary frontend file:

- `src/components/Explore/SocialMenu/spaces/SpaceDashboardScreen.jsx`

## Space Team and Member System

Team members are invited by KunThai unique ID.

Each invited member gets:

- Role
- Optional department
- Responsibility set
- Pending invitation status
- Accept / decline ability

Roles include:

- Owner
- Administrator
- Moderator
- Editor
- Customer Support
- Analyst

Responsibilities include:

- Create posts
- Reply to comments
- Reply to messages
- Manage team
- View insights
- Edit Space

After accepting an invitation, the member can switch into the Space and perform only the responsibilities they were granted.

Primary backend service:

- `src/Backend/services/explore/spaceService.js`

Primary migration:

- `supabase/migrations/20260715180000_explore_space_team_responsibilities.sql`

Additional RLS migration for self-leave:

- `supabase/migrations/20260716110000_explore_space_member_self_leave.sql`

## Space Dashboard Actions

Expanded the Space action menu with real actions:

- View Space profile
- Messages
- Notifications
- Share Space
- Copy Space link
- Copy @handle
- Add team member
- Edit Space
- Pause Space
- Reactivate Space
- Leave Space
- Delete Space

Owner-only and member-only logic:

- Owners can delete a Space.
- Owners and administrators can pause or reactivate a Space.
- Non-owner members can leave a Space.
- Team managers can add and manage members.

Primary frontend file:

- `src/components/Explore/SocialMenu/spaces/SpaceDashboardScreen.jsx`

Primary backend functions:

- `updateExploreSpaceStatus`
- `deleteExploreSpace`
- `leaveExploreSpace`
- `removeExploreSpaceMember`
- `updateExploreSpaceMember`
- `inviteExploreSpaceMember`
- `respondExploreSpaceInvite`

## Space Posts, Comments, and Messages

Explore content now supports Space identity behavior.

Implemented:

- Posts can be created as a Space when the active identity is a Space.
- Space posting checks `canCreatePosts`.
- Comments can be created as a Space.
- Space comment replies check `canReplyComments`.
- Messages can be sent as a Space.
- Space message replies check `canReplyMessages`.
- Comment author hydration displays the Space as the author when applicable.
- Message bubbles can show Space actor labeling.

Primary files:

- `src/Backend/services/explore/postService.js`
- `src/Backend/services/explore/commentService.js`
- `src/Backend/services/explore/messageService.js`
- `src/components/Explore/SocialMenu/messages/MessageBubble.jsx`

## Space Discovery and Connections

Spaces appear in discovery/connect surfaces with an **A Space** label.

Implemented:

- Space profiles are discoverable.
- Users can connect with Spaces.
- Connections language uses "connect" instead of "follow" in key areas.
- Space items are included alongside people in connection discovery where appropriate.

Primary files:

- `src/Backend/services/exploreService.js`
- `src/Backend/services/explore/followService.js`
- `src/Backend/hooks/useExploreConnections.js`
- `src/components/Explore/ExploreTabs/connections/components/ConnectionCard.jsx`
- `src/components/Explore/ExploreTabs/connections/components/FollowButton.jsx`
- `src/components/Explore/ExploreTabs/connections/discover/DiscoverList.jsx`

## Notifications

Space-aware notifications were added so activity can reference a Space identity.

Implemented:

- Notification actor fields can carry Space identity.
- Space team invitations notify invited users.
- Space invite acceptance can notify the inviter.
- Space comments and mentions can preserve actor information.
- Notifications can open Space profiles.

Primary files:

- `src/Backend/services/exploreService.js`
- `src/Backend/services/explore/commentService.js`
- `src/Backend/services/explore/spaceService.js`
- `src/components/Explore/ExploreTabs/notification/Notifications.jsx`
- `src/components/Explore/ExploreTabs/notification/components/NotificationItem.jsx`

## Future Features Screen

Added a **Future Features** menu item after **Sign Out** in the Explore social menu.

The screen includes planned advanced features such as:

- Monetization
- Go Live
- Creator Studio
- Subscriptions
- Ads Manager
- Space Verification
- Live Shopping
- Advanced Insights
- Events
- KunThai Academy
- Community Roles
- Creator Fund

Users can:

- Filter future features by category
- Mark features they are interested in
- Send a future-feature idea through Your Voice

Interest tracking is stored locally for now.

Primary files:

- `src/components/Explore/SocialMenu/future/FutureFeaturesScreen.jsx`
- `src/components/Explore/components/header/HeaderMenu.jsx`
- `src/components/Explore/config/menuScreens.js`
- `src/components/Explore/Explore.jsx`

## Share CTA Growth Loop

Added share CTAs in non-intrusive locations to encourage users to share KunThai and UrMall.

Shared helper:

- `src/Backend/services/shareCtaService.js`

The helper uses:

- Native device sharing when available
- Clipboard fallback when native sharing is unavailable

KunThai CTA placements:

- Post-published completion banner
- Post publish success message
- End of UrFeed content
- Empty Swip state

UrMall CTA placements:

- UrMall seller product success toast
- Restaurant order success toast
- Booking request success toast
- Checkout success toast
- Vertical seller listing success toast
- Empty UrMall product grid

Primary files:

- `src/Backend/services/shareCtaService.js`
- `src/components/Explore/shared/PostingStatusBanner.jsx`
- `src/components/Explore/ExploreTabs/urfeed/feed/components/FeedComposer.jsx`
- `src/components/Explore/ExploreTabs/urfeed/feed/FeedList.jsx`
- `src/components/Explore/ExploreTabs/swip/tabs/All.jsx`
- `src/components/Marketplace/MarketplaceHeader/Business/ProductSuccessToast.jsx`
- `src/components/Marketplace/VerticalMarketplace.jsx`
- `src/components/Marketplace/MarketplaceHeader/Cart/Cart.jsx`
- `src/components/Marketplace/MarketplaceHeader/Business/VerticalSellerDashboard.jsx`
- `src/components/Marketplace/Browse/BuyerProductGrid.jsx`

## Important Bug Fix

Fixed a runtime Supabase error:

```text
supabase.from(...).select(...).in(...).catch is not a function
```

Cause:

Supabase query builders were being chained with `.catch()` directly before being awaited.

Fix:

Replaced those query-builder `.catch()` calls with proper awaited result handling.

Primary files:

- `src/Backend/services/explore/spaceService.js`
- `src/Backend/services/explore/commentService.js`

## Database Migrations Added

The following migrations were added and pushed:

- `supabase/migrations/20260715143000_explore_spaces_identity.sql`
- `supabase/migrations/20260715180000_explore_space_team_responsibilities.sql`
- `supabase/migrations/20260716110000_explore_space_member_self_leave.sql`

## Major New or Updated Files

New files:

- `src/Backend/services/explore/identityService.js`
- `src/Backend/services/explore/spaceService.js`
- `src/Backend/services/shareCtaService.js`
- `src/components/Explore/SocialMenu/spaces/SpaceCreateScreen.jsx`
- `src/components/Explore/SocialMenu/spaces/SpaceDashboardScreen.jsx`
- `src/components/Explore/SocialMenu/future/FutureFeaturesScreen.jsx`
- `supabase/migrations/20260715143000_explore_spaces_identity.sql`
- `supabase/migrations/20260715180000_explore_space_team_responsibilities.sql`
- `supabase/migrations/20260716110000_explore_space_member_self_leave.sql`

Updated files include:

- `src/components/Explore/Explore.jsx`
- `src/components/Explore/components/header/HeaderMenu.jsx`
- `src/components/Explore/config/menuScreens.js`
- `src/components/Explore/SocialMenu/profile/ProfileScreen.jsx`
- `src/components/Explore/SocialMenu/profile/ProfileHeaderCard.jsx`
- `src/components/Explore/SocialMenu/profile/ProfileEditScreen.jsx`
- `src/components/Explore/shared/PostingStatusBanner.jsx`
- `src/components/Explore/ExploreTabs/urfeed/feed/components/FeedComposer.jsx`
- `src/components/Explore/ExploreTabs/urfeed/feed/FeedList.jsx`
- `src/components/Explore/ExploreTabs/swip/tabs/All.jsx`
- `src/components/Marketplace/MarketplaceHeader/Business/ProductSuccessToast.jsx`
- `src/components/Marketplace/VerticalMarketplace.jsx`
- `src/components/Marketplace/MarketplaceHeader/Cart/Cart.jsx`
- `src/components/Marketplace/MarketplaceHeader/Business/VerticalSellerDashboard.jsx`
- `src/components/Marketplace/Browse/BuyerProductGrid.jsx`
- `src/Backend/services/exploreService.js`
- `src/Backend/services/explore/postService.js`
- `src/Backend/services/explore/commentService.js`
- `src/Backend/services/explore/messageService.js`
- `src/Backend/services/explore/followService.js`

## Verification Performed

Verification commands run during the task:

```bash
npm.cmd run build
npm.cmd run lint
supabase db push
```

The local dev server was also checked with:

```bash
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173 -TimeoutSec 8 | Select-Object -ExpandProperty StatusCode
```

Result:

- Production build passed.
- Lint passed with only the same existing transport hook warnings.
- Supabase migrations were pushed.
- Local app responded with status `200`.

Known existing warnings:

- `src/components/transport/registration/CompanyRegistrationScreen.jsx`
- `src/components/transport/registration/FleetRegistrationDrawer.jsx`

These are pre-existing React hook dependency warnings unrelated to the Spaces and CTA work.

## Current Product State

KunThai Explore now supports:

- Personal profile identity
- Managed Space identities
- Switching between profile and Space
- Space dashboard
- Team invitations
- Roles and responsibilities
- Space posting
- Space comments
- Space messages
- Space discovery
- Space connections
- Space-aware notifications
- Future feature roadmap screen
- KunThai and UrMall share CTAs

This gives KunThai a foundation for businesses, NGOs, schools, creators, communities, government agencies, media, clubs, and organizations to operate inside Explore without using the generic "Pages" concept.
