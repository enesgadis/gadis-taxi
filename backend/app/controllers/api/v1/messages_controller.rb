# POST /api/v1/messages/relay
# Mini App içinden "Yaz": mesajı KARŞI tarafın hangi kanaldan girdiyse oradan iletir.
# Telegramdayse Telegram bottan, WhatsApp'taysa WhatsApp Cloud API'den gider.
# Böylece iki taraf, uygulamadan çıkmadan kendi kanalında sohbeti sürdürür.
class Api::V1::MessagesController < ApplicationController
  def relay
    sender_role = params[:sender_role] == "driver" ? "driver" : "passenger"
    ride = params[:ride_id].present? ? Ride.find_by(id: params[:ride_id]) : nil
    text = params[:text].to_s.strip
    return render json: { error: "Mesaj boş olamaz" }, status: :unprocessable_entity if text.blank?

    target, target_channel =
      if sender_role == "driver"
        p = ride ? ride.passenger : Passenger.find_by(telegram_id: params[:target_telegram_id])
        [p, p&.channel]
      else
        d = ride ? ride.driver : Driver.find_by(id: params[:target_driver_id])
        [d, d&.telegram_id.present? ? "telegram" : nil]
      end

    return render json: { error: "Karşı taraf bulunamadı" }, status: :not_found unless target

    sender_label =
      if sender_role == "driver"
        d = Driver.find_by(id: params[:sender_id])
        "🚖 #{d&.name.presence || 'Şoför'} (#{d&.plate})"
      else
        p = Passenger.find_by(id: params[:sender_id])
        "👤 #{p&.name.presence || 'Yolcu'}"
      end

    is_first_message = params[:is_first_message] == true || params[:is_first_message] == "true"
    greeting = is_first_message ? "Merhaba! " : ""
    sent = send_channel_message(target, target_channel, "#{sender_label}\n\n#{greeting}#{text}")

    if sent
      render json: { success: true, channel: target_channel.to_s, message: "Mesaj iletildi" }
    else
      render json: { error: "Karşı tarafın #{target_channel.presence || 'bilinen'} kanalı yok. Telefonla aramayı deneyin." }, status: :unprocessable_entity
    end
  end

  private

  def send_channel_message(target, channel, text)
    case channel.to_s
    when "telegram"
      chat_id = target.respond_to?(:telegram_id) ? target.telegram_id.to_s : nil
      return false if chat_id.blank?
      chat_id = chat_id.sub(/\Atg_/, "") if chat_id.start_with?("tg_")
      res = TelegramService.send_message(chat_id: chat_id, text: text)
      res.is_a?(Hash) ? (res["ok"] == true || res[:ok] == true) : false
    when "whatsapp"
      to = target.respond_to?(:phone) ? target.phone : nil
      return false if to.blank?
      res = WhatsappService.send_message(to: to, text: text)
      res.is_a?(Hash) ? (res["ok"] == true || res[:ok] == true) : false
    else
      false
    end
  end
end
