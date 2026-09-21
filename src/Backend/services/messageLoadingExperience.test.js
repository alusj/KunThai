import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UI_TRANSLATIONS } from "../../i18n/ui.js";

const hookSource = readFileSync(new URL("../hooks/useExploreMessages.js", import.meta.url), "utf8");
const exploreScreenSource = readFileSync(
  new URL("../../components/Explore/SocialMenu/messages/ConversationScreen.jsx", import.meta.url),
  "utf8",
);
const urmallScreenSource = readFileSync(new URL("../../components/Marketplace/Messages.jsx", import.meta.url), "utf8");

test("Explore threads paint cached messages or a conversation skeleton before the network response", () => {
  assert.match(hookSource, /readCachedExploreMessages/);
  assert.match(hookSource, /conversationLoading/);
  assert.match(exploreScreenSource, /ConversationMessagesSkeleton/);
  assert.match(exploreScreenSource, /!loading && !messages\.length/);
});

test("UrMall conversation list renders a loading skeleton instead of a blank screen", () => {
  assert.match(urmallScreenSource, /loading \? <MarketplaceMessagesSkeleton \/>/);
  assert.match(urmallScreenSource, /aria-label=\{i18nText\("ui\.literals\.k8c3b557c4b95"\)\} aria-busy="true"/);
  assert.equal(UI_TRANSLATIONS.en.literals.k8c3b557c4b95, "Loading UrMall conversations");
});
