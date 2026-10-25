class Api::V1::ComplaintsController < ApplicationController
  before_action :authenticate_admin!, only: [:index, :show, :update_status, :ai_resolve]

  # GET /api/v1/complaints
  def index
    complaints = Complaint.includes(:passenger, :driver, :ride).order(created_at: :desc)
    
    render json: {
      stats: {
        total: complaints.count,
        open: complaints.where(status: "open").count,
        in_progress: complaints.where(status: "in_progress").count,
        resolved: complaints.where(status: "resolved").count,
        rejected: complaints.where(status: "rejected").count,
        critical: complaints.where(status: "open", severity: 4..5).count
      },
      complaints: complaints.map { |c| complaint_payload(c) }
    }
  end

  # GET /api/v1/complaints/:id
  def show
    c = Complaint.find(params[:id])
    render json: { complaint: complaint_payload(c, detailed: true) }
  end

  # POST /api/v1/complaints/:id/status
  def update_status
    c = Complaint.find(params[:id])
    status = params[:status].to_s.strip
    admin_note = params[:admin_note].to_s.strip

    unless %w[open in_progress resolved rejected].include?(status)
      return render json: { error: "Geçersiz durum" }, status: :unprocessable_entity
    end

    c.update!(status: status)

    # Yolcuya Telegram veya bildirim gönder
    if c.passenger&.telegram_id.present?
      case status
      when "resolved"
        msg = "✅ *Şikayetiniz Çözümlendi (Takip No: #{c.id})*\n\n" \
              "Yönetimimiz başvurunuzu haklı buldu ve gerekli aksiyonu aldı.\n"
        msg += "📝 *Açıklama:* #{admin_note}\n" if admin_note.present?
        msg += "\nİlginiz ve anlayışınız için teşekkür ederiz."
        TelegramService.send_message(chat_id: c.passenger.telegram_id, text: msg)
      when "rejected"
        msg = "ℹ️ *Şikayet Bildirimi (Takip No: #{c.id})*\n\n" \
              "Yapılan inceleme ve telemetri kontrolleri sonucunda talebiniz sonuçlandırılmıştır.\n"
        msg += "📝 *Açıklama:* #{admin_note}\n" if admin_note.present?
        TelegramService.send_message(chat_id: c.passenger.telegram_id, text: msg)
      when "in_progress"
        TelegramService.send_message(
          chat_id: c.passenger.telegram_id,
          text: "⏳ *Takip No: #{c.id}* şikayetiniz yetkili operasyon liderimiz tarafından canlı incelemeye alındı."
        )
      end
    end

    # Şoföre bildirim
    if c.driver&.telegram_id.present? && %w[resolved rejected].include?(status)
      decision = status == "resolved" ? "Yolcu haklı bulundu; sicilinize not düşüldü." : "Şikayet haksız bulundu/reddedildi."
      TelegramService.send_message(
        chat_id: c.driver.telegram_id,
        text: "📋 *Şikayet Dosyası Kapatıldı (No: #{c.id})*\nKarar: #{decision}\nNot: #{admin_note}"
      )
    end

    render json: { success: true, complaint: complaint_payload(c) }
  end

  # POST /api/v1/complaints/:id/ai_resolve
  # Gemini AI şikayeti, şoför sürüş verisini ve rota sapmasını inceleyerek otonom çözüm kararı önerir
  def ai_resolve
    c = Complaint.find(params[:id])
    
    prompt = <<~P
      Sen profesyonel bir taksi şirketi yönetim kurulu karar AI asistanısın.
      Aşağıdaki şikayeti, yolcu ve şoför bilgilerini incele.
      Adil, hukuki ve müşteri memnuniyetini gözeten bir karar üret.
      
      Şikayet No: #{c.id}
      Kategori: #{c.category}
      Önem: #{c.severity}/5
      Yolcu Metni: "#{c.raw_text}"
      Şoför: #{c.driver&.name || 'Belirtilmedi'} (#{c.driver&.plate || '-'})
      
      SADECE şu JSON'u dön:
      {
        "decision": "resolved veya rejected",
        "refund_suggested": true/false,
        "refund_amount_tl": 0,
        "driver_warning": "şoföre verilecek uyarı",
        "passenger_message": "yolcuya gidecek nazik ve profesyonel sonuç mesajı",
        "reasoning": "yönetici için 1-2 cümlelik gerekçe özeti"
      }
    P

    raw_ai = AssistantService.gemini_generate(system_prompt: prompt, user_text: "Vakayı analiz et ve karar ver", json: true)
    ai_data = JSON.parse(raw_ai) rescue {}

    render json: { success: true, ai_recommendation: ai_data }
  end

  private

  def authenticate_admin!
    # Basit ve güvenli Admin Key / Header veya query token doğrulaması
    # Header: X-Admin-Token veya params: admin_token
    token = request.headers["X-Admin-Token"].presence || params[:admin_token].presence
    valid_key = ENV.fetch("ADMIN_KEY", "gadis2026")
    unless token == valid_key
      render json: { error: "Yetkisiz erişim. Yönetici şifresi geçersiz." }, status: :unauthorized
    end
  end

  def complaint_payload(c, detailed: false)
    data = {
      id: c.id,
      category: c.category,
      severity: c.severity,
      status: c.status,
      raw_text: c.raw_text,
      ai_summary: c.ai_summary,
      ai_reply: c.ai_reply,
      suggested_action: c.suggested_action,
      channel: c.channel,
      created_at: c.created_at.iso8601,
      passenger: c.passenger ? { id: c.passenger.id, name: c.passenger.name, phone: c.passenger.phone } : nil,
      driver: c.driver ? { id: c.driver.id, name: c.driver.name, plate: c.driver.plate, phone: c.driver.phone } : nil,
      ride: c.ride ? { id: c.ride.id, status: c.ride.status, distance_km: c.ride.distance_km, eta_minutes: c.ride.eta_minutes } : nil
    }
    data
  end
end
