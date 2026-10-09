// KAI business registration and usage controls (2026-10-10).
// Each locale's section is grafted onto TRANSLATIONS as `kaiRegistrationFix` and read with
// t("kaiRegistrationFix.<key>"). Every locale must carry the same keys.
export const KAI_REGISTRATION_FIX = {
  en: {
    kind: {
      unsure: "Tell me which kind of business this is: a retail shop, a vendor or supplier, a restaurant, or a real estate agent.",
      fieldNotForKind: "This field does not apply to this business type.",
    },
    field: {
      openingDays: "Opening days",
      restaurantDescription: "Description (cuisine and signature meals)",
      propertyDescription: "Description (property types and areas you serve)",
    },
    limit: {
      rateLimited: "You are asking KAI very quickly. Please wait a moment and try again.",
      budgetExceeded: "You have reached today's KAI limit. It resets within a day.",
      resting: "KAI is resting for a while. Please try again later.",
    },
  },
  fr: {
    kind: {
      unsure: "Dites-moi quel type d'entreprise c'est : une boutique, un fournisseur, un restaurant ou une agence immobilière.",
      fieldNotForKind: "Ce champ ne s'applique pas à ce type d'entreprise.",
    },
    field: {
      openingDays: "Jours d'ouverture",
      restaurantDescription: "Description (cuisine et plats phares)",
      propertyDescription: "Description (types de biens et zones desservies)",
    },
    limit: {
      rateLimited: "Vous sollicitez KAI très rapidement. Patientez un instant puis réessayez.",
      budgetExceeded: "Vous avez atteint la limite KAI du jour. Elle se réinitialise en moins d'un jour.",
      resting: "KAI se repose un moment. Veuillez réessayer plus tard.",
    },
  },
  es: {
    kind: {
      unsure: "Dime qué tipo de negocio es: una tienda, un proveedor o mayorista, un restaurante o una inmobiliaria.",
      fieldNotForKind: "Este campo no se aplica a este tipo de negocio.",
    },
    field: {
      openingDays: "Días de apertura",
      restaurantDescription: "Descripción (cocina y platos estrella)",
      propertyDescription: "Descripción (tipos de inmuebles y zonas que atiendes)",
    },
    limit: {
      rateLimited: "Estás consultando a KAI muy rápido. Espera un momento y vuelve a intentarlo.",
      budgetExceeded: "Has alcanzado el límite diario de KAI. Se restablece en menos de un día.",
      resting: "KAI está descansando un rato. Inténtalo de nuevo más tarde.",
    },
  },
  zh: {
    kind: {
      unsure: "请告诉我这是哪种商家：零售商店、供应商（批发）、餐厅，还是房地产经纪。",
      fieldNotForKind: "此字段不适用于该商家类型。",
    },
    field: {
      openingDays: "营业日",
      restaurantDescription: "简介（菜系和招牌菜）",
      propertyDescription: "简介（经营的房产类型和服务区域）",
    },
    limit: {
      rateLimited: "你向 KAI 提问太快了。请稍等片刻再试。",
      budgetExceeded: "你已达到今天的 KAI 使用上限，一天内会重置。",
      resting: "KAI 正在休息，请稍后再试。",
    },
  },
  ar: {
    kind: {
      unsure: "أخبرني بنوع النشاط التجاري: متجر تجزئة، أو مورّد أو تاجر جملة، أو مطعم، أو وكيل عقارات.",
      fieldNotForKind: "هذا الحقل لا ينطبق على هذا النوع من الأنشطة التجارية.",
    },
    field: {
      openingDays: "أيام العمل",
      restaurantDescription: "الوصف (نوع المطبخ والأطباق المميزة)",
      propertyDescription: "الوصف (أنواع العقارات والمناطق التي تخدمها)",
    },
    limit: {
      rateLimited: "أنت تسأل KAI بسرعة كبيرة. انتظر قليلًا ثم حاول مرة أخرى.",
      budgetExceeded: "لقد بلغت حد استخدام KAI لهذا اليوم. سيُعاد ضبطه خلال يوم.",
      resting: "KAI في استراحة الآن. يُرجى المحاولة لاحقًا.",
    },
  },
  pt: {
    kind: {
      unsure: "Diga-me que tipo de negócio é: uma loja, um fornecedor ou atacadista, um restaurante ou uma imobiliária.",
      fieldNotForKind: "Este campo não se aplica a este tipo de negócio.",
    },
    field: {
      openingDays: "Dias de funcionamento",
      restaurantDescription: "Descrição (culinária e pratos principais)",
      propertyDescription: "Descrição (tipos de imóveis e regiões atendidas)",
    },
    limit: {
      rateLimited: "Você está chamando o KAI muito rápido. Aguarde um momento e tente novamente.",
      budgetExceeded: "Você atingiu o limite diário do KAI. Ele é renovado em até um dia.",
      resting: "O KAI está descansando um pouco. Tente novamente mais tarde.",
    },
  },
  hi: {
    kind: {
      unsure: "बताइए यह किस तरह का व्यवसाय है: खुदरा दुकान, वेंडर या थोक आपूर्तिकर्ता, रेस्टोरेंट, या रियल एस्टेट एजेंट।",
      fieldNotForKind: "यह फ़ील्ड इस व्यवसाय प्रकार पर लागू नहीं होता।",
    },
    field: {
      openingDays: "खुलने के दिन",
      restaurantDescription: "विवरण (व्यंजन और ख़ास पकवान)",
      propertyDescription: "विवरण (संपत्ति के प्रकार और आपके सेवा क्षेत्र)",
    },
    limit: {
      rateLimited: "आप KAI से बहुत जल्दी-जल्दी पूछ रहे हैं। कृपया थोड़ा रुककर फिर कोशिश करें।",
      budgetExceeded: "आप आज की KAI सीमा तक पहुँच गए हैं। यह एक दिन के भीतर रीसेट हो जाएगी।",
      resting: "KAI अभी थोड़ा आराम कर रहा है। कृपया बाद में फिर कोशिश करें।",
    },
  },
  bn: {
    kind: {
      unsure: "বলুন এটি কোন ধরনের ব্যবসা: খুচরা দোকান, ভেন্ডর বা পাইকারি সরবরাহকারী, রেস্তোরাঁ, নাকি রিয়েল এস্টেট এজেন্ট।",
      fieldNotForKind: "এই ঘরটি এই ধরনের ব্যবসার জন্য প্রযোজ্য নয়।",
    },
    field: {
      openingDays: "খোলার দিন",
      restaurantDescription: "বিবরণ (রান্নার ধরন ও বিশেষ খাবার)",
      propertyDescription: "বিবরণ (সম্পত্তির ধরন ও যে এলাকায় সেবা দেন)",
    },
    limit: {
      rateLimited: "আপনি খুব দ্রুত KAI-কে জিজ্ঞেস করছেন। একটু অপেক্ষা করে আবার চেষ্টা করুন।",
      budgetExceeded: "আপনি আজকের KAI সীমায় পৌঁছে গেছেন। এটি এক দিনের মধ্যে আবার চালু হবে।",
      resting: "KAI এখন একটু বিশ্রাম নিচ্ছে। পরে আবার চেষ্টা করুন।",
    },
  },
  id: {
    kind: {
      unsure: "Beri tahu saya jenis usahanya: toko ritel, vendor atau pemasok grosir, restoran, atau agen properti.",
      fieldNotForKind: "Kolom ini tidak berlaku untuk jenis usaha ini.",
    },
    field: {
      openingDays: "Hari buka",
      restaurantDescription: "Deskripsi (jenis masakan dan menu andalan)",
      propertyDescription: "Deskripsi (jenis properti dan wilayah layanan)",
    },
    limit: {
      rateLimited: "Anda bertanya ke KAI terlalu cepat. Tunggu sebentar lalu coba lagi.",
      budgetExceeded: "Anda telah mencapai batas KAI hari ini. Batas diatur ulang dalam sehari.",
      resting: "KAI sedang beristirahat sebentar. Silakan coba lagi nanti.",
    },
  },
  ur: {
    kind: {
      unsure: "بتائیں یہ کس قسم کا کاروبار ہے: ریٹیل دکان، وینڈر یا ہول سیل سپلائر، ریستوران، یا رئیل اسٹیٹ ایجنٹ۔",
      fieldNotForKind: "یہ خانہ اس قسم کے کاروبار پر لاگو نہیں ہوتا۔",
    },
    field: {
      openingDays: "کھلنے کے دن",
      restaurantDescription: "تفصیل (کھانوں کی قسم اور خاص ڈشیں)",
      propertyDescription: "تفصیل (جائیداد کی اقسام اور آپ کے سروس علاقے)",
    },
    limit: {
      rateLimited: "آپ KAI سے بہت تیزی سے پوچھ رہے ہیں۔ تھوڑا انتظار کر کے دوبارہ کوشش کریں۔",
      budgetExceeded: "آپ آج کی KAI حد تک پہنچ گئے ہیں۔ یہ ایک دن کے اندر دوبارہ شروع ہو جائے گی۔",
      resting: "KAI ابھی کچھ دیر آرام کر رہا ہے۔ براہ کرم بعد میں دوبارہ کوشش کریں۔",
    },
  },
  ru: {
    kind: {
      unsure: "Скажите, какой это бизнес: розничный магазин, поставщик или оптовик, ресторан или агентство недвижимости.",
      fieldNotForKind: "Это поле не относится к такому типу бизнеса.",
    },
    field: {
      openingDays: "Дни работы",
      restaurantDescription: "Описание (кухня и фирменные блюда)",
      propertyDescription: "Описание (типы недвижимости и районы работы)",
    },
    limit: {
      rateLimited: "Вы обращаетесь к KAI слишком часто. Подождите немного и попробуйте снова.",
      budgetExceeded: "Вы исчерпали дневной лимит KAI. Он обновится в течение суток.",
      resting: "KAI немного отдыхает. Пожалуйста, попробуйте позже.",
    },
  },
  ja: {
    kind: {
      unsure: "どの種類のビジネスか教えてください：小売店、仕入れ先・卸売業者、レストラン、または不動産業者。",
      fieldNotForKind: "この項目はこのビジネスの種類には当てはまりません。",
    },
    field: {
      openingDays: "営業日",
      restaurantDescription: "説明（料理のジャンルと看板メニュー）",
      propertyDescription: "説明（扱う物件の種類と対応エリア）",
    },
    limit: {
      rateLimited: "KAI への質問が続いています。少し待ってからもう一度お試しください。",
      budgetExceeded: "本日の KAI の上限に達しました。1 日以内にリセットされます。",
      resting: "KAI は少し休憩中です。しばらくしてからもう一度お試しください。",
    },
  },
  mr: {
    kind: {
      unsure: "हा कोणत्या प्रकारचा व्यवसाय आहे ते सांगा: किरकोळ दुकान, विक्रेता किंवा घाऊक पुरवठादार, रेस्टॉरंट, की रिअल इस्टेट एजंट.",
      fieldNotForKind: "हे फील्ड या व्यवसाय प्रकाराला लागू होत नाही.",
    },
    field: {
      openingDays: "उघडण्याचे दिवस",
      restaurantDescription: "वर्णन (पाककृती प्रकार आणि खास पदार्थ)",
      propertyDescription: "वर्णन (मालमत्तेचे प्रकार आणि तुमचे सेवा क्षेत्र)",
    },
    limit: {
      rateLimited: "तुम्ही KAI ला खूप पटापट विचारत आहात. थोडा वेळ थांबून पुन्हा प्रयत्न करा.",
      budgetExceeded: "तुम्ही आजची KAI मर्यादा गाठली आहे. ती एका दिवसात पुन्हा सुरू होईल.",
      resting: "KAI सध्या थोडी विश्रांती घेत आहे. कृपया नंतर पुन्हा प्रयत्न करा.",
    },
  },
  vi: {
    kind: {
      unsure: "Hãy cho tôi biết đây là loại hình kinh doanh nào: cửa hàng bán lẻ, nhà cung cấp hoặc bán sỉ, nhà hàng, hay môi giới bất động sản.",
      fieldNotForKind: "Trường này không áp dụng cho loại hình kinh doanh này.",
    },
    field: {
      openingDays: "Ngày mở cửa",
      restaurantDescription: "Mô tả (phong cách ẩm thực và món đặc trưng)",
      propertyDescription: "Mô tả (loại bất động sản và khu vực phục vụ)",
    },
    limit: {
      rateLimited: "Bạn đang hỏi KAI quá nhanh. Vui lòng chờ một chút rồi thử lại.",
      budgetExceeded: "Bạn đã dùng hết giới hạn KAI hôm nay. Giới hạn sẽ được đặt lại trong vòng một ngày.",
      resting: "KAI đang nghỉ ngơi một lúc. Vui lòng thử lại sau.",
    },
  },
  de: {
    kind: {
      unsure: "Sag mir, welche Art von Geschäft das ist: ein Einzelhandelsgeschäft, ein Lieferant oder Großhändler, ein Restaurant oder ein Immobilienmakler.",
      fieldNotForKind: "Dieses Feld gilt nicht für diese Geschäftsart.",
    },
    field: {
      openingDays: "Öffnungstage",
      restaurantDescription: "Beschreibung (Küche und Spezialitäten)",
      propertyDescription: "Beschreibung (Immobilienarten und betreute Gebiete)",
    },
    limit: {
      rateLimited: "Du fragst KAI sehr schnell hintereinander. Bitte warte kurz und versuche es erneut.",
      budgetExceeded: "Du hast das heutige KAI-Limit erreicht. Es wird innerhalb eines Tages zurückgesetzt.",
      resting: "KAI macht gerade eine Pause. Bitte versuche es später erneut.",
    },
  },
};
