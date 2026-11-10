// Answering a location request in Explore messages: Approve or Decline, and
// the answer shown on the request card (2026-11-10). Grafted onto TRANSLATIONS
// as `locationRequestReply`; read with t("locationRequestReply.<key>").
export const LOCATION_REQUEST_REPLY = {
  en: { decline: "Decline", declinedBody: "{name} declined the location request.", approved: "Approved", declined: "Declined" },
  fr: { decline: "Refuser", declinedBody: "{name} a refusé la demande de localisation.", approved: "Approuvée", declined: "Refusée" },
  es: { decline: "Rechazar", declinedBody: "{name} rechazó la solicitud de ubicación.", approved: "Aprobada", declined: "Rechazada" },
  zh: { decline: "拒绝", declinedBody: "{name} 拒绝了位置请求。", approved: "已同意", declined: "已拒绝" },
  ar: { decline: "رفض", declinedBody: "رفض {name} طلب الموقع.", approved: "تمت الموافقة", declined: "مرفوض" },
  pt: { decline: "Recusar", declinedBody: "{name} recusou o pedido de localização.", approved: "Aprovado", declined: "Recusado" },
  hi: { decline: "अस्वीकार करें", declinedBody: "{name} ने लोकेशन अनुरोध अस्वीकार कर दिया।", approved: "स्वीकृत", declined: "अस्वीकृत" },
  bn: { decline: "প্রত্যাখ্যান", declinedBody: "{name} অবস্থানের অনুরোধ প্রত্যাখ্যান করেছেন।", approved: "অনুমোদিত", declined: "প্রত্যাখ্যাত" },
  id: { decline: "Tolak", declinedBody: "{name} menolak permintaan lokasi.", approved: "Disetujui", declined: "Ditolak" },
  ur: { decline: "مسترد کریں", declinedBody: "{name} نے مقام کی درخواست مسترد کر دی۔", approved: "منظور", declined: "مسترد" },
  ru: { decline: "Отклонить", declinedBody: "{name} отклонил(а) запрос местоположения.", approved: "Одобрено", declined: "Отклонено" },
  ja: { decline: "拒否", declinedBody: "{name}さんが位置情報のリクエストを拒否しました。", approved: "承認済み", declined: "拒否済み" },
  mr: { decline: "नाकारा", declinedBody: "{name} यांनी स्थानाची विनंती नाकारली.", approved: "मंजूर", declined: "नाकारले" },
  vi: { decline: "Từ chối", declinedBody: "{name} đã từ chối yêu cầu vị trí.", approved: "Đã chấp nhận", declined: "Đã từ chối" },
  de: { decline: "Ablehnen", declinedBody: "{name} hat die Standortanfrage abgelehnt.", approved: "Genehmigt", declined: "Abgelehnt" },
};
