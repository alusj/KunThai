// Messages a churn campaign sends (in-app and push). One per suggested action, in
// every language KunThai supports. The admin can edit any language before sending;
// the server picks each person's language from their account country and falls back
// to English. Push shows the first 100 characters of the title and 180 of the message.
// KunThai, Explore, Swip, UrMall and UrRide stay as they are.

export const CAMPAIGN_LOCALES = Object.freeze(["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"]);

export const DEFAULT_ACTION_BY_PRODUCT = Object.freeze({
  explore: "explore_comeback",
  swip: "swip_creator_boost",
  urmall_buyer: "urmall_cart_reminder",
  urmall_seller: "urmall_seller_checkin",
  urride_passenger: "urride_saved_places_reminder",
  urride_operator: "urride_demand_alert",
  business_plan: "plan_renewal_reminder",
  credits: "credits_boost_reminder",
});

export const ACTIONS_BY_PRODUCT = Object.freeze({
  explore: ["explore_comeback"],
  swip: ["swip_creator_boost", "explore_comeback"],
  urmall_buyer: ["urmall_cart_reminder"],
  urmall_seller: ["urmall_seller_checkin", "urmall_unanswered_nudge"],
  urride_passenger: ["urride_saved_places_reminder"],
  urride_operator: ["urride_demand_alert"],
  business_plan: ["plan_renewal_reminder", "plan_grace_reminder"],
  credits: ["credits_boost_reminder"],
});

const T = (title, body, cta) => ({ title, body, cta });

export const CHURN_CAMPAIGN_TEMPLATES = {
  explore_comeback: {
    en: T("We miss you on KunThai", "See what people near you have been sharing on Explore this week.", "Open Explore"),
    fr: T("Vous nous manquez sur KunThai", "Découvrez ce que les gens près de chez vous ont partagé sur Explore cette semaine.", "Ouvrir Explore"),
    es: T("Te echamos de menos en KunThai", "Mira lo que la gente cerca de ti ha compartido en Explore esta semana.", "Abrir Explore"),
    zh: T("KunThai 想你了", "看看本周你附近的人在 Explore 分享了什么。", "打开 Explore"),
    ar: T("اشتقنا إليك على KunThai", "شاهد ما شاركه الأشخاص القريبون منك على Explore هذا الأسبوع.", "افتح Explore"),
    pt: T("Sentimos sua falta no KunThai", "Veja o que as pessoas perto de você compartilharam no Explore esta semana.", "Abrir Explore"),
    hi: T("KunThai पर हमें आपकी याद आई", "देखें इस हफ़्ते आपके आस-पास के लोगों ने Explore पर क्या साझा किया।", "Explore खोलें"),
    bn: T("KunThai-এ আপনাকে মিস করছি", "এই সপ্তাহে আপনার কাছের মানুষেরা Explore-এ কী শেয়ার করেছেন দেখুন।", "Explore খুলুন"),
    id: T("Kami kangen kamu di KunThai", "Lihat apa yang dibagikan orang di sekitarmu di Explore minggu ini.", "Buka Explore"),
    ur: T("KunThai پر آپ کی کمی محسوس ہوئی", "دیکھیں اس ہفتے آپ کے قریب لوگوں نے Explore پر کیا شیئر کیا۔", "Explore کھولیں"),
    ru: T("Мы скучаем по вам в KunThai", "Посмотрите, чем люди рядом с вами делились в Explore на этой неделе.", "Открыть Explore"),
    ja: T("KunThai でお待ちしています", "今週、近くの人が Explore でシェアしたものをチェックしましょう。", "Explore を開く"),
    mr: T("KunThai वर तुमची आठवण येते", "या आठवड्यात तुमच्या जवळच्या लोकांनी Explore वर काय शेअर केले ते पाहा.", "Explore उघडा"),
    vi: T("KunThai nhớ bạn", "Xem mọi người gần bạn đã chia sẻ gì trên Explore tuần này.", "Mở Explore"),
    de: T("Wir vermissen dich bei KunThai", "Sieh dir an, was Leute in deiner Nähe diese Woche auf Explore geteilt haben.", "Explore öffnen"),
  },
  swip_creator_boost: {
    en: T("Your Swip audience is waiting", "Post a new Swip this week and get it seen by more people near you.", "Open Swip"),
    fr: T("Votre public Swip vous attend", "Publiez un nouveau Swip cette semaine pour être vu par plus de monde près de chez vous.", "Ouvrir Swip"),
    es: T("Tu público de Swip te espera", "Publica un nuevo Swip esta semana y llega a más gente cerca de ti.", "Abrir Swip"),
    zh: T("你的 Swip 观众在等你", "本周发布新的 Swip，让附近更多人看到。", "打开 Swip"),
    ar: T("جمهورك على Swip بانتظارك", "انشر Swip جديدًا هذا الأسبوع ليصل إلى مزيد من الأشخاص القريبين منك.", "افتح Swip"),
    pt: T("Seu público no Swip está esperando", "Publique um novo Swip esta semana e alcance mais pessoas perto de você.", "Abrir Swip"),
    hi: T("आपके Swip दर्शक इंतज़ार कर रहे हैं", "इस हफ़्ते नया Swip पोस्ट करें और अपने आस-पास ज़्यादा लोगों तक पहुँचें।", "Swip खोलें"),
    bn: T("আপনার Swip দর্শকেরা অপেক্ষা করছেন", "এই সপ্তাহে নতুন Swip পোস্ট করুন, কাছের আরও মানুষের কাছে পৌঁছান।", "Swip খুলুন"),
    id: T("Penonton Swip-mu menunggu", "Unggah Swip baru minggu ini dan jangkau lebih banyak orang di sekitarmu.", "Buka Swip"),
    ur: T("آپ کے Swip ناظرین منتظر ہیں", "اس ہفتے نیا Swip پوسٹ کریں اور قریب کے مزید لوگوں تک پہنچیں۔", "Swip کھولیں"),
    ru: T("Ваши зрители в Swip ждут", "Опубликуйте новый Swip на этой неделе, чтобы его увидело больше людей рядом.", "Открыть Swip"),
    ja: T("Swip の視聴者が待っています", "今週新しい Swip を投稿して、近くのもっと多くの人に届けましょう。", "Swip を開く"),
    mr: T("तुमचे Swip प्रेक्षक वाट पाहत आहेत", "या आठवड्यात नवीन Swip पोस्ट करा आणि जवळच्या अधिक लोकांपर्यंत पोहोचा.", "Swip उघडा"),
    vi: T("Khán giả Swip đang chờ bạn", "Đăng Swip mới tuần này để nhiều người gần bạn xem hơn.", "Mở Swip"),
    de: T("Dein Swip-Publikum wartet", "Poste diese Woche ein neues Swip und erreiche mehr Leute in deiner Nähe.", "Swip öffnen"),
  },
  urmall_cart_reminder: {
    en: T("Your UrMall picks are still here", "The items you saved and left in your cart are waiting. Check them before they sell out.", "Open UrMall"),
    fr: T("Vos choix UrMall sont toujours là", "Les articles enregistrés et dans votre panier vous attendent. Regardez-les avant la rupture.", "Ouvrir UrMall"),
    es: T("Tus elecciones en UrMall siguen aquí", "Lo que guardaste y dejaste en el carrito te espera. Míralo antes de que se agote.", "Abrir UrMall"),
    zh: T("你在 UrMall 选的商品还在", "你收藏和放进购物车的商品还在等你，售罄前快去看看。", "打开 UrMall"),
    ar: T("اختياراتك في UrMall ما زالت هنا", "العناصر التي حفظتها وتركتها في السلة بانتظارك. تفقدها قبل نفادها.", "افتح UrMall"),
    pt: T("Suas escolhas no UrMall ainda estão aqui", "Os itens salvos e no seu carrinho estão esperando. Confira antes que acabem.", "Abrir UrMall"),
    hi: T("आपकी UrMall पसंद अभी भी यहाँ है", "आपकी सहेजी और कार्ट में छोड़ी चीज़ें इंतज़ार कर रही हैं। ख़त्म होने से पहले देख लें।", "UrMall खोलें"),
    bn: T("আপনার UrMall পছন্দগুলো এখনও আছে", "সংরক্ষিত আর কার্টে রাখা জিনিসগুলো অপেক্ষা করছে। শেষ হওয়ার আগে দেখে নিন।", "UrMall খুলুন"),
    id: T("Pilihan UrMall-mu masih ada", "Barang yang kamu simpan dan tinggalkan di keranjang masih menunggu. Cek sebelum habis.", "Buka UrMall"),
    ur: T("آپ کی UrMall پسند ابھی موجود ہے", "آپ کی محفوظ اور کارٹ میں چھوڑی اشیا منتظر ہیں۔ ختم ہونے سے پہلے دیکھ لیں۔", "UrMall کھولیں"),
    ru: T("Ваши находки в UrMall ещё ждут", "Сохранённые товары и корзина ждут вас. Загляните, пока они не закончились.", "Открыть UrMall"),
    ja: T("UrMall のお気に入りはまだあります", "保存した商品やカートの商品が待っています。売り切れる前にチェックを。", "UrMall を開く"),
    mr: T("तुमच्या UrMall निवडी अजून आहेत", "जतन केलेल्या आणि कार्टमधील वस्तू वाट पाहत आहेत. संपण्याआधी पाहा.", "UrMall उघडा"),
    vi: T("Món bạn chọn trên UrMall vẫn còn", "Món đã lưu và trong giỏ hàng vẫn đang chờ. Xem ngay trước khi hết hàng.", "Mở UrMall"),
    de: T("Deine UrMall-Favoriten warten noch", "Gemerkte Artikel und dein Warenkorb warten. Schau rein, bevor sie ausverkauft sind.", "UrMall öffnen"),
  },
  urmall_seller_checkin: {
    en: T("Buyers are looking on UrMall", "Update your products and prices to show up for buyers near you this week.", "Open my business"),
    fr: T("Des acheteurs cherchent sur UrMall", "Mettez à jour vos produits et prix pour apparaître auprès des acheteurs proches cette semaine.", "Ouvrir ma boutique"),
    es: T("Hay compradores buscando en UrMall", "Actualiza tus productos y precios para aparecer ante compradores cercanos esta semana.", "Abrir mi negocio"),
    zh: T("买家正在 UrMall 上寻找", "更新你的商品和价格，本周让附近的买家看到你。", "打开我的店铺"),
    ar: T("المشترون يبحثون على UrMall", "حدّث منتجاتك وأسعارك لتظهر للمشترين القريبين هذا الأسبوع.", "افتح نشاطي التجاري"),
    pt: T("Compradores estão procurando no UrMall", "Atualize seus produtos e preços para aparecer para compradores próximos esta semana.", "Abrir meu negócio"),
    hi: T("UrMall पर खरीदार खोज रहे हैं", "इस हफ़्ते पास के खरीदारों को दिखने के लिए अपने उत्पाद और दाम अपडेट करें।", "मेरा बिज़नेस खोलें"),
    bn: T("UrMall-এ ক্রেতারা খুঁজছেন", "এই সপ্তাহে কাছের ক্রেতাদের কাছে দেখাতে পণ্য ও দাম আপডেট করুন।", "আমার ব্যবসা খুলুন"),
    id: T("Pembeli sedang mencari di UrMall", "Perbarui produk dan harga agar muncul untuk pembeli di sekitarmu minggu ini.", "Buka bisnis saya"),
    ur: T("UrMall پر خریدار تلاش کر رہے ہیں", "اس ہفتے قریبی خریداروں کو نظر آنے کے لیے اپنی مصنوعات اور قیمتیں اپڈیٹ کریں۔", "میرا کاروبار کھولیں"),
    ru: T("Покупатели ищут в UrMall", "Обновите товары и цены, чтобы покупатели рядом увидели вас на этой неделе.", "Открыть мой бизнес"),
    ja: T("UrMall で購入者が探しています", "商品と価格を更新して、今週近くの購入者に見つけてもらいましょう。", "マイビジネスを開く"),
    mr: T("UrMall वर खरेदीदार शोधत आहेत", "या आठवड्यात जवळच्या खरेदीदारांना दिसण्यासाठी उत्पादने आणि किमती अपडेट करा.", "माझा व्यवसाय उघडा"),
    vi: T("Người mua đang tìm trên UrMall", "Cập nhật sản phẩm và giá để người mua gần bạn thấy bạn trong tuần này.", "Mở cửa hàng"),
    de: T("Käufer suchen auf UrMall", "Aktualisiere Produkte und Preise, damit Käufer in deiner Nähe dich diese Woche finden.", "Mein Geschäft öffnen"),
  },
  urmall_unanswered_nudge: {
    en: T("Customers are waiting for your reply", "Some UrMall customers asked you something. A quick reply can turn into a sale.", "Reply now"),
    fr: T("Des clients attendent votre réponse", "Des clients UrMall vous ont posé une question. Une réponse rapide peut devenir une vente.", "Répondre"),
    es: T("Hay clientes esperando tu respuesta", "Algunos clientes de UrMall te preguntaron algo. Una respuesta rápida puede ser una venta.", "Responder"),
    zh: T("客户在等你回复", "有 UrMall 客户向你提问了，快速回复可能带来一笔订单。", "立即回复"),
    ar: T("عملاء بانتظار ردك", "سألك بعض عملاء UrMall. الرد السريع قد يتحول إلى عملية بيع.", "رد الآن"),
    pt: T("Clientes esperam sua resposta", "Alguns clientes do UrMall perguntaram algo. Uma resposta rápida pode virar venda.", "Responder"),
    hi: T("ग्राहक आपके जवाब का इंतज़ार कर रहे हैं", "कुछ UrMall ग्राहकों ने आपसे कुछ पूछा है। जल्दी जवाब बिक्री बन सकता है।", "अभी जवाब दें"),
    bn: T("গ্রাহকেরা আপনার উত্তরের অপেক্ষায়", "কয়েকজন UrMall গ্রাহক কিছু জানতে চেয়েছেন। দ্রুত উত্তর বিক্রিতে বদলাতে পারে।", "এখনই উত্তর দিন"),
    id: T("Pelanggan menunggu balasanmu", "Beberapa pelanggan UrMall bertanya. Balasan cepat bisa jadi penjualan.", "Balas sekarang"),
    ur: T("صارفین آپ کے جواب کے منتظر ہیں", "کچھ UrMall صارفین نے آپ سے کچھ پوچھا ہے۔ جلد جواب فروخت بن سکتا ہے۔", "ابھی جواب دیں"),
    ru: T("Клиенты ждут вашего ответа", "Покупатели UrMall задали вам вопросы. Быстрый ответ может стать продажей.", "Ответить"),
    ja: T("お客様が返信を待っています", "UrMall のお客様から質問が届いています。早めの返信が売上につながります。", "今すぐ返信"),
    mr: T("ग्राहक तुमच्या उत्तराची वाट पाहत आहेत", "काही UrMall ग्राहकांनी तुम्हाला विचारले आहे. लवकर उत्तर विक्रीत बदलू शकते.", "आता उत्तर द्या"),
    vi: T("Khách đang chờ bạn trả lời", "Một số khách UrMall đã hỏi bạn. Trả lời nhanh có thể thành đơn hàng.", "Trả lời ngay"),
    de: T("Kunden warten auf deine Antwort", "Einige UrMall-Kunden haben dir geschrieben. Eine schnelle Antwort kann ein Verkauf werden.", "Jetzt antworten"),
  },
  urride_saved_places_reminder: {
    en: T("Your next ride is a tap away", "Book from your saved places with top-rated UrRide operators near you.", "Open UrRide"),
    fr: T("Votre prochain trajet en un geste", "Réservez depuis vos lieux enregistrés avec les opérateurs UrRide les mieux notés près de vous.", "Ouvrir UrRide"),
    es: T("Tu próximo viaje a un toque", "Reserva desde tus lugares guardados con los operadores de UrRide mejor valorados cerca.", "Abrir UrRide"),
    zh: T("下一次出行一键即达", "从已保存的地点，预订你附近评分最高的 UrRide 运营者。", "打开 UrRide"),
    ar: T("رحلتك التالية بلمسة واحدة", "احجز من أماكنك المحفوظة مع أعلى مشغّلي UrRide تقييمًا بالقرب منك.", "افتح UrRide"),
    pt: T("Sua próxima viagem a um toque", "Reserve a partir dos seus locais salvos com operadores UrRide bem avaliados perto de você.", "Abrir UrRide"),
    hi: T("आपकी अगली राइड बस एक टैप दूर", "अपनी सहेजी जगहों से पास के सबसे अच्छे रेटिंग वाले UrRide ऑपरेटर बुक करें।", "UrRide खोलें"),
    bn: T("পরের রাইড মাত্র এক ট্যাপে", "সংরক্ষিত জায়গা থেকে কাছের সেরা রেটিংয়ের UrRide অপারেটর বুক করুন।", "UrRide খুলুন"),
    id: T("Perjalanan berikutnya cukup sekali ketuk", "Pesan dari tempat tersimpan dengan operator UrRide terbaik di sekitarmu.", "Buka UrRide"),
    ur: T("آپ کی اگلی سواری بس ایک ٹیپ دور", "اپنے محفوظ مقامات سے قریبی بہترین ریٹنگ والے UrRide آپریٹرز بُک کریں۔", "UrRide کھولیں"),
    ru: T("Следующая поездка — в одно касание", "Закажите поездку из сохранённых мест у лучших операторов UrRide рядом.", "Открыть UrRide"),
    ja: T("次の移動はワンタップで", "保存した場所から、近くの高評価な UrRide オペレーターを予約しましょう。", "UrRide を開く"),
    mr: T("तुमची पुढची राइड एका टॅपवर", "जतन केलेल्या ठिकाणांवरून जवळचे सर्वोत्तम रेटिंगचे UrRide ऑपरेटर बुक करा.", "UrRide उघडा"),
    vi: T("Chuyến đi tiếp theo chỉ một chạm", "Đặt từ địa điểm đã lưu với nhà vận hành UrRide được đánh giá cao gần bạn.", "Mở UrRide"),
    de: T("Deine nächste Fahrt mit einem Tipp", "Buche von deinen gespeicherten Orten bei top bewerteten UrRide-Betreibern in der Nähe.", "UrRide öffnen"),
  },
  urride_demand_alert: {
    en: T("Passengers are booking near you", "Go online on UrRide to get trip requests in your area today.", "Go online"),
    fr: T("Des passagers réservent près de vous", "Passez en ligne sur UrRide pour recevoir des demandes de trajet dans votre zone aujourd'hui.", "Passer en ligne"),
    es: T("Hay pasajeros reservando cerca de ti", "Conéctate en UrRide para recibir solicitudes de viaje en tu zona hoy.", "Conectarme"),
    zh: T("你附近有乘客在预订", "今天在 UrRide 上线，接收你所在区域的行程请求。", "上线接单"),
    ar: T("ركاب يحجزون بالقرب منك", "اتصل على UrRide لتصلك طلبات الرحلات في منطقتك اليوم.", "اتصل الآن"),
    pt: T("Passageiros estão reservando perto de você", "Fique online no UrRide para receber pedidos de viagem na sua região hoje.", "Ficar online"),
    hi: T("आपके पास यात्री बुकिंग कर रहे हैं", "आज अपने इलाके के ट्रिप अनुरोध पाने के लिए UrRide पर ऑनलाइन हों।", "ऑनलाइन हों"),
    bn: T("আপনার কাছে যাত্রীরা বুক করছেন", "আজ আপনার এলাকার ট্রিপ অনুরোধ পেতে UrRide-এ অনলাইন হোন।", "অনলাইন হোন"),
    id: T("Penumpang memesan di dekatmu", "Aktifkan UrRide untuk menerima permintaan perjalanan di areamu hari ini.", "Mulai online"),
    ur: T("آپ کے قریب مسافر بکنگ کر رہے ہیں", "آج اپنے علاقے کی سفری درخواستیں پانے کے لیے UrRide پر آن لائن ہوں۔", "آن لائن ہوں"),
    ru: T("Рядом с вами заказывают поездки", "Выйдите на линию в UrRide, чтобы сегодня получать заказы в вашем районе.", "Выйти на линию"),
    ja: T("近くで乗客が予約しています", "UrRide でオンラインにして、今日あなたのエリアの配車依頼を受け取りましょう。", "オンラインにする"),
    mr: T("तुमच्या जवळ प्रवासी बुकिंग करत आहेत", "आज तुमच्या भागातील ट्रिप विनंत्या मिळवण्यासाठी UrRide वर ऑनलाइन व्हा.", "ऑनलाइन व्हा"),
    vi: T("Hành khách đang đặt xe gần bạn", "Bật trực tuyến trên UrRide để nhận yêu cầu chuyến đi trong khu vực hôm nay.", "Bật trực tuyến"),
    de: T("In deiner Nähe wird gebucht", "Geh bei UrRide online, um heute Fahrtanfragen in deiner Gegend zu bekommen.", "Online gehen"),
  },
  plan_renewal_reminder: {
    en: T("Your KunThai plan ends soon", "Renew now to keep your features and your locked price without a break.", "Renew plan"),
    fr: T("Votre forfait KunThai se termine bientôt", "Renouvelez maintenant pour garder vos fonctions et votre prix bloqué sans interruption.", "Renouveler"),
    es: T("Tu plan de KunThai termina pronto", "Renueva ahora para mantener tus funciones y tu precio fijado sin cortes.", "Renovar plan"),
    zh: T("你的 KunThai 套餐即将到期", "立即续订，功能和锁定价格不间断。", "续订套餐"),
    ar: T("تنتهي خطتك في KunThai قريبًا", "جدّد الآن للحفاظ على ميزاتك وسعرك المثبّت دون انقطاع.", "جدّد الخطة"),
    pt: T("Seu plano KunThai termina em breve", "Renove agora para manter seus recursos e seu preço travado sem interrupção.", "Renovar plano"),
    hi: T("आपका KunThai प्लान जल्द ख़त्म होगा", "बिना रुकावट सुविधाएँ और तय कीमत बनाए रखने के लिए अभी रिन्यू करें।", "प्लान रिन्यू करें"),
    bn: T("আপনার KunThai প্ল্যান শীঘ্রই শেষ হবে", "বিরতি ছাড়া সুবিধা ও স্থির দাম রাখতে এখনই নবায়ন করুন।", "প্ল্যান নবায়ন করুন"),
    id: T("Paket KunThai-mu segera berakhir", "Perpanjang sekarang agar fitur dan harga terkuncimu tetap berjalan.", "Perpanjang paket"),
    ur: T("آپ کا KunThai پلان جلد ختم ہو رہا ہے", "بغیر وقفے کے فیچرز اور مقررہ قیمت برقرار رکھنے کے لیے ابھی تجدید کریں۔", "پلان کی تجدید کریں"),
    ru: T("Ваш тариф KunThai скоро закончится", "Продлите сейчас, чтобы сохранить функции и зафиксированную цену без перерыва.", "Продлить тариф"),
    ja: T("KunThai プランがまもなく終了します", "今すぐ更新して、機能と固定価格を途切れずに維持しましょう。", "プランを更新"),
    mr: T("तुमचा KunThai प्लॅन लवकरच संपेल", "खंड न पडता सुविधा आणि निश्चित किंमत ठेवण्यासाठी आता नूतनीकरण करा.", "प्लॅन नूतनीकरण करा"),
    vi: T("Gói KunThai của bạn sắp hết hạn", "Gia hạn ngay để giữ tính năng và mức giá đã khóa không gián đoạn.", "Gia hạn gói"),
    de: T("Dein KunThai-Tarif endet bald", "Verlängere jetzt, damit deine Funktionen und dein fester Preis ohne Pause bleiben.", "Tarif verlängern"),
  },
  plan_grace_reminder: {
    en: T("Your KunThai plan needs attention", "Your plan is in its grace period. Renew to avoid losing your business features.", "Renew now"),
    fr: T("Votre forfait KunThai demande votre attention", "Votre forfait est en période de grâce. Renouvelez pour garder vos fonctions business.", "Renouveler"),
    es: T("Tu plan de KunThai necesita atención", "Tu plan está en periodo de gracia. Renueva para no perder tus funciones de negocio.", "Renovar ahora"),
    zh: T("你的 KunThai 套餐需要处理", "你的套餐处于宽限期，续订以免失去商业功能。", "立即续订"),
    ar: T("خطتك في KunThai تحتاج انتباهك", "خطتك في فترة السماح. جدّد كي لا تفقد ميزات نشاطك التجاري.", "جدّد الآن"),
    pt: T("Seu plano KunThai precisa de atenção", "Seu plano está no período de carência. Renove para não perder os recursos do negócio.", "Renovar agora"),
    hi: T("आपके KunThai प्लान पर ध्यान दें", "आपका प्लान ग्रेस अवधि में है। बिज़नेस सुविधाएँ न खोने के लिए रिन्यू करें।", "अभी रिन्यू करें"),
    bn: T("আপনার KunThai প্ল্যানে মনোযোগ দিন", "আপনার প্ল্যান গ্রেস পিরিয়ডে আছে। ব্যবসার সুবিধা হারাতে না চাইলে নবায়ন করুন।", "এখনই নবায়ন করুন"),
    id: T("Paket KunThai-mu perlu perhatian", "Paketmu dalam masa tenggang. Perpanjang agar fitur bisnis tidak hilang.", "Perpanjang sekarang"),
    ur: T("آپ کے KunThai پلان پر توجہ درکار ہے", "آپ کا پلان رعایتی مدت میں ہے۔ کاروباری فیچرز نہ کھونے کے لیے تجدید کریں۔", "ابھی تجدید کریں"),
    ru: T("Тариф KunThai требует внимания", "Тариф в льготном периоде. Продлите, чтобы не потерять бизнес-функции.", "Продлить"),
    ja: T("KunThai プランをご確認ください", "プランは猶予期間中です。ビジネス機能を失わないよう更新してください。", "今すぐ更新"),
    mr: T("तुमच्या KunThai प्लॅनकडे लक्ष द्या", "तुमचा प्लॅन सवलत कालावधीत आहे. व्यवसाय सुविधा गमावू नयेत म्हणून नूतनीकरण करा.", "आता नूतनीकरण करा"),
    vi: T("Gói KunThai của bạn cần chú ý", "Gói đang trong thời gian gia hạn. Gia hạn để không mất tính năng doanh nghiệp.", "Gia hạn ngay"),
    de: T("Dein KunThai-Tarif braucht Aufmerksamkeit", "Dein Tarif ist in der Kulanzfrist. Verlängere, damit deine Business-Funktionen bleiben.", "Jetzt verlängern"),
  },
  credits_boost_reminder: {
    en: T("You have unused Visibility Credits", "Use them to boost a post or a listing and reach more people this week.", "Use credits"),
    fr: T("Vous avez des crédits de visibilité inutilisés", "Utilisez-les pour booster une publication ou une annonce et toucher plus de monde cette semaine.", "Utiliser"),
    es: T("Tienes créditos de visibilidad sin usar", "Úsalos para impulsar una publicación o un anuncio y llegar a más gente esta semana.", "Usar créditos"),
    zh: T("你有未使用的曝光积分", "用它们推广帖子或商品，本周触达更多人。", "使用积分"),
    ar: T("لديك أرصدة ظهور غير مستخدمة", "استخدمها لترويج منشور أو إعلان والوصول إلى مزيد من الأشخاص هذا الأسبوع.", "استخدم الأرصدة"),
    pt: T("Você tem créditos de visibilidade sem usar", "Use-os para impulsionar uma publicação ou anúncio e alcançar mais pessoas esta semana.", "Usar créditos"),
    hi: T("आपके पास बिना इस्तेमाल विज़िबिलिटी क्रेडिट हैं", "इस हफ़्ते किसी पोस्ट या लिस्टिंग को बूस्ट करके ज़्यादा लोगों तक पहुँचें।", "क्रेडिट इस्तेमाल करें"),
    bn: T("আপনার অব্যবহৃত ভিজিবিলিটি ক্রেডিট আছে", "এই সপ্তাহে কোনো পোস্ট বা লিস্টিং বুস্ট করে আরও মানুষের কাছে পৌঁছান।", "ক্রেডিট ব্যবহার করুন"),
    id: T("Kamu punya kredit visibilitas yang belum dipakai", "Pakai untuk mempromosikan postingan atau listing dan jangkau lebih banyak orang minggu ini.", "Pakai kredit"),
    ur: T("آپ کے پاس غیر استعمال شدہ ویزیبلٹی کریڈٹس ہیں", "اس ہفتے کسی پوسٹ یا لسٹنگ کو بوسٹ کر کے زیادہ لوگوں تک پہنچیں۔", "کریڈٹس استعمال کریں"),
    ru: T("У вас есть неиспользованные кредиты видимости", "Продвиньте пост или объявление и охватите больше людей на этой неделе.", "Использовать"),
    ja: T("未使用の表示クレジットがあります", "投稿や出品をブーストして、今週もっと多くの人に届けましょう。", "クレジットを使う"),
    mr: T("तुमच्याकडे न वापरलेले व्हिजिबिलिटी क्रेडिट आहेत", "या आठवड्यात पोस्ट किंवा लिस्टिंग बूस्ट करून अधिक लोकांपर्यंत पोहोचा.", "क्रेडिट वापरा"),
    vi: T("Bạn còn tín dụng hiển thị chưa dùng", "Dùng để đẩy bài viết hoặc tin đăng và tiếp cận nhiều người hơn tuần này.", "Dùng tín dụng"),
    de: T("Du hast ungenutzte Sichtbarkeits-Credits", "Nutze sie, um einen Beitrag oder ein Angebot zu pushen und diese Woche mehr Leute zu erreichen.", "Credits nutzen"),
  },
};

// The messages to send for one action: every language from the template, with the
// admin's edits on top. Blank edits fall back to the template.
export function buildCampaignMessages(action, edits = {}) {
  const template = CHURN_CAMPAIGN_TEMPLATES[action] || CHURN_CAMPAIGN_TEMPLATES.explore_comeback;
  const messages = {};
  for (const locale of CAMPAIGN_LOCALES) {
    const base = template[locale] || template.en;
    const edit = edits?.[locale] || {};
    messages[locale] = {
      title: (edit.title ?? "").trim() || base.title,
      body: (edit.body ?? "").trim() || base.body,
      cta: (edit.cta ?? "").trim() || base.cta,
    };
  }
  return messages;
}

export const MESSAGE_LIMITS = Object.freeze({ title: 100, body: 300, cta: 40, pushBody: 180 });

export function messageProblems(messages) {
  const problems = [];
  for (const [locale, message] of Object.entries(messages || {})) {
    if (!message?.title?.trim() || !message?.body?.trim()) problems.push({ locale, field: "required" });
    if ((message?.title || "").length > MESSAGE_LIMITS.title) problems.push({ locale, field: "title" });
    if ((message?.body || "").length > MESSAGE_LIMITS.body) problems.push({ locale, field: "body" });
    if ((message?.cta || "").length > MESSAGE_LIMITS.cta) problems.push({ locale, field: "cta" });
  }
  return problems;
}
