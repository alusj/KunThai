// The notice on the startup screen when loading takes too long (2026-10-14):
// almost always a very poor connection or none at all. Grafted onto
// TRANSLATIONS as `appLoading` and read with t("appLoading.<key>"). Every
// locale must carry the same keys. KunThai stays as it is.
export const APP_LOADING = {
  en: {
    slowNetwork: "It seems you have a very poor network or no network at all. Please refresh KunThai to catch up.",
    refresh: "Refresh",
  },
  fr: {
    slowNetwork: "Il semble que votre réseau soit très faible ou absent. Actualisez KunThai pour rattraper le retard.",
    refresh: "Actualiser",
  },
  es: {
    slowNetwork: "Parece que tienes una red muy débil o ninguna. Actualiza KunThai para ponerte al día.",
    refresh: "Actualizar",
  },
  zh: {
    slowNetwork: "你的网络似乎很差或完全没有网络。请刷新 KunThai 以获取最新内容。",
    refresh: "刷新",
  },
  ar: {
    slowNetwork: "يبدو أن شبكتك ضعيفة جدًا أو غير متوفرة. يرجى تحديث KunThai لمواكبة الجديد.",
    refresh: "تحديث",
  },
  pt: {
    slowNetwork: "Parece que sua rede está muito fraca ou sem sinal. Atualize o KunThai para ficar em dia.",
    refresh: "Atualizar",
  },
  hi: {
    slowNetwork: "लगता है आपका नेटवर्क बहुत कमज़ोर है या बिल्कुल नहीं है। अपडेट पाने के लिए KunThai रीफ़्रेश करें।",
    refresh: "रीफ़्रेश करें",
  },
  bn: {
    slowNetwork: "মনে হচ্ছে আপনার নেটওয়ার্ক খুব দুর্বল বা একেবারেই নেই। হালনাগাদ পেতে KunThai রিফ্রেশ করুন।",
    refresh: "রিফ্রেশ",
  },
  id: {
    slowNetwork: "Sepertinya jaringan Anda sangat lemah atau tidak ada sama sekali. Muat ulang KunThai untuk mengikuti perkembangan.",
    refresh: "Muat ulang",
  },
  ur: {
    slowNetwork: "لگتا ہے آپ کا نیٹ ورک بہت کمزور ہے یا بالکل نہیں ہے۔ تازہ ترین دیکھنے کے لیے KunThai ریفریش کریں۔",
    refresh: "ریفریش",
  },
  ru: {
    slowNetwork: "Похоже, у вас очень слабая сеть или её нет совсем. Обновите KunThai, чтобы всё загрузилось.",
    refresh: "Обновить",
  },
  ja: {
    slowNetwork: "ネットワークが非常に弱いか、接続されていないようです。KunThai を更新して最新の状態にしてください。",
    refresh: "更新",
  },
  mr: {
    slowNetwork: "तुमचे नेटवर्क खूप कमकुवत आहे किंवा अजिबात नाही असे दिसते. ताजे पाहण्यासाठी KunThai रिफ्रेश करा.",
    refresh: "रिफ्रेश करा",
  },
  vi: {
    slowNetwork: "Có vẻ mạng của bạn rất yếu hoặc không có mạng. Hãy làm mới KunThai để cập nhật.",
    refresh: "Làm mới",
  },
  de: {
    slowNetwork: "Ihr Netz scheint sehr schwach oder gar nicht verfügbar zu sein. Aktualisieren Sie KunThai, um auf den neuesten Stand zu kommen.",
    refresh: "Aktualisieren",
  },
};
