// UrRide Phase 2: native background location for online operators (2026-10-15).
// Each locale's section is grafted onto TRANSLATIONS as `urrideBackgroundLocation` and read with
// t("urrideBackgroundLocation.<key>"). Every locale must carry the same keys.
//
// notificationTitle / notificationMessage: Android's persistent foreground-service
// notification while an online operator shares their position.
// sheet*: the explanation shown when the operator switches Active on in the app.
// *Hint / openSettings: the amber line under "Visible to passengers".
export const URRIDE_BACKGROUND_LOCATION = {
  en: {
    notificationTitle: "KunThai: you're online",
    notificationMessage: "Nearby passengers can see you. Go offline in KunThai to stop sharing your location.",
    sheetTitle: "Stay visible with your phone locked",
    sheetBodyIos:
      "To stay visible to passengers while your phone is locked, allow location “Always” for KunThai. Like Uber and Bolt drivers, you keep getting bookings with KunThai in the background.",
    sheetBodyAndroid:
      "To stay visible to passengers while your phone is locked, allow location and notifications for KunThai. Like Uber and Bolt drivers, you keep getting bookings with KunThai in the background.",
    sheetOnlyOnline: "Your location is shared only while you are online (Active).",
    sheetStops: "Sharing stops as soon as you go offline, sign out or switch account.",
    sheetAndroidNotice: "While you share, Android shows a “KunThai: you're online” notification.",
    continue: "Continue",
    notNow: "Not now",
    foregroundOnlyHint:
      "Location is set to “While using”. Passengers may stop seeing you when your phone is locked. Choose “Always” to stay visible.",
    deniedHint: "Location is off for KunThai, so passengers can't see you. Turn it on in Settings.",
    openSettings: "Open settings",
  },
  fr: {
    notificationTitle: "KunThai : vous êtes en ligne",
    notificationMessage:
      "Les passagers à proximité vous voient. Passez hors ligne dans KunThai pour arrêter de partager votre position.",
    sheetTitle: "Restez visible téléphone verrouillé",
    sheetBodyIos:
      "Pour rester visible des passagers quand votre téléphone est verrouillé, autorisez la localisation « Toujours » pour KunThai. Comme les chauffeurs Uber et Bolt, vous continuez à recevoir des réservations avec KunThai en arrière-plan.",
    sheetBodyAndroid:
      "Pour rester visible des passagers quand votre téléphone est verrouillé, autorisez la localisation et les notifications pour KunThai. Comme les chauffeurs Uber et Bolt, vous continuez à recevoir des réservations avec KunThai en arrière-plan.",
    sheetOnlyOnline: "Votre position n'est partagée que lorsque vous êtes en ligne (Actif).",
    sheetStops: "Le partage s'arrête dès que vous passez hors ligne, vous déconnectez ou changez de compte.",
    sheetAndroidNotice: "Pendant le partage, Android affiche la notification « KunThai : vous êtes en ligne ».",
    continue: "Continuer",
    notNow: "Plus tard",
    foregroundOnlyHint:
      "La localisation est réglée sur « Lorsque l'app est active ». Les passagers peuvent ne plus vous voir téléphone verrouillé. Choisissez « Toujours » pour rester visible.",
    deniedHint:
      "La localisation est désactivée pour KunThai : les passagers ne vous voient pas. Activez-la dans les Réglages.",
    openSettings: "Ouvrir les réglages",
  },
  es: {
    notificationTitle: "KunThai: estás en línea",
    notificationMessage:
      "Los pasajeros cercanos pueden verte. Desconéctate en KunThai para dejar de compartir tu ubicación.",
    sheetTitle: "Sigue visible con el teléfono bloqueado",
    sheetBodyIos:
      "Para que los pasajeros te sigan viendo con el teléfono bloqueado, permite la ubicación «Siempre» para KunThai. Como los conductores de Uber y Bolt, sigues recibiendo reservas con KunThai en segundo plano.",
    sheetBodyAndroid:
      "Para que los pasajeros te sigan viendo con el teléfono bloqueado, permite la ubicación y las notificaciones para KunThai. Como los conductores de Uber y Bolt, sigues recibiendo reservas con KunThai en segundo plano.",
    sheetOnlyOnline: "Tu ubicación solo se comparte mientras estás en línea (Activo).",
    sheetStops: "Se deja de compartir en cuanto te desconectas, cierras sesión o cambias de cuenta.",
    sheetAndroidNotice: "Mientras compartes, Android muestra la notificación «KunThai: estás en línea».",
    continue: "Continuar",
    notNow: "Ahora no",
    foregroundOnlyHint:
      "La ubicación está en «Mientras se usa la app». Es posible que los pasajeros dejen de verte con el teléfono bloqueado. Elige «Siempre» para seguir visible.",
    deniedHint: "La ubicación está desactivada para KunThai y los pasajeros no te ven. Actívala en Ajustes.",
    openSettings: "Abrir ajustes",
  },
  zh: {
    notificationTitle: "KunThai：您已上线",
    notificationMessage: "附近的乘客可以看到您。在 KunThai 中下线即可停止共享位置。",
    sheetTitle: "锁屏时也保持可见",
    sheetBodyIos:
      "要在手机锁屏时仍对乘客可见，请为 KunThai 选择“始终”允许定位。就像 Uber 和 Bolt 司机一样，KunThai 在后台时您也能继续接到预订。",
    sheetBodyAndroid:
      "要在手机锁屏时仍对乘客可见，请允许 KunThai 使用定位和通知。就像 Uber 和 Bolt 司机一样，KunThai 在后台时您也能继续接到预订。",
    sheetOnlyOnline: "只有在您在线（活跃）时才会共享您的位置。",
    sheetStops: "一旦您下线、退出登录或切换账户，共享就会立即停止。",
    sheetAndroidNotice: "共享期间，Android 会显示“KunThai：您已上线”通知。",
    continue: "继续",
    notNow: "暂不",
    foregroundOnlyHint: "定位权限为“使用 App 期间”。手机锁屏后乘客可能看不到您。请选择“始终”以保持可见。",
    deniedHint: "KunThai 的定位已关闭，乘客无法看到您。请在“设置”中开启。",
    openSettings: "打开设置",
  },
  ar: {
    notificationTitle: "KunThai: أنت متصل",
    notificationMessage: "يمكن للركاب القريبين رؤيتك. انتقل إلى وضع غير متصل في KunThai لإيقاف مشاركة موقعك.",
    sheetTitle: "ابقَ مرئيًا وهاتفك مقفل",
    sheetBodyIos:
      "لتبقى مرئيًا للركاب وهاتفك مقفل، اسمح بالموقع «دائمًا» لتطبيق KunThai. مثل سائقي Uber وBolt، تستمر في تلقي الحجوزات وKunThai يعمل في الخلفية.",
    sheetBodyAndroid:
      "لتبقى مرئيًا للركاب وهاتفك مقفل، اسمح بالموقع والإشعارات لتطبيق KunThai. مثل سائقي Uber وBolt، تستمر في تلقي الحجوزات وKunThai يعمل في الخلفية.",
    sheetOnlyOnline: "تتم مشاركة موقعك فقط أثناء اتصالك (نشط).",
    sheetStops: "تتوقف المشاركة فور انتقالك إلى غير متصل أو تسجيل الخروج أو تبديل الحساب.",
    sheetAndroidNotice: "أثناء المشاركة، يعرض Android إشعار «KunThai: أنت متصل».",
    continue: "متابعة",
    notNow: "ليس الآن",
    foregroundOnlyHint:
      "الموقع مضبوط على «أثناء استخدام التطبيق». قد يتوقف الركاب عن رؤيتك عند قفل الهاتف. اختر «دائمًا» لتبقى مرئيًا.",
    deniedHint: "الموقع متوقف لتطبيق KunThai، لذا لا يراك الركاب. فعّله من الإعدادات.",
    openSettings: "فتح الإعدادات",
  },
  pt: {
    notificationTitle: "KunThai: você está online",
    notificationMessage:
      "Passageiros próximos podem ver você. Fique offline no KunThai para parar de compartilhar sua localização.",
    sheetTitle: "Continue visível com o celular bloqueado",
    sheetBodyIos:
      "Para continuar visível aos passageiros com o celular bloqueado, permita a localização “Sempre” para o KunThai. Como os motoristas da Uber e da Bolt, você continua recebendo reservas com o KunThai em segundo plano.",
    sheetBodyAndroid:
      "Para continuar visível aos passageiros com o celular bloqueado, permita a localização e as notificações para o KunThai. Como os motoristas da Uber e da Bolt, você continua recebendo reservas com o KunThai em segundo plano.",
    sheetOnlyOnline: "Sua localização só é compartilhada enquanto você está online (Ativo).",
    sheetStops: "O compartilhamento para assim que você fica offline, sai da conta ou troca de conta.",
    sheetAndroidNotice: "Enquanto você compartilha, o Android mostra a notificação “KunThai: você está online”.",
    continue: "Continuar",
    notNow: "Agora não",
    foregroundOnlyHint:
      "A localização está em “Durante o uso do app”. Os passageiros podem deixar de ver você com o celular bloqueado. Escolha “Sempre” para continuar visível.",
    deniedHint: "A localização está desativada para o KunThai, então os passageiros não veem você. Ative-a nos Ajustes.",
    openSettings: "Abrir ajustes",
  },
  hi: {
    notificationTitle: "KunThai: आप ऑनलाइन हैं",
    notificationMessage: "आस-पास के यात्री आपको देख सकते हैं। लोकेशन शेयर करना बंद करने के लिए KunThai में ऑफ़लाइन हो जाएँ।",
    sheetTitle: "फ़ोन लॉक होने पर भी दिखते रहें",
    sheetBodyIos:
      "फ़ोन लॉक होने पर भी यात्रियों को दिखते रहने के लिए KunThai को लोकेशन “हमेशा” की अनुमति दें। Uber और Bolt ड्राइवरों की तरह, KunThai बैकग्राउंड में होने पर भी आपको बुकिंग मिलती रहेंगी।",
    sheetBodyAndroid:
      "फ़ोन लॉक होने पर भी यात्रियों को दिखते रहने के लिए KunThai को लोकेशन और सूचनाओं की अनुमति दें। Uber और Bolt ड्राइवरों की तरह, KunThai बैकग्राउंड में होने पर भी आपको बुकिंग मिलती रहेंगी।",
    sheetOnlyOnline: "आपकी लोकेशन सिर्फ़ तब शेयर होती है जब आप ऑनलाइन (सक्रिय) हों।",
    sheetStops: "ऑफ़लाइन होते, साइन आउट करते या खाता बदलते ही शेयर करना बंद हो जाता है।",
    sheetAndroidNotice: "शेयर करते समय Android “KunThai: आप ऑनलाइन हैं” सूचना दिखाता है।",
    continue: "जारी रखें",
    notNow: "अभी नहीं",
    foregroundOnlyHint:
      "लोकेशन “ऐप का उपयोग करते समय” पर सेट है। फ़ोन लॉक होने पर यात्री शायद आपको न देख पाएँ। दिखते रहने के लिए “हमेशा” चुनें।",
    deniedHint: "KunThai के लिए लोकेशन बंद है, इसलिए यात्री आपको नहीं देख सकते। इसे सेटिंग्स में चालू करें।",
    openSettings: "सेटिंग्स खोलें",
  },
  bn: {
    notificationTitle: "KunThai: আপনি অনলাইনে আছেন",
    notificationMessage: "কাছাকাছি যাত্রীরা আপনাকে দেখতে পাচ্ছেন। লোকেশন শেয়ার বন্ধ করতে KunThai-এ অফলাইন হন।",
    sheetTitle: "ফোন লক থাকলেও দৃশ্যমান থাকুন",
    sheetBodyIos:
      "ফোন লক থাকলেও যাত্রীদের কাছে দৃশ্যমান থাকতে KunThai-কে লোকেশন “সবসময়” অনুমতি দিন। Uber ও Bolt চালকদের মতো, KunThai ব্যাকগ্রাউন্ডে থাকলেও আপনি বুকিং পেতে থাকবেন।",
    sheetBodyAndroid:
      "ফোন লক থাকলেও যাত্রীদের কাছে দৃশ্যমান থাকতে KunThai-কে লোকেশন ও নোটিফিকেশনের অনুমতি দিন। Uber ও Bolt চালকদের মতো, KunThai ব্যাকগ্রাউন্ডে থাকলেও আপনি বুকিং পেতে থাকবেন।",
    sheetOnlyOnline: "আপনি অনলাইনে (সক্রিয়) থাকলেই কেবল আপনার লোকেশন শেয়ার হয়।",
    sheetStops: "অফলাইন হলে, সাইন আউট করলে বা অ্যাকাউন্ট বদলালে সঙ্গে সঙ্গে শেয়ার বন্ধ হয়।",
    sheetAndroidNotice: "শেয়ার চলাকালীন Android “KunThai: আপনি অনলাইনে আছেন” নোটিফিকেশন দেখায়।",
    continue: "চালিয়ে যান",
    notNow: "এখন নয়",
    foregroundOnlyHint:
      "লোকেশন “অ্যাপ ব্যবহারের সময়” এ সেট আছে। ফোন লক থাকলে যাত্রীরা হয়তো আপনাকে দেখতে পাবেন না। দৃশ্যমান থাকতে “সবসময়” বেছে নিন।",
    deniedHint: "KunThai-এর জন্য লোকেশন বন্ধ, তাই যাত্রীরা আপনাকে দেখতে পাচ্ছেন না। সেটিংসে এটি চালু করুন।",
    openSettings: "সেটিংস খুলুন",
  },
  id: {
    notificationTitle: "KunThai: Anda sedang online",
    notificationMessage:
      "Penumpang di sekitar dapat melihat Anda. Ubah ke offline di KunThai untuk berhenti membagikan lokasi Anda.",
    sheetTitle: "Tetap terlihat saat ponsel terkunci",
    sheetBodyIos:
      "Agar tetap terlihat oleh penumpang saat ponsel terkunci, izinkan lokasi “Selalu” untuk KunThai. Seperti pengemudi Uber dan Bolt, Anda tetap menerima pesanan saat KunThai berjalan di latar belakang.",
    sheetBodyAndroid:
      "Agar tetap terlihat oleh penumpang saat ponsel terkunci, izinkan lokasi dan notifikasi untuk KunThai. Seperti pengemudi Uber dan Bolt, Anda tetap menerima pesanan saat KunThai berjalan di latar belakang.",
    sheetOnlyOnline: "Lokasi Anda hanya dibagikan saat Anda online (Aktif).",
    sheetStops: "Berbagi lokasi berhenti begitu Anda offline, keluar, atau berganti akun.",
    sheetAndroidNotice: "Selama berbagi, Android menampilkan notifikasi “KunThai: Anda sedang online”.",
    continue: "Lanjutkan",
    notNow: "Nanti saja",
    foregroundOnlyHint:
      "Lokasi diatur ke “Saat Menggunakan Aplikasi”. Penumpang mungkin tidak melihat Anda saat ponsel terkunci. Pilih “Selalu” agar tetap terlihat.",
    deniedHint: "Lokasi untuk KunThai nonaktif, jadi penumpang tidak dapat melihat Anda. Aktifkan di Pengaturan.",
    openSettings: "Buka pengaturan",
  },
  ur: {
    notificationTitle: "KunThai: آپ آن لائن ہیں",
    notificationMessage: "قریبی مسافر آپ کو دیکھ سکتے ہیں۔ مقام شیئر کرنا بند کرنے کے لیے KunThai میں آف لائن ہو جائیں۔",
    sheetTitle: "فون لاک ہونے پر بھی نظر آتے رہیں",
    sheetBodyIos:
      "فون لاک ہونے پر بھی مسافروں کو نظر آتے رہنے کے لیے KunThai کو مقام کی “ہمیشہ” اجازت دیں۔ Uber اور Bolt ڈرائیورز کی طرح، KunThai پس منظر میں ہونے پر بھی آپ کو بکنگز ملتی رہیں گی۔",
    sheetBodyAndroid:
      "فون لاک ہونے پر بھی مسافروں کو نظر آتے رہنے کے لیے KunThai کو مقام اور اطلاعات کی اجازت دیں۔ Uber اور Bolt ڈرائیورز کی طرح، KunThai پس منظر میں ہونے پر بھی آپ کو بکنگز ملتی رہیں گی۔",
    sheetOnlyOnline: "آپ کا مقام صرف اس وقت شیئر ہوتا ہے جب آپ آن لائن (فعال) ہوں۔",
    sheetStops: "آف لائن ہوتے، سائن آؤٹ کرتے یا اکاؤنٹ بدلتے ہی شیئرنگ بند ہو جاتی ہے۔",
    sheetAndroidNotice: "شیئرنگ کے دوران Android “KunThai: آپ آن لائن ہیں” کی اطلاع دکھاتا ہے۔",
    continue: "جاری رکھیں",
    notNow: "ابھی نہیں",
    foregroundOnlyHint:
      "مقام “ایپ استعمال کرتے وقت” پر سیٹ ہے۔ فون لاک ہونے پر مسافر شاید آپ کو نہ دیکھ سکیں۔ نظر آتے رہنے کے لیے “ہمیشہ” منتخب کریں۔",
    deniedHint: "KunThai کے لیے مقام بند ہے، اس لیے مسافر آپ کو نہیں دیکھ سکتے۔ اسے سیٹنگز میں آن کریں۔",
    openSettings: "سیٹنگز کھولیں",
  },
  ru: {
    notificationTitle: "KunThai: вы на линии",
    notificationMessage:
      "Пассажиры рядом видят вас. Перейдите в офлайн в KunThai, чтобы перестать делиться местоположением.",
    sheetTitle: "Оставайтесь видимым при заблокированном телефоне",
    sheetBodyIos:
      "Чтобы пассажиры видели вас, когда телефон заблокирован, разрешите KunThai доступ к геопозиции «Всегда». Как водители Uber и Bolt, вы продолжаете получать заказы, пока KunThai работает в фоне.",
    sheetBodyAndroid:
      "Чтобы пассажиры видели вас, когда телефон заблокирован, разрешите KunThai доступ к геопозиции и уведомлениям. Как водители Uber и Bolt, вы продолжаете получать заказы, пока KunThai работает в фоне.",
    sheetOnlyOnline: "Ваше местоположение передаётся, только пока вы на линии (Активен).",
    sheetStops: "Передача прекращается, как только вы уходите в офлайн, выходите из аккаунта или меняете его.",
    sheetAndroidNotice: "Во время передачи Android показывает уведомление «KunThai: вы на линии».",
    continue: "Продолжить",
    notNow: "Не сейчас",
    foregroundOnlyHint:
      "Доступ к геопозиции: «При использовании». Когда телефон заблокирован, пассажиры могут перестать вас видеть. Выберите «Всегда», чтобы оставаться видимым.",
    deniedHint: "Геопозиция для KunThai отключена, поэтому пассажиры вас не видят. Включите её в Настройках.",
    openSettings: "Открыть настройки",
  },
  ja: {
    notificationTitle: "KunThai：オンライン中",
    notificationMessage: "近くの乗客にあなたが表示されています。位置情報の共有を止めるには KunThai でオフラインにしてください。",
    sheetTitle: "画面ロック中も表示されたままに",
    sheetBodyIos:
      "スマートフォンがロックされていても乗客に表示されるよう、KunThai の位置情報を「常に」許可してください。Uber や Bolt のドライバーのように、KunThai がバックグラウンドでも予約を受け続けられます。",
    sheetBodyAndroid:
      "スマートフォンがロックされていても乗客に表示されるよう、KunThai に位置情報と通知を許可してください。Uber や Bolt のドライバーのように、KunThai がバックグラウンドでも予約を受け続けられます。",
    sheetOnlyOnline: "位置情報はオンライン（稼働中）の間だけ共有されます。",
    sheetStops: "オフラインにする、サインアウトする、またはアカウントを切り替えるとすぐに共有が止まります。",
    sheetAndroidNotice: "共有中、Android には「KunThai：オンライン中」の通知が表示されます。",
    continue: "続ける",
    notNow: "今はしない",
    foregroundOnlyHint:
      "位置情報が「このAppの使用中のみ」になっています。ロック中は乗客に表示されなくなる場合があります。表示され続けるには「常に」を選んでください。",
    deniedHint: "KunThai の位置情報がオフのため、乗客にあなたが表示されません。設定でオンにしてください。",
    openSettings: "設定を開く",
  },
  mr: {
    notificationTitle: "KunThai: तुम्ही ऑनलाइन आहात",
    notificationMessage: "जवळचे प्रवासी तुम्हाला पाहू शकतात. लोकेशन शेअर करणे थांबवण्यासाठी KunThai मध्ये ऑफलाइन व्हा.",
    sheetTitle: "फोन लॉक असतानाही दिसत राहा",
    sheetBodyIos:
      "फोन लॉक असतानाही प्रवाशांना दिसत राहण्यासाठी KunThai ला लोकेशनची “नेहमी” परवानगी द्या. Uber आणि Bolt चालकांप्रमाणे, KunThai बॅकग्राउंडमध्ये असतानाही तुम्हाला बुकिंग मिळत राहतील.",
    sheetBodyAndroid:
      "फोन लॉक असतानाही प्रवाशांना दिसत राहण्यासाठी KunThai ला लोकेशन आणि सूचनांची परवानगी द्या. Uber आणि Bolt चालकांप्रमाणे, KunThai बॅकग्राउंडमध्ये असतानाही तुम्हाला बुकिंग मिळत राहतील.",
    sheetOnlyOnline: "तुम्ही ऑनलाइन (सक्रिय) असतानाच तुमचे लोकेशन शेअर केले जाते.",
    sheetStops: "तुम्ही ऑफलाइन होताच, साइन आउट करताच किंवा खाते बदलताच शेअरिंग थांबते.",
    sheetAndroidNotice: "शेअर करताना Android “KunThai: तुम्ही ऑनलाइन आहात” ही सूचना दाखवते.",
    continue: "पुढे चला",
    notNow: "आत्ता नाही",
    foregroundOnlyHint:
      "लोकेशन “अ‍ॅप वापरताना” वर सेट आहे. फोन लॉक असताना प्रवाशांना तुम्ही कदाचित दिसणार नाही. दिसत राहण्यासाठी “नेहमी” निवडा.",
    deniedHint: "KunThai साठी लोकेशन बंद आहे, त्यामुळे प्रवासी तुम्हाला पाहू शकत नाहीत. ते सेटिंग्जमध्ये सुरू करा.",
    openSettings: "सेटिंग्ज उघडा",
  },
  vi: {
    notificationTitle: "KunThai: bạn đang trực tuyến",
    notificationMessage:
      "Hành khách gần đó có thể thấy bạn. Chuyển sang ngoại tuyến trong KunThai để ngừng chia sẻ vị trí.",
    sheetTitle: "Vẫn hiển thị khi điện thoại khóa",
    sheetBodyIos:
      "Để hành khách vẫn thấy bạn khi điện thoại đang khóa, hãy cho phép vị trí “Luôn luôn” cho KunThai. Giống tài xế Uber và Bolt, bạn vẫn nhận đặt xe khi KunThai chạy nền.",
    sheetBodyAndroid:
      "Để hành khách vẫn thấy bạn khi điện thoại đang khóa, hãy cho phép KunThai dùng vị trí và thông báo. Giống tài xế Uber và Bolt, bạn vẫn nhận đặt xe khi KunThai chạy nền.",
    sheetOnlyOnline: "Vị trí của bạn chỉ được chia sẻ khi bạn đang trực tuyến (Hoạt động).",
    sheetStops: "Việc chia sẻ dừng ngay khi bạn ngoại tuyến, đăng xuất hoặc đổi tài khoản.",
    sheetAndroidNotice: "Trong khi chia sẻ, Android hiển thị thông báo “KunThai: bạn đang trực tuyến”.",
    continue: "Tiếp tục",
    notNow: "Để sau",
    foregroundOnlyHint:
      "Vị trí đang đặt là “Khi dùng ứng dụng”. Hành khách có thể không thấy bạn khi điện thoại khóa. Chọn “Luôn luôn” để vẫn hiển thị.",
    deniedHint: "Vị trí của KunThai đang tắt nên hành khách không thấy bạn. Hãy bật trong Cài đặt.",
    openSettings: "Mở cài đặt",
  },
  de: {
    notificationTitle: "KunThai: Du bist online",
    notificationMessage:
      "Fahrgäste in der Nähe sehen dich. Geh in KunThai offline, um deinen Standort nicht mehr zu teilen.",
    sheetTitle: "Auch bei gesperrtem Handy sichtbar bleiben",
    sheetBodyIos:
      "Damit Fahrgäste dich auch bei gesperrtem Handy sehen, erlaube KunThai den Standortzugriff „Immer“. Wie Uber- und Bolt-Fahrer bekommst du weiter Buchungen, während KunThai im Hintergrund läuft.",
    sheetBodyAndroid:
      "Damit Fahrgäste dich auch bei gesperrtem Handy sehen, erlaube KunThai Standort und Mitteilungen. Wie Uber- und Bolt-Fahrer bekommst du weiter Buchungen, während KunThai im Hintergrund läuft.",
    sheetOnlyOnline: "Dein Standort wird nur geteilt, solange du online (Aktiv) bist.",
    sheetStops: "Das Teilen endet, sobald du offline gehst, dich abmeldest oder das Konto wechselst.",
    sheetAndroidNotice: "Während du teilst, zeigt Android die Mitteilung „KunThai: Du bist online“.",
    continue: "Weiter",
    notNow: "Nicht jetzt",
    foregroundOnlyHint:
      "Standortzugriff ist auf „Beim Verwenden der App“ gestellt. Bei gesperrtem Handy sehen Fahrgäste dich eventuell nicht. Wähle „Immer“, um sichtbar zu bleiben.",
    deniedHint: "Der Standort ist für KunThai aus, daher sehen Fahrgäste dich nicht. Schalte ihn in den Einstellungen ein.",
    openSettings: "Einstellungen öffnen",
  },
};
