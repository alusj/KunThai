import { useI18n, t } from "../../../../../../../../../i18n";
import SellerArticlePage from "../../SellerArticlePage";

export default function FAQs({ onBack }) {
  useI18n();
  const b = "urmall.biz.helpDocs.faq";
  return (
    <SellerArticlePage
      title={t("urmall.biz.help.faqTitle")}
      eyebrow={t("urmall.biz.menu.supportTitle")}
      onBack={onBack}
      summary={t(`${b}.summary`)}
      highlights={[
        { title: t(`${b}.h1t`), text: t(`${b}.h1x`) },
        { title: t(`${b}.h2t`), text: t(`${b}.h2x`) },
        { title: t(`${b}.h3t`), text: t(`${b}.h3x`) },
      ]}
      sections={[
        { title: t(`${b}.s1t`), paragraphs: [t(`${b}.s1p1`), t(`${b}.s1p2`)] },
        { title: t(`${b}.s2t`), paragraphs: [t(`${b}.s2p1`), t(`${b}.s2p2`)] },
        { title: t(`${b}.s3t`), paragraphs: [t(`${b}.s3p1`), t(`${b}.s3p2`)] },
        { title: t(`${b}.s4t`), paragraphs: [t(`${b}.s4p1`), t(`${b}.s4p2`)] },
      ]}
    />
  );
}
