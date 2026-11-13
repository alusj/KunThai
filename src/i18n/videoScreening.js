// The post card's video check (2026-11-13): what it says when an attached
// clip is over the size limit or the phone could not prepare it. Grafted onto
// TRANSLATIONS as `videoScreening` and read with t("videoScreening.<key>").
// Every locale must carry the same keys and placeholders ({size}, {limit}).
export const VIDEO_SCREENING = {
  en: {
    tooLarge: "This clip is {size} MB, over the {limit} MB limit. Trim a shorter part.",
    notPrepared: "This video ({size} MB) could not be prepared on this phone. Trim a shorter part or choose another video.",
    notSmallEnough: "This video could not be made small enough to post. Trim a shorter part and try again.",
  },
  fr: {
    tooLarge: "Ce clip fait {size} Mo, au-delà de la limite de {limit} Mo. Coupez une partie plus courte.",
    notPrepared: "Cette vidéo ({size} Mo) n'a pas pu être préparée sur ce téléphone. Coupez une partie plus courte ou choisissez une autre vidéo.",
    notSmallEnough: "Cette vidéo n'a pas pu être assez réduite pour être publiée. Coupez une partie plus courte et réessayez.",
  },
  es: {
    tooLarge: "Este clip pesa {size} MB, más del límite de {limit} MB. Recorta una parte más corta.",
    notPrepared: "Este video ({size} MB) no se pudo preparar en este teléfono. Recorta una parte más corta o elige otro video.",
    notSmallEnough: "Este video no se pudo reducir lo suficiente para publicarlo. Recorta una parte más corta e inténtalo de nuevo.",
  },
  zh: {
    tooLarge: "此片段为 {size} MB，超过 {limit} MB 的限制。请剪辑更短的一段。",
    notPrepared: "此视频（{size} MB）无法在这部手机上处理。请剪辑更短的一段或选择其他视频。",
    notSmallEnough: "此视频无法压缩到可发布的大小。请剪辑更短的一段后重试。",
  },
  ar: {
    tooLarge: "حجم هذا المقطع {size} ميغابايت، وهو أكبر من الحد المسموح {limit} ميغابايت. قص جزءًا أقصر.",
    notPrepared: "تعذر تجهيز هذا الفيديو ({size} ميغابايت) على هذا الهاتف. قص جزءًا أقصر أو اختر فيديو آخر.",
    notSmallEnough: "تعذر تصغير هذا الفيديو بما يكفي لنشره. قص جزءًا أقصر وحاول مرة أخرى.",
  },
  pt: {
    tooLarge: "Este clipe tem {size} MB, acima do limite de {limit} MB. Corte uma parte mais curta.",
    notPrepared: "Este vídeo ({size} MB) não pôde ser preparado neste telefone. Corte uma parte mais curta ou escolha outro vídeo.",
    notSmallEnough: "Não foi possível reduzir este vídeo o suficiente para publicar. Corte uma parte mais curta e tente novamente.",
  },
  hi: {
    tooLarge: "यह क्लिप {size} MB की है, जो {limit} MB की सीमा से ज़्यादा है। छोटा हिस्सा ट्रिम करें।",
    notPrepared: "यह वीडियो ({size} MB) इस फ़ोन पर तैयार नहीं हो सका। छोटा हिस्सा ट्रिम करें या कोई दूसरा वीडियो चुनें।",
    notSmallEnough: "यह वीडियो पोस्ट करने लायक छोटा नहीं हो सका। छोटा हिस्सा ट्रिम करें और फिर कोशिश करें।",
  },
  bn: {
    tooLarge: "এই ক্লিপটি {size} MB, যা {limit} MB সীমার বেশি। আরও ছোট অংশ ট্রিম করুন।",
    notPrepared: "এই ভিডিওটি ({size} MB) এই ফোনে প্রস্তুত করা যায়নি। আরও ছোট অংশ ট্রিম করুন বা অন্য ভিডিও বেছে নিন।",
    notSmallEnough: "এই ভিডিওটি পোস্ট করার মতো ছোট করা যায়নি। আরও ছোট অংশ ট্রিম করে আবার চেষ্টা করুন।",
  },
  id: {
    tooLarge: "Klip ini berukuran {size} MB, melebihi batas {limit} MB. Potong bagian yang lebih pendek.",
    notPrepared: "Video ini ({size} MB) tidak dapat disiapkan di ponsel ini. Potong bagian yang lebih pendek atau pilih video lain.",
    notSmallEnough: "Video ini tidak dapat dibuat cukup kecil untuk diposting. Potong bagian yang lebih pendek lalu coba lagi.",
  },
  ur: {
    tooLarge: "یہ کلپ {size} MB کا ہے، جو {limit} MB کی حد سے زیادہ ہے۔ چھوٹا حصہ ٹرم کریں۔",
    notPrepared: "یہ ویڈیو ({size} MB) اس فون پر تیار نہیں ہو سکی۔ چھوٹا حصہ ٹرم کریں یا کوئی اور ویڈیو منتخب کریں۔",
    notSmallEnough: "یہ ویڈیو پوسٹ کرنے کے لیے کافی چھوٹی نہیں ہو سکی۔ چھوٹا حصہ ٹرم کریں اور دوبارہ کوشش کریں۔",
  },
  ru: {
    tooLarge: "Этот клип весит {size} МБ — больше лимита в {limit} МБ. Обрежьте более короткий фрагмент.",
    notPrepared: "Это видео ({size} МБ) не удалось подготовить на этом телефоне. Обрежьте более короткий фрагмент или выберите другое видео.",
    notSmallEnough: "Это видео не удалось достаточно уменьшить для публикации. Обрежьте более короткий фрагмент и попробуйте снова.",
  },
  ja: {
    tooLarge: "このクリップは {size} MB で、上限の {limit} MB を超えています。もっと短くトリミングしてください。",
    notPrepared: "この動画（{size} MB）はこのスマートフォンで準備できませんでした。もっと短くトリミングするか、別の動画を選んでください。",
    notSmallEnough: "この動画は投稿できるサイズまで小さくできませんでした。もっと短くトリミングして、もう一度お試しください。",
  },
  mr: {
    tooLarge: "ही क्लिप {size} MB आहे, जी {limit} MB मर्यादेपेक्षा जास्त आहे. लहान भाग ट्रिम करा.",
    notPrepared: "हा व्हिडिओ ({size} MB) या फोनवर तयार करता आला नाही. लहान भाग ट्रिम करा किंवा दुसरा व्हिडिओ निवडा.",
    notSmallEnough: "हा व्हिडिओ पोस्ट करण्याइतका लहान करता आला नाही. लहान भाग ट्रिम करा आणि पुन्हा प्रयत्न करा.",
  },
  vi: {
    tooLarge: "Đoạn clip này nặng {size} MB, vượt giới hạn {limit} MB. Hãy cắt một phần ngắn hơn.",
    notPrepared: "Không thể chuẩn bị video này ({size} MB) trên điện thoại này. Hãy cắt một phần ngắn hơn hoặc chọn video khác.",
    notSmallEnough: "Không thể thu nhỏ video này đủ để đăng. Hãy cắt một phần ngắn hơn rồi thử lại.",
  },
  de: {
    tooLarge: "Dieser Clip ist {size} MB groß und liegt über dem Limit von {limit} MB. Schneide einen kürzeren Teil zu.",
    notPrepared: "Dieses Video ({size} MB) konnte auf diesem Handy nicht vorbereitet werden. Schneide einen kürzeren Teil zu oder wähle ein anderes Video.",
    notSmallEnough: "Dieses Video konnte nicht klein genug zum Posten gemacht werden. Schneide einen kürzeren Teil zu und versuche es erneut.",
  },
};
