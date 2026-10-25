# AI-native asistan:
# Doğal dilde gelen talebi niyet + parametrelere ayrıştırır.
# OPENAI_API_KEY tanımlıysa LLM ile, değilse kurallı Türkçe ayrıştırıcıyla çalışır
# (ikisi de aynı JSON sözcüğünü döner: {intent, ride_type, address, scheduled_at, reply}).
require "net/http"
require "json"

class AssistantService
  SYSTEM_PROMPT_DISPATCH = <<~P.freeze
    Sen hem akıllı bir taksi/ulaşım koordinatörü hem de arkadaş canlısı, genel kültürlü, sohbet edebilen AI asistansın (Gemini tabanlı).
    Kullanıcının ROLÜ (şoför/driver veya yolcu/passenger) sistem tarafından belirlenir.
    
    GÖREVLERİN:
    1. Kullanıcı taksi, kurye, transfer, randevu istiyorsa parametreleri tespit et ve yönlendir.
    2. Kullanıcı şikayet, sorun, unutulan eşya bildiriyorsa önem derecesiyle kaydet.
    3. Kullanıcı GÜNLÜK HAYATTAN konuşuyorsa (nasılsın, hava nasıl, dertleşme, şaka, genel sorular, felsefe, güncel bilgi vb.), tıpkı Gemini gibi samimi, zeki, doğal ve akıcı bir Türkçe ile sohbete devam et. Asla sadece taksi botu gibi davranıp konuyu kapatma.
    
    KULLANICI MESAJINI şu JSON formatında döndür (SADECE JSON):
    {"intent":"instant|schedule|courier|complaint|info|chat","service":"taxi|courier|transfer|delivery|errand|none","address":"alış yeri veya null","dropoff":"varış yeri veya null","time":"HH:MM veya null","day":"today|tomorrow|null","reply":"Kullanıcıya doğrudan iletilecek doğal, akıcı, zeki ve samimi Türkçe yanıt"}
    
    - instant: Müşteri hemen taksi istiyor ("taksi lazım", "araç gönder", "taksi çağır").
      * reply: Samimi bir onay verip ("Hemen ayarlıyorum!") ardından taksinin gelebilmesi için alttaki butondan veya ataçtan konum paylaşmasını iste veya Mini App'ten canlı takip edebileceğini belirt.
    - schedule: İleri tarih/saat ("yarın 14:00'te havaalanı", "akşam 8'e randevu").
    - complaint: Şikayet, fazla ücret, kaba davranış vb. ("şoför fazla aldı", "araçta cüzdanımı unuttum").
    - chat / info: Günlük sohbet, selamlaşma, şakalar, genel sorular veya bilgi isteme.
      * reply alanında kullanıcının sorusuna doğrudan, tam ve zekice yanıt ver.
  P

  SYSTEM_PROMPT_COMPLAINT = <<~P.freeze
    Sen bir taşıma şirketinin AI şikayet analiz asistanısın. Müşteri şikayetini analiz et ve SADECE şu JSON'u döndür:
    {"category":"long_route|overcharge|rude|safety|delay|vehicle|lost_item|other",
     "severity":1-5,  // 5: güvenlik/suç, 4: fazla ücret haklı şikayet, 1-3 diğer
     "summary":"tek cümle düzgün Türkçe özet",
     "search_terms":["sürücü adı", "plaka", "tarih"] veya [],
     "amount_tl": sayı veya null,  // şikayet edilen ücret farkı
     "reply":"müşteriye gönderilecek empatik kısa Türkçe cevap; çözüm adımını söyle",
     "suggested_action":"operasyon ekibine için öneri"}
    Uzun rota turlatma (long_route) ve fazla ücret (overcharge) ciddiye alınır; haklıysa ücret iadesi/indirim öner.
    Güvenlik suçlarında (5) lideri bildir.
  P

  # Doğal dili → hizmet talebi parametreleri (Anahtar öncelik sırası:
  # Gemini → OpenAI → kurallı ayrıştırıcı). history: [{role:"user|bot", text:...}]
  def self.parse(text:, profile: {}, role: nil, history: [])
    if ENV["GEMINI_API_KEY"].present?
      deep_symbolize(gemini_parse(text, profile, SYSTEM_PROMPT_DISPATCH, context: { rol: role.presence || "passenger", gecmis: history }))
    else
      deep_symbolize(rule_parse(text, profile))
    end
  end

  # Şikayet analizi
  def self.analyze_complaint(text:, profile: {}, context: {})
    if ENV["GEMINI_API_KEY"].present?
      deep_symbolize(gemini_parse(text, profile, SYSTEM_PROMPT_COMPLAINT, context: context))
    else
      deep_symbolize(rule_complaint(text))
    end
  end

  def self.deep_symbolize(hash)
    return hash unless hash.is_a?(Hash)
    JSON.parse(hash.to_json, symbolize_names: true)
  end

  # --- Gemini ---
  # Kararlı, hızlı ve 200 OK yanıt veren modeller:
  GEMINI_MODELS = %w[gemini-3.5-flash gemini-3.6-flash gemini-3.7-flash gemini-3.8-flash].freeze

  def self.gemini_generate(system_prompt:, user_text:, json: true)
    key = ENV.fetch("GEMINI_API_KEY")
    last_error = nil
    GEMINI_MODELS.each do |model|
      uri = URI("https://generativelanguage.googleapis.com/v1beta/models/#{model}:generateContent")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.read_timeout = 45
      http.open_timeout = 10
      req = Net::HTTP::Post.new(uri.path, {
        "Content-Type" => "application/json",
        "x-goog-api-key" => key
      })
      body = {
        systemInstruction: { parts: [{ text: system_prompt }] },
        contents: [{ role: "user", parts: [{ text: user_text }] }],
        generationConfig: json ? { temperature: 0.2, responseMimeType: "application/json" } : { temperature: 0.2 }
      }
      req.body = body.to_json
      res = http.request(req)
      text = JSON.parse(res.body).dig("candidates", 0, "content", "parts", 0, "text")
      return text if text.present?
      last_error = "yanıtsız"
    rescue StandardError => e
      last_error = e.message
      next
    end
    raise "tüm modeller başarısız: #{last_error}"
  end

  def self.gemini_parse(text, profile, prompt, context: {})
    user_msg = ""
    if (h = context.with_indifferent_access.delete(:gecmis)).present?
      hist_lines = h.reject { |m| m["text"].blank? }.last(8).map { |m| "#{m['role'] == 'bot' ? 'Asistan' : 'Kullanıcı'}: #{m['text']}" }.join("\n")
      user_msg += "ÖNCEKİ KONUŞMA (kısaltmalar sırayla, aynen devam et):\n#{hist_lines}\n\nŞİMDİKİ MESAJ:\n"
    end
    user_msg += "Kullanıcı: #{text}\nProfil: #{profile.to_json}"
    user_msg += "\nBağlam: #{context.to_json}" if context.present?
    content = gemini_generate(system_prompt: prompt, user_text: user_msg)
    raise "boş yanıt" if content.blank?
    JSON.parse(content)
  rescue StandardError => e
    Rails.logger.warn "[Assistant] Gemini hata: #{e.message} → kurallı ayrıştırıcıya düşüldü"
    if prompt == SYSTEM_PROMPT_COMPLAINT
      rule_complaint(text)
    else
      rule_parse(text, profile)
    end
  end

  # --- Kurallı şikayet ayrıştırıcı (anahtar yoksa) ---
  def self.rule_complaint(text)
    t = text.to_s.downcase

    if t.match?(/(fazla|pahalı|pahali|ucret|ücret).*?(ald|alın|aldi)|parayı vérdi|fazla ödedi|hakedışı|turlat|gezdi|uzun yol|dolambaç|dolamaç|uzun rota/i)
      return { "category" => "long_route", "severity" => 4, "summary" => "Şoför gereksiz uzun rota / fazla ücret şikayeti", "reply" => "Şikayetiniz için çok özür dileriz. Ücret kontrol edilip haklı bulursanız fark iade edilecek. Ekibimiz ertesi gün sizinle iletişime geçecek.", "suggested_action" => "Ride rota kaydını OSRM ile karşılaştır, fark varsa iade başlat." }
    end
    if t.match?(/(kaba|kapris|riket|savma|arogant|saygısız|saygisiz|beddi|yell)/i)
      return { "category" => "rude", "severity" => 3, "summary" => "Şoför davranış şikayeti", "reply" => "Bunu paylaşman için teşekkür ederiz. Şoförle eğitim görüşmesi yapılacak ve sonuç sana bildirilecek.", "suggested_action" => "Şoför kaydına uyarı ekle." }
    end
    if t.match?(/(kaza|yaral|tehlike|güvensi|guvensi|soyun|tehdit|hack|äktar)/i)
      return { "category" => "safety", "severity" => 5, "summary" => "Güvenlik şikayeti", "reply" => "Güvenliğin için hemen önlem alıyoruz. Şoför deaktive edildi, lider ekibinle iletişime geçilecek.", "suggested_action" => "Şoförü ASKIDA ve operasyon liderine ivedilikle bildir." }
    end
    if t.match?(/(gecik|gec geldi|beklet|not arrived|gelmedi)/i)
      return { "category" => "delay", "severity" => 2, "summary" => "Gecikme şikayeti", "reply" => "Gecikme için özür dileriz. Gelecek sefer ETA hedefimiz 5 dk içinde; bu sefer için indirim kuponu ekledik.", "suggested_action" => "Şoför performans kaydına gecikme ekle." }
    end
    { "category" => "other", "severity" => 1, "summary" => "Genel şikayet", "reply" => "Geri bildirimin için teşekkür ederiz, kaydınız alındı ve ekibimiz değerlendiriecek.", "suggested_action" => "Operasyona not düş." }
  end

  # --- Kurallı ayrıştırıcı (anahtar yoksa) ---
  def self.rule_parse(text, profile)
    t = text.to_s.strip
    name = profile[:name] || profile["name"] || "siz"

    wants_now = t.match?(/(şimdi|hemen|taksi istiyorum(görün)?\z|taksi çağr)/i)
    has_time = t[/(\d{1,2})[:.](\d{2})|\bsaat\s+(\d{1,2})(?::(\d{2}))?/]
    has_day = t.match?(/\byar\w*|tomorrow|irtifa|serbest|bugün|today/i)

    if wants_now || (t.present? && t.length <= 24 && has_time.nil? && has_day.nil? && t.match?(/taksi/i) && !t.match?(/nasıl|fiyat|ücret|komut|kayıt|nas/i))
      return { intent: "instant", ride_type: "instant", address: t.split(/\d/).last.to_s.strip.presence || "", scheduled_at: nil, ai: false, reply: "🚕 Harika #{name}, en yakın boş taksi en kısa sürede konumuna gelmek için yola çıktı." }
    end

    if has_time
      hour = has_time[1].present? ? t.match(/(\d{1,2})/, has_time.offset(0)&.first)&.captures&.first&.to_i&.to_s : nil
      day = has_day && t.match?(/\byar|tomorrow/i) ? "tomorrow" : (t.match?(/\bbugün|today/i) ? "today" : nil)
      reply = day == "tomorrow" ? "📅 Randevunu not aldım #{name} (yarın, saat #{hour}). 1 saat önceden haber vereceğim." : "📅 Randevu kaydedildi #{name}: #{hour} (bugün)."
      return {
        intent: "schedule", ride_type: "scheduled",
        address: extract_address(t), scheduled_at: normalize_time(t), reply: reply, ai: false
      }
    end

    if t.match?(/(kurye|paket|evrak|yemek get|sandık|sipariş gönd|manda)/i)
      return { intent: "courier", service: "courier", address: extract_address(t), dropoff: t.match?(/(getir|gönd|ulaştır)/i) ? t : nil, ai: false, reply: "📦 Kurye talebi anlaşıldı #{name}, paketiniz en yakın motosiklet/araçla taşınacak." }
    end

    if t.match?(/\bnasıl|fiyat|ücret|komut|kayıt|yardım|help/i)
      return { intent: "info", ai: false, reply: "ℹ️ Komutlarım:\n• 'Hemen taksi istiyorum' → konum paylaş → taksi geliyor Şimdi\n• 'Paketime Fikirtepe'den hemen Kadıköy'e kurye' → kurye\n• 'Yarın saat 15:00 Ataşehir' → randevu\n• Botu yukarıdaki Mini App butonuyla da kullanabilirsin." }
    end

    { intent: "unknown", ai: false, reply: "🤔 Ne yapmamı istersiniz? Örn: 'Yarın 15:00 Ataşehir'e gideceğim', 'Paketime Kadıköy'e kurye'." }
  end

  def self.normalize_time(text)
    m = text[/(\d{1,2})[:.](\d{2})/]
    hour, minute = m.to_s.split(/[:.]/).map(&:to_i)
    return nil unless hour && minute

    tomorrow = text.match?(/\byar|tomorrow/i)
    base = Date.current + (tomorrow ? 1 : 0).days
    Time.zone.local(base.year, base.month, base.day, hour, minute).iso8601
  rescue StandardError
    nil
  end

  def self.extract_address(text)
    cleaned = text.gsub(/\b(bugün|yarın|today|tomorrow|saat|için|randevu|gitmek|istediğim|gideceğim|ön dış tavsiye|içinde)\b/i, "")
                  .gsub(/\d{1,2}[:.]\d{2}/, "").gsub(/\s+/, " ").strip
    cleaned[/[A-ZÇĞİÖŞÜ].{2,}/]
  end
end
