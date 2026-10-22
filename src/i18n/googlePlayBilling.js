// Google Play Billing panel for Visibility Credits in the Android app (2026-10-20).
// Grafted onto TRANSLATIONS as `googlePlayBilling`; read with
// t("googlePlayBilling.<key>"). Only the store-specific lines live here; the
// rest of the panel reuses `appleIap` lines that name no store. Every locale
// must carry the same keys. "Visibility Credits" and "Google Play" stay as they are.
export const GOOGLE_PLAY_BILLING = {
  en: {
    intro: "Choose a pack. You pay with the payment method on your Google Play account.",
    buying: "Waiting for Google Play…",
    pending: "Your payment is still being processed. The credits are added as soon as Google Play confirms it.",
    note: "Payments are processed by Google Play. Credits go to your personal balance.",
  },
  fr: {
    intro: "Choisissez un pack. Vous payez avec le moyen de paiement de votre compte Google Play.",
    buying: "En attente de Google Play…",
    pending: "Votre paiement est en cours de traitement. Les crédits seront ajoutés dès que Google Play le confirmera.",
    note: "Les paiements sont traités par Google Play. Les crédits vont sur votre solde personnel.",
  },
  es: {
    intro: "Elige un paquete. Pagas con el método de pago de tu cuenta de Google Play.",
    buying: "Esperando a Google Play…",
    pending: "Tu pago aún se está procesando. Los créditos se añaden en cuanto Google Play lo confirme.",
    note: "Google Play procesa los pagos. Los créditos van a tu saldo personal.",
  },
  zh: {
    intro: "选择一个套餐。使用你 Google Play 账户中的付款方式付款。",
    buying: "正在等待 Google Play…",
    pending: "你的付款仍在处理中。Google Play 确认后会立即添加积分。",
    note: "付款由 Google Play 处理。积分将存入你的个人余额。",
  },
  ar: {
    intro: "اختر باقة. تدفع بطريقة الدفع المسجلة في حساب Google Play.",
    buying: "بانتظار Google Play…",
    pending: "لا تزال عملية الدفع قيد المعالجة. ستُضاف الأرصدة فور تأكيد Google Play لها.",
    note: "تعالج Google Play المدفوعات. تذهب الأرصدة إلى رصيدك الشخصي.",
  },
  pt: {
    intro: "Escolha um pacote. Você paga com a forma de pagamento da sua conta Google Play.",
    buying: "Aguardando o Google Play…",
    pending: "Seu pagamento ainda está sendo processado. Os créditos são adicionados assim que o Google Play confirmar.",
    note: "Os pagamentos são processados pelo Google Play. Os créditos vão para o seu saldo pessoal.",
  },
  hi: {
    intro: "एक पैक चुनें। आप अपने Google Play खाते के भुगतान तरीके से भुगतान करते हैं।",
    buying: "Google Play की प्रतीक्षा की जा रही है…",
    pending: "आपका भुगतान अभी प्रोसेस हो रहा है। Google Play की पुष्टि होते ही क्रेडिट जोड़ दिए जाएंगे।",
    note: "भुगतान Google Play द्वारा प्रोसेस किए जाते हैं। क्रेडिट आपके निजी बैलेंस में जाते हैं।",
  },
  bn: {
    intro: "একটি প্যাক বেছে নিন। আপনার Google Play অ্যাকাউন্টের পেমেন্ট পদ্ধতিতে পেমেন্ট হবে।",
    buying: "Google Play-এর জন্য অপেক্ষা করা হচ্ছে…",
    pending: "আপনার পেমেন্ট এখনও প্রক্রিয়াধীন। Google Play নিশ্চিত করলেই ক্রেডিট যোগ হবে।",
    note: "পেমেন্ট Google Play প্রক্রিয়া করে। ক্রেডিট আপনার ব্যক্তিগত ব্যালেন্সে যায়।",
  },
  id: {
    intro: "Pilih paket. Anda membayar dengan metode pembayaran di akun Google Play Anda.",
    buying: "Menunggu Google Play…",
    pending: "Pembayaran Anda masih diproses. Kredit ditambahkan segera setelah Google Play mengonfirmasinya.",
    note: "Pembayaran diproses oleh Google Play. Kredit masuk ke saldo pribadi Anda.",
  },
  ur: {
    intro: "ایک پیک منتخب کریں۔ آپ اپنے Google Play اکاؤنٹ کے ادائیگی کے طریقے سے ادائیگی کرتے ہیں۔",
    buying: "Google Play کا انتظار ہے…",
    pending: "آپ کی ادائیگی ابھی پروسیس ہو رہی ہے۔ Google Play کی تصدیق ہوتے ہی کریڈٹس شامل کر دیے جائیں گے۔",
    note: "ادائیگیاں Google Play پروسیس کرتا ہے۔ کریڈٹس آپ کے ذاتی بیلنس میں جاتے ہیں۔",
  },
  ru: {
    intro: "Выберите пакет. Оплата проходит способом оплаты из вашего аккаунта Google Play.",
    buying: "Ожидание Google Play…",
    pending: "Ваш платёж ещё обрабатывается. Кредиты будут добавлены, как только Google Play его подтвердит.",
    note: "Платежи обрабатывает Google Play. Кредиты зачисляются на ваш личный баланс.",
  },
  ja: {
    intro: "パックを選んでください。Google Play アカウントのお支払い方法で支払います。",
    buying: "Google Play を待っています…",
    pending: "お支払いはまだ処理中です。Google Play で確認され次第、クレジットが追加されます。",
    note: "お支払いは Google Play が処理します。クレジットはあなたの個人残高に追加されます。",
  },
  mr: {
    intro: "एक पॅक निवडा. तुम्ही तुमच्या Google Play खात्यातील पेमेंट पद्धतीने पैसे भरता.",
    buying: "Google Play ची प्रतीक्षा करत आहे…",
    pending: "तुमचे पेमेंट अजून प्रक्रियेत आहे. Google Play ने पुष्टी करताच क्रेडिट जोडले जातील.",
    note: "पेमेंट Google Play द्वारे प्रक्रिया केली जातात. क्रेडिट तुमच्या वैयक्तिक शिल्लकेत जातात.",
  },
  vi: {
    intro: "Chọn một gói. Bạn thanh toán bằng phương thức thanh toán trong tài khoản Google Play của mình.",
    buying: "Đang chờ Google Play…",
    pending: "Khoản thanh toán của bạn vẫn đang được xử lý. Tín dụng sẽ được thêm ngay khi Google Play xác nhận.",
    note: "Thanh toán do Google Play xử lý. Tín dụng được chuyển vào số dư cá nhân của bạn.",
  },
  de: {
    intro: "Wähle ein Paket. Du bezahlst mit der Zahlungsmethode deines Google Play-Kontos.",
    buying: "Warten auf Google Play…",
    pending: "Deine Zahlung wird noch verarbeitet. Die Credits werden hinzugefügt, sobald Google Play sie bestätigt.",
    note: "Zahlungen werden von Google Play abgewickelt. Credits gehen auf dein persönliches Guthaben.",
  },
};
