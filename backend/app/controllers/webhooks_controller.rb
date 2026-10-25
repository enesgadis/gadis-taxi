class WebhooksController < ApplicationController
  def verify
    mode = params["hub.mode"]
    token = params["hub.verify_token"]
    challenge = params["hub.challenge"]
    verify_token = ENV.fetch("WHATSAPP_VERIFY_TOKEN", "taxibot_secret_token_123")
    if mode == "subscribe" && token == verify_token
      render plain: challenge, status: :ok
    else
      render plain: "Verification token mismatch", status: :forbidden
    end
  end

  def receive
    entries = params["entry"] || []
    entries.each do |entry|
      (entry["changes"] || []).each do |change|
        messages = change.dig("value", "messages") || []
        messages.each { |message| handle_whatsapp(message) }
      end
    end
    render json: { status: "received" }, status: :ok
  rescue StandardError => e
    Rails.logger.error "WhatsApp Webhook Error: #{e.message}"
    render json: { error: e.message }, status: :internal_server_error
  end

  def telegram
    # Inline buton yanıtları: ✅ Al / ❌ Alamazsın (şoför çağrı teklifi)
    if (cq = params["callback_query"]).present?
      d = cq["data"].to_s
      cq_from = cq.dig("from", "id")
      driver = Driver.find_by(telegram_id: cq_from.to_s)
      if driver && d.match?(/\A(kabul|ret)_(\d+)\z/i)
        action, ride_id = $1, $2
        ride = Ride.find_by(id: ride_id)
        if ride
          if action == "kabul"
            res = RideFlowService.accept(driver, ride)
            res[:success] ? TelegramService.send_message(chat_id: cq_from, text: "✅ Çağrı ##{ride.id} SİZDE! Yolcu bekliyor.\n#{res.dig(:ride, :destination) || ''}") : TelegramService.send_message(chat_id: cq_from, text: "⚠️ #{res[:error]}")
          else
            RideFlowService.reject_offer(driver, ride)
            TelegramService.send_message(chat_id: cq_from, text: "👍 Yanıt kaydedildi; çağrı başka şoföre sunuldu.")
          end
        end
      end
      return render json: { ok: true }
    end

    msg = params["message"] || params["edited_message"]

    if msg
      from = msg["from"] || {}
      chat_id = msg.dig("chat", "id") || from["id"]
      name = [from["first_name"], from["last_name"]].compact.join(" ").presence
      loc = msg["location"]
      contact = msg["contact"]

      # Numara paylaşımı (Şoför Girişi butonu): telefonu şoför kaydıyla eşleştir
      if contact && contact["phone_number"].present?
        driver = DriverInboundService.find_by_phone(contact["phone_number"])
        if driver
          driver.update!(telegram_id: chat_id.to_s)
          TelegramService.send_miniapp(
            chat_id: chat_id,
            text: "🚖 Hoş geldiniz #{driver.name}! Paneliniz Telegram içinde açılır.",
            button_text: "🗺️ Şoför Panelini Aç"
          )
        else
          TelegramService.send_message(
            chat_id: chat_id,
            text: "⚠️ Bu numara kayıtlı değil. Kayıt için: 'kaydol Ad Soyad, telefonunuz, plakanız' yazın."
          )
        end
        return render json: { ok: true, handled_by: "contact" }
      end

      # Şoför akışı: bu sohbet bir şoföre bağlıysa komutlar DriverInboundService'e gider;
      # bağlı değilse / "şoför ..." eşleştirme komutuysa yine şoför servisi devreye girer.
      driver_result = DriverInboundService.process(
        chat_id: chat_id,
        text: msg["text"],
        location: loc
      )

      if driver_result != :not_driver
        return render json: { ok: true, handled_by: "driver_inbound" }
      end

      # Yolcu akışı
      if msg["text"].to_s.match?(/\A\s*(\/start|\/basla|başla)\s*\z/i)
        TelegramService.send_miniapp(
          chat_id: chat_id,
          text: "🚕 *Gadis Taxi*'ye hoş geldiniz!\n\nBu panel Telegram içinde açılır:\n• 🚕 Şimdi Taksi İste → konum paylaşırsınız, en yakın taksi gelir\n• 📅 Randevu oluşturun\n• 🗺️ Haritadaki taksileri görün, şoföre yazın\n• 🚨 Şikayetleriniz AI ile değerlendirilir",
          button_text: "🚕 Uygulamayı Aç"
        )
      elsif msg["text"].to_s.match?(/\A\s*(\/?app|uygulama|menü|menu|harita)\s*\z/i)
        TelegramService.send_miniapp(
          chat_id: chat_id,
          text: "🚕 Gadis Taxi Mini App: taksi isteyin, randevu oluşturun, haritadaki taksileri görün ve doğrudan iletişim kurun.",
          button_text: "🚕 Uygulamayı Aç"
        )
      elsif loc
        MessageInboundService.process(
          sender_key: "tg_#{chat_id}",
          name: name,
          lat: loc["latitude"].to_f,
          lng: loc["longitude"].to_f,
          channel: "telegram",
          telegram_id: chat_id
        )
      elsif msg["text"].present?
        # Kullanıcıya bekleme hissi vermemek için anında 'yazıyor...' (typing) aksiyonu gönder
        TelegramService.send_chat_action(chat_id: chat_id, action: "typing")

        # Rol-farkındalıklı GERÇEK AI akışı: her metin Gemini ile anlaşılıp
        # taksi çağırma / randevu / şikayet / sohbet / bilgiye dönüşür.
        passenger = MessageInboundService.find_passenger(
          sender_key: "tg_#{chat_id}",
          name: name,
          channel: "telegram",
          telegram_id: chat_id
        )
        res = AiInboundService.process_passenger(
          passenger: passenger,
          chat_id: chat_id,
          text: msg["text"],
          channel: "telegram"
        )
        return render json: { ok: true, handled_by: "ai_inbound", result: (res.is_a?(Hash) ? res.slice(:success, :action) : res) }
      else
        TelegramService.send_message(chat_id: chat_id, text: "Konum gönderin veya 'Yarın saat 15:00 Ataşehir randevu' yazın.")
      end
    end
    render json: { ok: true }, status: :ok
  rescue StandardError => e
    Rails.logger.error "Telegram Webhook Error: #{e.message}"
    render json: { error: e.message }, status: :internal_server_error
  end

  private

  def handle_whatsapp(message)
    sender_phone = message["from"]
    case message["type"]
    when "location"
      loc = message["location"]
      MessageInboundService.process(
        sender_key: sender_phone,
        lat: loc["latitude"].to_f,
        lng: loc["longitude"].to_f,
        channel: "whatsapp"
      )
    when "text"
      MessageInboundService.process(
        sender_key: sender_phone,
        text: message.dig("text", "body").to_s.strip,
        channel: "whatsapp"
      )
    else
      WhatsappService.send_message(
        to: sender_phone,
        text: "Konum paylaşın veya 'Yarın saat 15:00 Ataşehir randevu' yazın."
      )
    end
  end
end
