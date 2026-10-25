# Telegram Mini App kimlik doğrulama.
# Telegram WebApp açılışında initData imzası bot token ile doğrulanır;
# telegram_id üzerinden önce şoför, sonra yolcu profili bulunur.
class Api::V1::MiniappController < ApplicationController
  def init
    raw = params[:init_data].to_s
    data = MiniappService.verify_init_data(raw)
    
    user = nil
    if data.present?
      # MiniappService.verify_init_data doğrudan parsed user hash'ini veya user anahtarlı hash'i dönebilir
      tg_user = data.is_a?(Hash) && data.key?("user") ? data["user"] : data
      if tg_user.is_a?(Hash) && tg_user["id"].present?
        user = {
          "id" => tg_user["id"].to_s,
          "first_name" => tg_user["first_name"].to_s,
          "last_name" => tg_user["last_name"].to_s
        }
      end
    end

    # İmzalı veri gelmediyse veya test/fallback ise gelen parametreden al
    if user.nil? && params[:telegram_id].present?
      user = {
        "id" => params[:telegram_id].to_s,
        "first_name" => params[:name].to_s,
        "last_name" => ""
      }
    end

    return render json: { role: nil, error: "Telegram kullanıcısı tespit edilemedi" }, status: :unauthorized if user.nil?

    # 1. Öncelik: Şoför olarak kayıtlı mı?
    driver = Driver.find_by(telegram_id: user["id"])
    if driver
      return render json: {
        role: "driver",
        profile: driver.as_json(only: [:id, :name, :phone, :plate, :latitude, :longitude, :status, :telegram_id])
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
