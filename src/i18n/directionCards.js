// Direction cards: one-time pointers that attach to a real button the first
// time a signed-in user can see it. Keys match the button's data-direction id.
export const DIRECTION_CARDS = {
  en: {
    ui: { gotIt: "Got it", hideAll: "Hide all tips", close: "Close tip", tip: "Tip" },
    cards: {
      "explore-create": ["Share your first post", "Tap + to post text, photos, voice notes or videos to Explore."],
      "urmall-register": ["Register your business for free", "Open your UrMall shop, list what you sell and reach buyers near you."],
      "urride-register": ["Register your ride for free", "Add your vehicle or transport company and start getting bookings."],
      "urmall-seller-add": ["Add your first listing", "Products, menu items or properties you add here appear to buyers."],
      "urmall-seller-orders": ["New orders arrive here", "Check each order and update its status so buyers stay informed."],
      "urmall-seller-messages": ["Reply to buyers", "Buyer questions land here. Quick replies win more sales."],
      "urride-availability": ["Go active to get bookings", "Passengers can only find and book you while you are active."],
      "area-sos": ["Emergency help in one tap", "Tap SOS for police, ambulance and fire numbers, and help nearby."],
      "area-lock": ["Lock the map while you move", "Stops accidental taps and exits. The screen stays on until you unlock."],
      "area-focus": ["Focus on the map", "Hides the buttons so you see more map. The screen stays on."],
      "kai-assistant": ["Meet KAI, your assistant", "Ask KAI to find products, rides or help with a form. Drag it anywhere."],
    },
  },
  fr: {
    ui: { gotIt: "Compris", hideAll: "Masquer les astuces", close: "Fermer l’astuce", tip: "Astuce" },
    cards: {
      "explore-create": ["Partagez votre première publication", "Touchez + pour publier du texte, des photos, des notes vocales ou des vidéos."],
      "urmall-register": ["Enregistrez votre entreprise gratuitement", "Ouvrez votre boutique UrMall, publiez vos articles et touchez les acheteurs proches."],
      "urride-register": ["Enregistrez votre véhicule gratuitement", "Ajoutez votre véhicule ou votre société de transport et recevez des réservations."],
      "urmall-seller-add": ["Ajoutez votre première annonce", "Les produits, plats ou biens ajoutés ici sont visibles par les acheteurs."],
      "urmall-seller-orders": ["Les nouvelles commandes arrivent ici", "Vérifiez chaque commande et mettez à jour son statut pour informer l’acheteur."],
      "urmall-seller-messages": ["Répondez aux acheteurs", "Les questions des acheteurs arrivent ici. Une réponse rapide aide à vendre."],
      "urride-availability": ["Passez actif pour être réservé", "Les passagers ne peuvent vous trouver et réserver que lorsque vous êtes actif."],
      "area-sos": ["L’aide d’urgence en un geste", "Touchez SOS pour les numéros police, ambulance, pompiers et l’aide proche."],
      "area-lock": ["Verrouillez la carte en route", "Évite les touches et sorties accidentelles. L’écran reste allumé jusqu’au déverrouillage."],
      "area-focus": ["Concentrez-vous sur la carte", "Masque les boutons pour voir plus de carte. L’écran reste allumé."],
      "kai-assistant": ["Voici KAI, votre assistant", "Demandez à KAI des produits, des trajets ou de l’aide pour un formulaire. Déplacez-le où vous voulez."],
    },
  },
  es: {
    ui: { gotIt: "Entendido", hideAll: "Ocultar consejos", close: "Cerrar consejo", tip: "Consejo" },
    cards: {
      "explore-create": ["Comparte tu primera publicación", "Toca + para publicar texto, fotos, notas de voz o videos en Explore."],
      "urmall-register": ["Registra tu negocio gratis", "Abre tu tienda en UrMall, publica lo que vendes y llega a compradores cercanos."],
      "urride-register": ["Registra tu vehículo gratis", "Añade tu vehículo o empresa de transporte y empieza a recibir reservas."],
      "urmall-seller-add": ["Añade tu primer anuncio", "Los productos, platos o inmuebles que añadas aquí los verán los compradores."],
      "urmall-seller-orders": ["Aquí llegan los pedidos", "Revisa cada pedido y actualiza su estado para mantener informado al comprador."],
      "urmall-seller-messages": ["Responde a los compradores", "Aquí llegan sus preguntas. Responder rápido ayuda a vender más."],
      "urride-availability": ["Actívate para recibir reservas", "Los pasajeros solo pueden encontrarte y reservarte mientras estás activo."],
      "area-sos": ["Ayuda de emergencia en un toque", "Toca SOS para ver números de policía, ambulancia, bomberos y ayuda cercana."],
      "area-lock": ["Bloquea el mapa mientras avanzas", "Evita toques y salidas accidentales. La pantalla sigue encendida hasta desbloquear."],
      "area-focus": ["Céntrate en el mapa", "Oculta los botones para ver más mapa. La pantalla sigue encendida."],
      "kai-assistant": ["Conoce a KAI, tu asistente", "Pide a KAI productos, viajes o ayuda con un formulario. Arrástralo donde quieras."],
    },
  },
  ar: {
    ui: { gotIt: "فهمت", hideAll: "إخفاء كل النصائح", close: "إغلاق النصيحة", tip: "نصيحة" },
    cards: {
      "explore-create": ["شارك منشورك الأول", "اضغط + لنشر نص أو صور أو رسائل صوتية أو فيديو في Explore."],
      "urmall-register": ["سجّل نشاطك التجاري مجانًا", "افتح متجرك في UrMall واعرض ما تبيعه وتواصل مع المشترين القريبين."],
      "urride-register": ["سجّل مركبتك مجانًا", "أضف مركبتك أو شركة النقل الخاصة بك وابدأ في تلقي الحجوزات."],
      "urmall-seller-add": ["أضف أول إعلان لك", "المنتجات أو الوجبات أو العقارات التي تضيفها هنا تظهر للمشترين."],
      "urmall-seller-orders": ["الطلبات الجديدة تصل هنا", "راجع كل طلب وحدّث حالته ليبقى المشتري على اطلاع."],
      "urmall-seller-messages": ["رُد على المشترين", "أسئلة المشترين تصل هنا. الرد السريع يزيد مبيعاتك."],
      "urride-availability": ["فعّل حالتك لتتلقى الحجوزات", "لا يمكن للركاب العثور عليك أو حجزك إلا عندما تكون نشطًا."],
      "area-sos": ["مساعدة الطوارئ بلمسة واحدة", "اضغط SOS لأرقام الشرطة والإسعاف والإطفاء والمساعدة القريبة."],
      "area-lock": ["اقفل الخريطة أثناء تنقلك", "يمنع اللمسات والخروج غير المقصود. تبقى الشاشة مضاءة حتى تفتح القفل."],
      "area-focus": ["ركّز على الخريطة", "يخفي الأزرار لترى مساحة أكبر من الخريطة. تبقى الشاشة مضاءة."],
      "kai-assistant": ["تعرّف على KAI، مساعدك", "اطلب من KAI منتجات أو رحلات أو مساعدة في نموذج. اسحبه إلى أي مكان."],
    },
  },
  zh: {
    ui: { gotIt: "知道了", hideAll: "隐藏所有提示", close: "关闭提示", tip: "提示" },
    cards: {
      "explore-create": ["发布你的第一条动态", "点击 + 在 Explore 发布文字、照片、语音或视频。"],
      "urmall-register": ["免费注册你的企业", "开设你的 UrMall 店铺，上架商品，触达附近的买家。"],
      "urride-register": ["免费注册你的车辆", "添加你的车辆或运输公司，开始接收预订。"],
      "urmall-seller-add": ["添加你的第一个商品", "你在这里添加的商品、菜品或房源会展示给买家。"],
      "urmall-seller-orders": ["新订单会出现在这里", "查看每个订单并更新状态，让买家随时了解进度。"],
      "urmall-seller-messages": ["回复买家", "买家的提问会出现在这里。及时回复能促成更多交易。"],
      "urride-availability": ["切换为在线以接收预订", "只有在线时，乘客才能找到并预订你。"],
      "area-sos": ["一键紧急求助", "点击 SOS 查看报警、急救、消防电话及附近帮助。"],
      "area-lock": ["移动时锁定地图", "防止误触和误退出。解锁前屏幕保持常亮。"],
      "area-focus": ["专注查看地图", "隐藏按钮以显示更多地图，屏幕保持常亮。"],
      "kai-assistant": ["认识你的助手 KAI", "让 KAI 帮你找商品、找车或填写表单。可拖动到任意位置。"],
    },
  },

  pt: {
    "ui": {
      "gotIt": "Entendi",
      "hideAll": "Ocultar todas as dicas",
      "close": "Fechar dica",
      "tip": "Dica"
    },
    "cards": {
      "explore-create": [
        "Compartilhe sua primeira postagem",
        "Toque em + para postar texto, fotos, notas de voz ou vídeos em Explore."
      ],
      "urmall-register": [
        "Cadastre sua empresa gratuitamente",
        "Abra sua loja UrMall, liste o que você vende e alcance compradores perto de você."
      ],
      "urride-register": [
        "Cadastre sua viagem gratuitamente",
        "Adicione o seu veículo ou empresa de transporte e comece a receber reservas."
      ],
      "urmall-seller-add": [
        "Adicione sua primeira listagem",
        "Os produtos, itens de menu ou propriedades que você adiciona aqui aparecem para os compradores."
      ],
      "urmall-seller-orders": [
        "Novos pedidos chegam aqui",
        "Verifique cada pedido e atualize seu status para que os compradores fiquem informados."
      ],
      "urmall-seller-messages": [
        "Responder aos compradores",
        "As perguntas do comprador chegam aqui. Respostas rápidas geram mais vendas."
      ],
      "urride-availability": [
        "Torne-se ativo para obter reservas",
        "Os passageiros só poderão encontrar e reservar você enquanto você estiver ativo."
      ],
      "area-sos": [
        "Ajuda de emergência com um toque",
        "Toque em SOS para obter números de polícia, ambulância e bombeiros e ajuda nas proximidades."
      ],
      "area-lock": [
        "Bloqueie o mapa enquanto você se move",
        "Interrompe toques e saídas acidentais. A tela permanece ligada até você desbloquear."
      ],
      "area-focus": [
        "Concentre-se no mapa",
        "Oculta os botões para que você veja mais mapas. A tela permanece ligada."
      ],
      "kai-assistant": [
        "Conheça KAI, seu assistente",
        "Peça a KAI para encontrar produtos, passeios ou ajuda com um formulário. Arraste-o para qualquer lugar."
      ]
    }
  },

  hi: {
    "ui": {
      "gotIt": "समझ गया",
      "hideAll": "सभी युक्तियाँ छिपाएँ",
      "close": "टिप बंद करें",
      "tip": "युक्ति"
    },
    "cards": {
      "explore-create": [
        "अपनी पहली पोस्ट साझा करें",
        "Explore पर टेक्स्ट, फ़ोटो, वॉयस नोट्स या वीडियो पोस्ट करने के लिए + टैप करें।"
      ],
      "urmall-register": [
        "अपना व्यवसाय निःशुल्क पंजीकृत करें",
        "अपनी UrMall दुकान खोलें, आप जो बेचते हैं उसे सूचीबद्ध करें और अपने आस-पास के खरीदारों तक पहुंचें।"
      ],
      "urride-register": [
        "अपनी सवारी निःशुल्क पंजीकृत करें",
        "अपना वाहन या परिवहन कंपनी जोड़ें और बुकिंग प्राप्त करना शुरू करें।"
      ],
      "urmall-seller-add": [
        "अपनी पहली सूची जोड़ें",
        "आपके द्वारा यहां जोड़े गए उत्पाद, मेनू आइटम या गुण खरीदारों को दिखाई देते हैं।"
      ],
      "urmall-seller-orders": [
        "नए ऑर्डर यहां आते हैं",
        "प्रत्येक ऑर्डर की जांच करें और उसकी स्थिति अपडेट करें ताकि खरीदार सूचित रहें।"
      ],
      "urmall-seller-messages": [
        "खरीदारों को उत्तर दें",
        "खरीदार यहां जमीन पर सवाल उठाता है। त्वरित उत्तरों से अधिक बिक्री होती है।"
      ],
      "urride-availability": [
        "बुकिंग प्राप्त करने के लिए सक्रिय रहें",
        "यात्री आपको केवल तभी ढूंढ और बुक कर सकते हैं जब आप सक्रिय हों।"
      ],
      "area-sos": [
        "एक टैप में आपातकालीन सहायता",
        "पुलिस, एम्बुलेंस और अग्निशमन नंबरों और आस-पास की सहायता के लिए SOS पर टैप करें।"
      ],
      "area-lock": [
        "चलते समय मानचित्र को लॉक करें",
        "आकस्मिक नल बंद कर देता है और बाहर निकल जाता है। जब तक आप अनलॉक नहीं करते तब तक स्क्रीन चालू रहती है।"
      ],
      "area-focus": [
        "मानचित्र पर ध्यान दें",
        "बटन छुपाता है ताकि आप अधिक मानचित्र देख सकें। स्क्रीन चालू रहती है."
      ],
      "kai-assistant": [
        "अपने सहायक KAI से मिलें",
        "उत्पादों, सवारी या फॉर्म में मदद ढूंढने के लिए KAI से पूछें। इसे कहीं भी खींचें."
      ]
    }
  },

  bn: {
    "ui": {
      "gotIt": "বুঝেছি",
      "hideAll": "সমস্ত টিপস লুকান",
      "close": "বন্ধ টিপ",
      "tip": "টিপ"
    },
    "cards": {
      "explore-create": [
        "আপনার প্রথম পোস্ট শেয়ার করুন",
        "Explore এ পাঠ্য, ফটো, ভয়েস নোট বা ভিডিও পোস্ট করতে + আলতো চাপুন।"
      ],
      "urmall-register": [
        "বিনামূল্যে আপনার ব্যবসা নিবন্ধন",
        "আপনার UrMall দোকান খুলুন, আপনি যা বিক্রি করেন তা তালিকাভুক্ত করুন এবং আপনার কাছাকাছি ক্রেতাদের কাছে পৌঁছান।"
      ],
      "urride-register": [
        "বিনামূল্যে আপনার রাইড নিবন্ধন",
        "আপনার গাড়ি বা পরিবহন কোম্পানি যোগ করুন এবং বুকিং পেতে শুরু করুন।"
      ],
      "urmall-seller-add": [
        "আপনার প্রথম তালিকা যোগ করুন",
        "পণ্য, মেনু আইটেম বা বৈশিষ্ট্য আপনি এখানে যোগ ক্রেতাদের প্রদর্শিত হবে."
      ],
      "urmall-seller-orders": [
        "নতুন অর্ডার এখানে আসে",
        "প্রতিটি অর্ডার চেক করুন এবং এর স্থিতি আপডেট করুন যাতে ক্রেতারা অবগত থাকেন।"
      ],
      "urmall-seller-messages": [
        "ক্রেতাদের উত্তর",
        "ক্রেতা প্রশ্ন জমি এখানে. দ্রুত উত্তর আরো বিক্রয় জয়."
      ],
      "urride-availability": [
        "বুকিং পেতে সক্রিয় যান",
        "আপনি সক্রিয় থাকাকালীনই যাত্রীরা আপনাকে খুঁজে পেতে এবং বুক করতে পারবেন।"
      ],
      "area-sos": [
        "এক ট্যাপে জরুরী সাহায্য",
        "পুলিশ, অ্যাম্বুলেন্স এবং ফায়ার নম্বর এবং কাছাকাছি সাহায্যের জন্য SOS এ আলতো চাপুন।"
      ],
      "area-lock": [
        "আপনি সরানোর সময় মানচিত্র লক করুন",
        "দুর্ঘটনাজনিত ট্যাপ এবং প্রস্থান বন্ধ করে। আপনি আনলক না করা পর্যন্ত স্ক্রীন চালু থাকে।"
      ],
      "area-focus": [
        "মানচিত্রে ফোকাস করুন",
        "বোতামগুলি লুকিয়ে রাখে যাতে আপনি আরও মানচিত্র দেখতে পান৷ স্ক্রিন অন থাকে।"
      ],
      "kai-assistant": [
        "আপনার সহকারী KAI এর সাথে দেখা করুন",
        "পণ্য, রাইড বা একটি ফর্মের সাহায্যের জন্য KAI কে জিজ্ঞাসা করুন। যে কোন জায়গায় টেনে আনুন।"
      ]
    }
  },
};
