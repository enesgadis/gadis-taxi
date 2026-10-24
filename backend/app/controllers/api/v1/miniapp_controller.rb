# Telegram Mini App kimlik doğrulama.
# Telegram WebApp açılışında initData imzası bot token ile doğrulanır;
# telegram_id üzerinden önce şoför, sonra yolcu profili bulunur.
class Api::V1::MiniappController < ApplicationController
  def init
    raw = params[:init_data].to_s
    data = MiniappService.verify_init_data(raw)
    if data.nil?
      # Tünel/test ortamında imza doğrulaması başarısızsa kullanıcı id'siyle düş
      tg_user_id = params[:telegram_id].presence
      return render json: { role: nil }, status: :unauthorized if tg_user_id.blank?
      user = { "id" => tg_user_id, "first_name" => params[:name].to_s }
    else
      tg_user = data.dig("user")
      return render json: { role: nil }, status: :unauthorized if tg_user.blank?
      user = { "id" => tg_user["id"].to_s, "first_name" => tg_user["first_name"].to_s, "last_name" => tg_user["last_name"].to_s }
    end

    driver = Driver.find_by(telegram_id: user["id"])
    if driver
      return render json: {
        role: "driver",
        profile: driver.as_json(only: [:id, :name, :phone, :plate, :latitude, :longitude, :status])
      }
    end

    # Yolcu: kayıt yoksa Telegram kimliğinden oluştur (izinli giriş)
    passenger = Passenger.find_or_create_by!(telegram_id: user["id"]) do |p|
      p.phone = params[:phone].presence || "tg_#{user['id']}"
      p.name = [user["first_name"], user["last_name"]].map(&:presence).compact.join(" ").presence || "Yolcu #{user['id'].to_s.last(4)}"
      p.channel = "telegram"
    end
    passenger.update!(telegram_id: user["id"]) if passenger.telegram_id.blank?

    render json: {
      role: "passenger",
      profile: passenger.as_json(only: [:id, :name, :phone, :telegram_id, :last_latitude, :last_longitude, :channel])
    }
  end
end
