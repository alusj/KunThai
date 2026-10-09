import { useMemo } from "react";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import { useIdentityPosts } from "../../../../Backend/hooks/useProfilePosts";
import { readActiveExploreIdentity, readCachedExploreSpaces } from "../../../../Backend/services/explore/spaceService";
import { buildProfileIdentity, buildSpaceIdentity, SPACE_IDENTITY_TYPE } from "../../../../Backend/services/explore/identityService";
import { useI18n } from "../../../../i18n";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import ProfilePostList from "../profile/ProfilePostList";

// My Posts lists everything the identity in use published, read from the
// server page by page (not just what the home feed happened to load). While
// acting as a Space it shows the Space's posts.
export default function MyPostsScreen({ currentUserId, hideHeader = false, identity: identityProp = null }) {
  const { t } = useI18n();
  const reactions = useExploreFeed("feed");
  const spaces = useMemo(() => readCachedExploreSpaces(currentUserId) || [], [currentUserId]);
  const identity = useMemo(() => {
    if (identityProp?.spaceId) return buildSpaceIdentity(identityProp.spaceId);
    const active = readActiveExploreIdentity();
    if (active?.type === SPACE_IDENTITY_TYPE && active.id && spaces.some((space) => space.spaceId === active.id)) {
      return buildSpaceIdentity(active.id);
    }
    return buildProfileIdentity(currentUserId);
  }, [currentUserId, identityProp?.spaceId, spaces]);
  const activeSpace = identity.type === SPACE_IDENTITY_TYPE ? spaces.find((space) => space.spaceId === identity.id) : null;
  const list = useIdentityPosts(identity, "all");

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title={t("screens.MyPostsTitle")} subtitle={t("screens.MyPostsSubtitle")} /> : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        {activeSpace ? (
          <p className="rounded-[20px] bg-sky-50 px-4 py-3 text-sm font-bold text-sky-800">
            {t("exploreProfileFix.spacePostsNote", { name: activeSpace.displayName || "Space" })}
          </p>
        ) : null}
        <ProfilePostList
          list={list}
          reactions={reactions}
          currentUserId={currentUserId}
          spaces={spaces}
          emptyTitle={t("explore.noPostsYet")}
          emptyMessage={t("explore.noPostsYetMsg")}
        />
      </div>
    </div>
  );
}
