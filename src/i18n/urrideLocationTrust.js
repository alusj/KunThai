// Honest distances in UrRide (2026-10-20). When the operator's or the
// passenger's position is rough (a 300 m cell fix indoors), a card no longer
// claims "210 m away" for two phones side by side. Grafted onto TRANSLATIONS
// as `urrideLocationTrust`; every locale carries the same keys.
export const URRIDE_LOCATION_TRUST = {
  en: { veryClose: "Very close to you", approxDistanceEta: "About {distance} · {eta} min away", roughOperatorHint: "Your position is approximate (about {m} m). Turn on Wi-Fi or step outside so passengers see where you really are.", refreshPosition: "Refresh" },
  fr: { veryClose: "Tout près de vous", approxDistanceEta: "Environ {distance} · à {eta} min", roughOperatorHint: "Votre position est approximative (environ {m} m). Activez le Wi-Fi ou sortez pour que les passagers voient où vous êtes vraiment.", refreshPosition: "Actualiser" },
  es: { veryClose: "Muy cerca de ti", approxDistanceEta: "Unos {distance} · a {eta} min", roughOperatorHint: "Tu posición es aproximada (unos {m} m). Activa el Wi-Fi o sal al exterior para que los pasajeros vean dónde estás de verdad.", refreshPosition: "Actualizar" },
  zh: { veryClose: "就在您附近", approxDistanceEta: "约 {distance} · {eta} 分钟", roughOperatorHint: "您的位置不够精确（约 {m} 米）。请打开 Wi-Fi 或到室外，让乘客看到您的真实位置。", refreshPosition: "刷新" },
  ar: { veryClose: "قريب جدًا منك", approxDistanceEta: "حوالي {distance} · على بعد {eta} دقيقة", roughOperatorHint: "موقعك تقريبي (حوالي {m} م). شغّل الواي فاي أو اخرج إلى مكان مفتوح ليرى الركاب مكانك الحقيقي.", refreshPosition: "تحديث" },
  pt: { veryClose: "Muito perto de si", approxDistanceEta: "Cerca de {distance} · a {eta} min", roughOperatorHint: "A sua posição é aproximada (cerca de {m} m). Ligue o Wi-Fi ou vá para o exterior para os passageiros verem onde está realmente.", refreshPosition: "Atualizar" },
  hi: { veryClose: "आपके बहुत पास", approxDistanceEta: "लगभग {distance} · {eta} मिनट दूर", roughOperatorHint: "आपकी लोकेशन अनुमानित है (लगभग {m} मी)। वाई-फ़ाई चालू करें या बाहर जाएँ ताकि यात्री आपकी असली जगह देख सकें।", refreshPosition: "रीफ़्रेश" },
  bn: { veryClose: "আপনার খুব কাছে", approxDistanceEta: "প্রায় {distance} · {eta} মিনিট দূরে", roughOperatorHint: "আপনার অবস্থান আনুমানিক (প্রায় {m} মি)। ওয়াই-ফাই চালু করুন বা বাইরে যান, যাতে যাত্রীরা আপনার আসল অবস্থান দেখতে পান।", refreshPosition: "রিফ্রেশ" },
  id: { veryClose: "Sangat dekat dengan Anda", approxDistanceEta: "Sekitar {distance} · {eta} menit lagi", roughOperatorHint: "Posisi Anda perkiraan (sekitar {m} m). Nyalakan Wi-Fi atau keluar ruangan agar penumpang melihat lokasi Anda yang sebenarnya.", refreshPosition: "Segarkan" },
  ur: { veryClose: "آپ کے بالکل قریب", approxDistanceEta: "تقریباً {distance} · {eta} منٹ دور", roughOperatorHint: "آپ کا مقام اندازاً ہے (تقریباً {m} میٹر)۔ وائی فائی آن کریں یا باہر جائیں تاکہ مسافر آپ کی اصل جگہ دیکھ سکیں۔", refreshPosition: "تازہ کریں" },
  ru: { veryClose: "Совсем рядом с вами", approxDistanceEta: "Около {distance} · {eta} мин", roughOperatorHint: "Ваше местоположение приблизительное (около {m} м). Включите Wi-Fi или выйдите на улицу, чтобы пассажиры видели, где вы на самом деле.", refreshPosition: "Обновить" },
  ja: { veryClose: "すぐ近くにいます", approxDistanceEta: "約 {distance} · {eta} 分", roughOperatorHint: "現在地はおおよそです（約 {m} m）。Wi-Fi をオンにするか屋外に出ると、乗客に正しい位置が表示されます。", refreshPosition: "更新" },
  mr: { veryClose: "तुमच्या अगदी जवळ", approxDistanceEta: "सुमारे {distance} · {eta} मिनिटे दूर", roughOperatorHint: "तुमचे ठिकाण अंदाजे आहे (सुमारे {m} मी). वाय-फाय चालू करा किंवा बाहेर जा, म्हणजे प्रवाशांना तुमचे खरे ठिकाण दिसेल.", refreshPosition: "रिफ्रेश" },
  vi: { veryClose: "Rất gần bạn", approxDistanceEta: "Khoảng {distance} · còn {eta} phút", roughOperatorHint: "Vị trí của bạn chỉ là ước tính (khoảng {m} m). Hãy bật Wi-Fi hoặc ra ngoài trời để hành khách thấy đúng vị trí của bạn.", refreshPosition: "Làm mới" },
  de: { veryClose: "Ganz in deiner Nähe", approxDistanceEta: "Etwa {distance} · {eta} Min. entfernt", roughOperatorHint: "Dein Standort ist ungenau (etwa {m} m). Schalte WLAN ein oder geh nach draußen, damit Fahrgäste sehen, wo du wirklich bist.", refreshPosition: "Aktualisieren" },
};
