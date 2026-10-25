# Rol-farkındalıklı gerçek AI bot çekirdeği.
# Ne yazılır yazılmaz mesaj Gemini ile anlaşılır ve GERÇEK eyleme dönüşür:
#   passenger: instant taksi çağırma / randevu oluşturma / şikayet kaydı / soru cevabı
#   driver:    pasif komut kalmaz; soru-şikayet-bildirim AI ile anlaşılır
# Yanıt Telegram'a / NotifyService üzerinden geri döner.
class AiInboundService
  def self.process_passenger(passenger:, chat_id:, text:, channel: "telegram")
    # Takip ekranı Telegram deep-link'i: "şoföre yaz" modunu açar
    if (m = text.to_s.match(/\A(?:\/start\s+)?write_driver_(\d+)\s*\z/i))
      d = Driver.find_by(id: m[1])
      if d
        Rails.cache.write("relay_#{passenger.id}", d.id, expires_in: 20.minutes)
        notify(chat_id, channel, "✉️ *#{d.name}* (#{d.plate}) ile yazışma modu açıldı.\n\nBu sohbete yazacağınız her mesaj ona iletilecek.\n\nBitirmek için *bitti* yazın.")
      else
        notify(chat_id, channel, "⚠️ Şoför bulunamadı.")
      end
      return { success: true, action: "relay_start" }
    end

    # Aktif yazışma modu: gelen metni AI'a değil, şoförün kanalına ilet
    if (rid = Rails.cache.read("relay_#{passenger.id}"))
      if text.to_s.match?(/\A\s*(bitti|bitir|kapat|iptal)\s*\z/i)
        Rails.cache.delete("relay_#{passenger.id}")
        notify(chat_id, channel, "✅ Yazışma modu kapatıldı.")
        return { success: true, action: "relay_end" }
      end
      rly = Driver.find_by(id: rid)
      unless rly
        Rails.cache.delete("relay_#{passenger.id}")
        return :no_view
      end
      sent_ok = false
      if rly.telegram_id.present?
        res = TelegramService.send_message(chat_id: rly.telegram_id, text: "👤 #{passenger.name} (yolcu):\n#{text}")
        sent_ok = res.is_a?(Hash) && res["ok"] == true
      elsif rly.phone.present?
        res = WhatsappService.send_message(to: rly.phone, text: "👤 #{passenger.name} (yolcu):\n#{text}")
        sent_ok = res.is_a?(Hash) && res["ok"] == true
      end
      notify(chat_id, channel, sent_ok ? "✉️ Mesajınız #{rly.name}'e iletildi." : "⚠️ Mesaj iletilemedi, şoförü arayın: #{rly.phone}")
      return { success: true, action: "relay" }
    end

    profile = {
      name: passenger.name, phone: passenger.phone,
      konum: passenger.last_latitude.present? ? { lat: passenger.last_latitude, lng: passenger.last_longitude } : nil
    }
    chat_key = channel == "telegram" ? "tg_#{chat_id}" : "tg_#{chat_id}"
    history = ChatMessage.history_for(chat_key)
    result = AssistantService.parse(text: text.to_s.strip, profile: profile, role: "passenger", history: history)
    Rails.logger.info "[AI-INBOUND] passenger ##{passenger.id} intent=#{result[:intent]} ai=#{result[:ai] ? 'gemini' : 'kural'}"
    ChatMessage.log!(chat_key, "user", text)

    # Deterministik: şikayet durumu sorgusu (AI'a gitmeden anında yanıt)
    if text.to_s.match?(/\A\s*şikayet(ler)?i?m?\s*(durum|durumu|list|liste|nerede)?\s*\z/i)
      list = Complaint.where(passenger: passenger).order(created_at: :desc).limit(5)
      first = true
      if list.empty?
        notify(chat_id, channel, "🚨 Kayıtlı şikayetiniz bulunmuyor.")
        return { success: true, action: "complaint_status" }
      end
      icon_map = { "open" => "🔍", "in_progress" => "⏳", "resolved" => "✅", "rejected" => "❌" }
      lines = ["🚨 Şikayetleriniz:"]
      list.each do |c|
        icon = icon_map[c.status] || "🔍"
        lines << "#{icon} No #{c.id} • #{c.category} • önem #{c.severity}/5 • durum: #{c.status}"
      end
      lines << "\n💡 Sonuçlandığında '✅' işaretini görürsünüz."
      notify(chat_id, channel, lines.join("\n"))
      return { success: true, action: "complaint_status" }
    end

    case result[:intent].to_s
    when "complaint"
      analysis = AssistantService.analyze_complaint(text: text.to_s, profile: profile.symbolize_keys)

      # Yolcunun son sürüşünü bul (varsa şoför ve ride'ı otomatik bağla)
      recent_ride = Ride.where(passenger: passenger).order(created_at: :desc).first
      assigned_driver = recent_ride&.driver

      c = Complaint.create!(
        passenger: passenger,
        driver: assigned_driver,
        ride: recent_ride,
        raw_text: text.to_s,
        category: analysis[:category].presence || "other",
        severity: (analysis[:severity].presence || 1).to_i.clamp(1, 5),
        ai_summary: analysis[:summary],
        ai_reply: analysis[:reply],
        suggested_action: analysis[:suggested_action],
        channel: "telegram_passenger"
      )

      # 1. Yolcuya onay mesajı
      notify(
        chat_id, channel,
        "🚨 Şikayetiniz kaydedildi.\n\n" \
        "• Takip No: *#{c.id}*\n" \
        "• Kategori: #{c.category}\n" \
        "• Önem derecesi: #{c.severity}/5\n" \
        "• Durum: 🔍 incelemede (open)\n\n" \
        "#{analysis[:reply]}\n\n" \
        "Durumu görmek için *şikayetlerim* yazabilirsiniz."
      )

      # 2. Şoföre Anında Bilgilendirme Gönder (Gerçek İletişim)
      if assigned_driver&.telegram_id.present?
        TelegramService.send_message(
          chat_id: assigned_driver.telegram_id,
          text: "⚠️ *ÖNEMLİ BİLDİRİM - Şikayet Kaydı (No: ##{c.id})*\n\n" \
                "Az önceki yolculuğunuz hakkında bir şikayet iletildi:\n" \
                "• Konu: #{c.category}\n" \
                "• Müşteri İfadesi: \"#{text}\"\n" \
                "• Önem Derecesi: #{c.severity}/5\n\n" \
                "Operasyon ve yönetim birimimiz konuyu incelemeye aldı."
        )
      end

      # 3. Yöneticiye (Admin) Anında Telegram Bildirimi (Eğer ADMIN_TELEGRAM_ID tanımlıysa)
      admin_tg_id = ENV["ADMIN_TELEGRAM_ID"].presence
      # Eğer şoförün kendisi testte adminse ya da tanımlıysa ona da düşür
      if admin_tg_id.present?
        frontend_url = ENV.fetch("FRONTEND_URL", "https://gadis-taxi-alpha.vercel.app")
        TelegramService.send_message(
          chat_id: admin_tg_id,
          text: "🚨 *YENİ MÜŞTERİ ŞİKAYETİ DÜŞTÜ (No: ##{c.id})*\n\n" \
                "👤 Yolcu: #{passenger.name} (#{passenger.phone})\n" \
                "🚖 Şoför: #{assigned_driver&.name || 'Bilinmiyor'} (#{assigned_driver&.plate || '-'})\n" \
                "📌 Kategori: #{c.category} | Önem: #{c.severity}/5\n" \
                "💬 Metin: \"#{text}\"\n" \
                "🤖 AI Önerisi: #{c.suggested_action}\n\n" \
                "👉 İncelemek ve Onay/Ret vermek için: #{frontend_url}/admin"
        )
      end

      ChatMessage.log!(chat_key, "bot", "Şikayetiniz kaydedildi (No #{c.id}). #{analysis[:reply].presence}")
      { success: true, action: "complaint" }
    when "courier"
      # Paket/kurye: yolcu binmez, eşya taşınır — aynı dispatch akışı, kurye dili
      if passenger.last_latitude.present?
        res = DispatchService.assign_nearest_driver(
          pickup_lat: passenger.last_latitude,
          pickup_lng: passenger.last_longitude,
          passenger: passenger,
          pickup_address: result[:address].presence || "Kurye alış noktası",
          ride_type: "instant",
          channel: channel,
          service: result[:service].presence || "courier",
          dropoff_address: result[:dropoff].presence
        )
        notify(chat_id, channel, "📦 Kurye talebiniz alındı; en yakın kurye atandı. Karşı tarafa bildirim gitti.")
        res
      else
        notify(chat_id, channel, "📦 Kurye çağırmak için paketin ALINACAĞI konumu paylaşmanız gerekiyor — Telegram'da 📎 → Konum gönderin.")
        { success: false, need: :location }
      end
    when "instant"
      if passenger.last_latitude.present?
        res = DispatchService.assign_nearest_driver(
          pickup_lat: passenger.last_latitude,
          pickup_lng: passenger.last_longitude,
          passenger: passenger,
          pickup_address: "Canlı konum",
          ride_type: "instant",
          channel: channel
        )
        # DispatchService zaten yolcuya takip linki gönderir; AI ek mesajı yalnızca
        # dağıtım başamazsa birleştir.
        if res.respond_to?(:[]) && res[:success] != true && res[:action] != "dispatched"
          notify(chat_id, channel, "⚠️ Şu an uygun boş taksi bulunamadı. Birazdan tekrar deneyeceğiz.")
        end
        res
      else
        notify(chat_id, channel, "🚕 Taksi çağırmak için konum paylaşımınız gerekiyor — Telegram'da 📎 → Konum gönderin.")
        { success: false, need: :location }
      end
    when "schedule"
      iso = result[:scheduled_at].presence || schedule_iso(result[:time], result[:day])
      res = AppointmentSchedulerService.schedule_ride(
        passenger: passenger,
        raw_text: text.to_s,
        pickup_lat: passenger.last_latitude || 41.037,
        pickup_lng: passenger.last_longitude || 28.985,
        dropoff_address: result[:dropoff].presence,
        pickup_address: result[:address].presence || "Bilinen konum",
        explicit_time: iso ? Time.zone.parse(iso) : nil,
        channel: channel
      )
      notify(chat_id, channel, "📅 #{result[:reply].presence || 'Randevunuz kaydedildi. 1 saat önceden hatırlatacağız.'}")
      res
    else
      if result[:reply].blank?
        return :no_view
      end
      notify(chat_id, channel, result[:reply])
      ChatMessage.log!(chat_key, "bot", result[:reply])
      { success: true, action: "info" }
    end
  end

  def self.process_driver(driver:, chat_id:, text:, channel: "telegram")
    profile = { name: driver.name, phone: driver.phone, plate: driver.plate, durum: driver.status }
    chat_key = channel == "telegram" ? "tg_driver_#{chat_id}" : "driver_#{chat_id}"
    
    # Şoförün geçmiş sohbet hafızasını al ve yeni mesajı kaydet
    history = ChatMessage.history_for(chat_key, 10)
    ChatMessage.log!(chat_key, "user", text.to_s.strip)

    result = AssistantService.parse(text: text.to_s.strip, profile: profile, role: "driver", history: history)
    Rails.logger.info "[AI-INBOUND] driver ##{driver.id} intent=#{result[:intent]} ai=#{result[:ai] ? 'gemini' : 'kural'}"

    case result[:intent].to_s
    when "complaint"
      analysis = AssistantService.analyze_complaint(text: text.to_s, profile: profile.symbolize_keys, context: { kaynak: "şoför" })
      Complaint.create!(
        driver: driver,
        raw_text: text.to_s,
        category: analysis[:category].presence || "other",
        severity: (analysis[:severity].presence || 1).to_i.clamp(1, 5),
        ai_summary: analysis[:summary],
        ai_reply: analysis[:reply],
        suggested_action: analysis[:suggested_action],
        channel: "telegram_driver"
      )
      reply_text = "🚨 Bildiriminiz kaydedildi.\n\n#{analysis[:reply]}"
      notify(chat_id, channel, reply_text)
      ChatMessage.log!(chat_key, "bot", reply_text)
      { success: true, action: "complaint" }
    else
      reply_text = result[:reply].presence || "🤖 Şoför komutları için 'çağrılar', 'kabul 13' gibi yazabilirsiniz."
      notify(chat_id, channel, reply_text)
      ChatMessage.log!(chat_key, "bot", reply_text)
      { success: true, action: "info" }
    end
  end

  def self.schedule_iso(time, day)
    return nil if time.blank?
    hour, minute = time.to_s.split(":").map(&:to_i)
    base = Date.current + (day == "tomorrow" ? 1 : 0).days
    Time.zone.local(base.year, base.month, base.day, hour || 0, minute || 0).iso8601
  rescue StandardError
    nil
  end

  def self.notify(chat_id, channel, text)
    if channel == "telegram" && chat_id.present?
      TelegramService.send_message(chat_id: chat_id, text: text)
    else
      Rails.logger.info "[AI OUTBOUND] #{text}"
    end
  end
end
