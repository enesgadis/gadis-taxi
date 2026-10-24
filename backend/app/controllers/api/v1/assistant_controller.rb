# POST /api/v1/assistant/chat - AI-native asistan uç noktası
class Api::V1::AssistantController < ApplicationController
  def chat
    profile = {}
    if params[:role] == "driver"
      profile = Driver.find_by(id: params[:profile_id])&.as_json(only: [:name, :phone, :plate, :latitude, :longitude]) || {}
    else
      profile = Passenger.find_by(id: params[:profile_id])&.as_json(only: [:name, :phone, :last_latitude, :last_longitude]) || {}
    end
    profile = profile.symbolize_keys

    result = AssistantService.parse(params[:text].to_s, profile: profile)
    render json: {
      reply: result[:reply],
      ai: result[:ai],
      intent: result[:intent],
      ride_type: result[:ride_type],
      address: result[:address],
      scheduled_at: result[:scheduled_at]
    }
  end

  # POST /api/v1/assistant/complaint - AI şikayet analizi + kayıt
  def complaint
    role = params[:role] == "driver" ? "driver" : "passenger"
    profile =
      if role == "driver"
        Driver.find_by(id: params[:profile_id])
      else
        Passenger.find_by(id: params[:profile_id])
      end
    return render json: { error: "Profil bulunamadı" }, status: :not_found unless profile

    text = params[:text].to_s.strip
    return render json: { error: "Şikayet metni gerekli" }, status: :unprocessable_entity if text.blank?

    context = { "recent_ride_id" => params[:ride_id] }
    result = AssistantService.analyze_complaint(text: text, profile: profile, context: context)

    complaint = Complaint.create!(
      passenger: role == "passenger" ? profile : nil,
      driver_id: params[:driver_id].presence,
      ride_id: params[:ride_id].presence,
      raw_text: text,
      category: result[:category].presence || "other",
      severity: (result[:severity].presence || 1).to_i.clamp(1, 5),
      ai_summary: result[:summary],
      ai_reply: result[:reply],
      suggested_action: result[:suggested_action],
      channel: role == "passenger" ? "miniapp_passenger" : "miniapp_webhook"
    )

    render json: {
      saved: true,
      id: complaint.id,
      reply: complaint.ai_reply,
      category: complaint.category,
      severity: complaint.severity,
      ai: ENV["GEMINI_API_KEY"].present? || ENV["OPENAI_API_KEY"].present?
    }
  end
end
