# Şoförlerin Telegram/WhatsApp bot üzerinden yönetim akışı.
# Bağlantı: "şoför +905321000006" (telefon eşleşirse telegram_id kaydedilir)
# Komutlar: "çağrılar", "kabul 13", "aldım 13" (yolcu alındı), "bitti 13", "iptal 13"
# Konum: şoför Telegram'da konum gönderirse GPS telemetrisi olarak geçer.
class DriverInboundService
  HELP = <<~TXT.freeze
    🚖 Şoför Komutları:
    • şoför         → numara paylaşarak giriş (buton)
    • kaydol Ad, tel, plaka → hemen kayıt
    • çağrılar      → bekleyen çağrı listesi
    • kabul 13      → çağrıyı kabul et
    • aldım 13      → yolcuyu aldım (yolculuk başladı)
    • bitti 13      → tur tamamlandı
    • iptal 13      → çağrıyı iptal et
    • harita        → şoför paneli linkini gönder
    • 📍 konum ataç → canlı GPS paylaşımı
  TXT

  def self.process(chat_id:, text: nil, location: nil)
    text = text.to_s.strip

    # 0) Menü: "şoför" (telefonsuz) → numara paylaşma klavyesi
    #    /start → kayıtlı şoförse mini panel; kayıtsızsa yolcu akışına bırak (müşteri girişi)
    if text.match?(/\A(şoför|sofor|\/şoför|\/sofor)\s*$/i)
      TelegramService.send_contact_request(
        chat_id: chat_id,
        text: "🚖 *Şoför Girişi*\n\nAşağıdaki butona basıp telefon numaranızı paylaşın — kayıt varsa panelinize bağlanırsınız.\nYoksa 'kaydol Ad /9053..., PLAKA' yazarak saniyeler içinde kayıt olabilirsiniz."
      )
      return :menu
    end

    if text.match?(/\A\/start\s*$/i)
      existing = Driver.find_by(telegram_id: chat_id.to_s)
      if existing
        TelegramService.send_miniapp(
          chat_id: chat_id,
          text: "🚖 Hoş geldiniz #{existing.name}! Paneliniz Telegram içinde açılır.\n#{HELP}",
          button_text: "🗺️ Şoför Panelini Aç"
        )
        return :menu
      end
      return :not_driver # yolcu → müşteri Mini App girişi (WebhooksController)
    end

    # 1) Bot eşleştirme: "şoför +905321000006" veya "kaydol Ad, +90..., PLAKA"
    if text.match?(/\A(şoför|sofor|\/şoför|\/sofor)\s+\+?/i)
      phone = text.split(/\s+/).last
      driver = find_by_phone(phone)
      if driver
        driver.update!(telegram_id: chat_id.to_s)
        TelegramService.send_miniapp(
          chat_id: chat_id,
          text: "🚖 Hoş geldiniz #{driver.name}! Paneliniz Telegram içinde açılır.\n#{HELP}",
          button_text: "🗺️ Şoför Panelini Aç"
        )
      else
        TelegramService.send_contact_request(chat_id: chat_id, text: "Bu telefonla kayıtlı şoför bulunamadı.\nÖrn: 'şoför +905321000006'")
      end
      return :linked_attempt
    end

    # 1b) Kayıt: "kaydol Ad, +90..., 34 ABC 123"
    if text.match?(/\A(kaydol|kayıt)\b/i)
      parts = text.sub(/\A(kaydol|kayıt)\b/i, "").strip
      plate = parts[/\d{1,2}\s+\w{1,3}\s+\d{1,3}|\d+\s*\w*$/].presence
      pieces = parts.split(",")
      name = pieces[0].to_s.strip
      phone = pieces[1].to_s.strip
      plate ||= pieces[2].to_s.strip
      if name.present? && phone.present? && plate.present?
        driver = Driver.find_or_initialize_by(phone: phone)
        driver.name = name
        driver.plate = plate
        driver.status = "available"
        driver.latitude = 41.0082 if driver.latitude.blank?
        driver.longitude = 28.9784 if driver.longitude.blank?
        driver.save!
        driver.update!(telegram_id: chat_id.to_s)
        TelegramService.send_miniapp(
          chat_id: chat_id,
          text: "✅ Kayıt tamam! #{driver.name} (#{driver.plate})\nArtık çağrı alabilirsiniz.\n#{HELP}",
          button_text: "🗺️ Şoför Panelini Aç"
        )
        return :registered
      else
        TelegramService.send_message(chat_id: chat_id, text: "Format: kaydol Ad Soyad, +905xxxxxxx, 34 ABC 123")
        return :register_failed
      end
    end

    driver = Driver.find_by(telegram_id: chat_id.to_s)
    return :not_driver unless driver

    # 1c) Harita/panel linki: "harita", "panel", "giriş"
    if text.match?(/\A(harita|panel|giriş|giris)\z/i)
      TelegramService.send_miniapp(
        chat_id: chat_id,
        text: "🗺️ Şoför paneliniz Telegram içinde açılır (siteye çıkmanıza gerek yok).\n#{HELP}",
        button_text: "🚖 Şoför Panelini Aç"
      )
      return :panel
    end

    driver = Driver.find_by(telegram_id: chat_id.to_s)
    return :not_driver unless driver

    # 2) Konum paylaşımı = canlı GPS telemetrisi
    if location.is_a?(Hash)
      result = RideFlowService.update_location(driver, location["latitude"].to_f, location["longitude"].to_f)
      active = result[:active_ride]
      if active
        TelegramService.send_message(chat_id: chat_id, text: "🛰️ Konum güncellendi. Aktif çağrı ##{active.id}: #{active.distance_km} km, ETA #{active.eta_minutes} dk.")
      else
        TelegramService.send_message(chat_id: chat_id, text: "🛰️ Konumunuz güncellendi, müşteriler sizi haritada görebiliyor.")
      end
      return :location
    end

    return :no_input if text.empty?

    # 3) Komutlar
    case text.downcase
    when /çağrılar|cagrilar|yeni|liste/
      list_calls(driver, chat_id)
    when /^(kabul)\s*(\d+)?$/i
      ride_id = Regexp.last_match(2) || latest_pending_ride_id(driver)
      handle_flow(driver, chat_id, ride_id, "accept")
    when /^(aldım|aldim|başlad|baslad)\s*(\d+)?$/i
      ride_id = Regexp.last_match(2) || latest_assigned_ride_id(driver, %w[dispatched])
      handle_flow_status(driver, chat_id, ride_id, "start")
    when /^(bitti|bast?i|tamam)\s*(\d+)?$/i
      ride_id = Regexp.last_match(2) || latest_assigned_ride_id(driver, %w[in_progress])
      handle_flow_status(driver, chat_id, ride_id, "complete")
    when /^(iptal|cancel|gelmem|gelmeyeceğim|gelmiyecem|gidemem|gidemeyeceğim|gidemiyorum|vazgeç)\s*(\d+)?$/i
      ride_id = Regexp.last_match(2) || latest_assigned_ride_id(driver, %w[dispatched in_progress])
      handle_flow_status(driver, chat_id, ride_id, "cancel")
    else
      # Komut eşleşmedi → şoförün serbest yazdığı her şey AI ile anlaşılır
      AiInboundService.process_driver(driver: driver, chat_id: chat_id, text: text, channel: "telegram")
    end
  end

  # Telefon eşleştirmede +90/90/0 önekleri fark etmez (rakamları karşılaştır)
  def self.find_by_phone(raw)
    digits = raw.to_s.gsub(/\D/, "")
    return nil if digits.blank?
    digits = digits.sub(/\A90/, "") if digits.length > 10 && digits.start_with?("90")
    digits = digits.sub(/\A0/, "") if digits.length == 11 && digits.start_with?("0")

    Driver.all.find do |d|
      d_digits = d.phone.to_s.gsub(/\D/, "")
      d_digits = d_digits.sub(/\A90/, "") if d_digits.length > 10 && d_digits.start_with?("90")
      d_digits == digits
    end
  end

  def self.list_calls(driver, chat_id)
    rides = Ride.where(status: %w[pending dispatched confirmed])
                .where("driver_id IS NULL OR driver_id = ?", driver.id)
                .order(created_at: :desc).limit(8)

    if rides.empty?
      TelegramService.send_message(chat_id: chat_id, text: "Şu anda bekleyen çağrı yok. Yeni çağrı geldiğinde kısa süre içinde bildirilecek 🚕")
      return
    end

    lines = rides.map do |r|
      dist = Driver.calculate_distance(driver.latitude, driver.longitude, r.pickup_latitude, r.pickup_longitude)
      state = r.driver_id == driver.id ? "→ SİZE ATANDI" : "→ BEKLİYOR"
      "##{r.id} #{r.passenger.name} • #{r.pickup_address.presence || '(koordinat)'} • #{dist} km #{state}"
    end
    TelegramService.send_message(chat_id: chat_id, text: "📢 Bekleyen Çağrılar:\n#{lines.join("\n")}\n\nKabul için: 'kabul <no>'")
  end

  def self.handle_flow(driver, chat_id, ride_id, _mode)
    ride = Ride.find_by(id: ride_id)
    unless ride
      TelegramService.send_message(chat_id: chat_id, text: "Çağrı ##{ride_id} bulunamadı. 'çağrılar' yazıp listeyi görebilirsiniz.")
      return
    end

    result = RideFlowService.accept(driver, ride)
    if result[:success]
      TelegramService.send_message(chat_id: chat_id, text: "✅ Çağrı ##{ride.id} kabul edildi!\nYolcu: #{ride.passenger.name}\nAlış: #{ride.pickup_address.presence || '(koordinat)'}\n🗺️ Müşteriye canlı takip linki gönderildi.\n\nYolcuyu alınca: 'aldım #{ride.id}'")
    else
      TelegramService.send_message(chat_id: chat_id, text: "⚠️ #{result[:error]}")
    end
  end

  def self.handle_flow_status(driver, chat_id, ride_id, action)
    ride = Ride.find_by(id: ride_id)
    unless ride
      TelegramService.send_message(chat_id: chat_id, text: "Çağrı ##{ride_id} bulunamadı.")
      return
    end

    result = RideFlowService.change_status(driver, ride, action)
    if result[:success]
      msg = { "start" => "🚕 Yolculuk başlatıldı ##{ride.id}", "complete" => "🏁 Tur tamamlandı ##{ride.id}", "cancel" => "❌ Çağrı iptal ##{ride.id}" }[action]
      TelegramService.send_message(chat_id: chat_id, text: msg)
    else
      TelegramService.send_message(chat_id: chat_id, text: "⚠️ #{result[:error]}")
    end
  end

  def self.latest_pending_ride_id(driver)
    r = Ride.where(status: %w[pending dispatched])
            .where("driver_id IS NULL OR driver_id = ?", driver.id)
            .order(created_at: :desc).first
    r&.id&.to_s
  end

  def self.latest_assigned_ride_id(driver, statuses)
    r = driver.rides.where(status: statuses).order(created_at: :desc).first
    r&.id&.to_s
  end
end
