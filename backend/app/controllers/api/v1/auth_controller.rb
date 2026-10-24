class Api::V1::AuthController < ApplicationController
  def passenger
    phone = params[:phone].to_s.strip
    return render json: { error: "Telefon gerekli" }, status: :unprocessable_entity if phone.blank?

    passenger = Passenger.find_or_create_by!(phone: phone) do |p|
      p.name = params[:name].presence || "Yolcu #{phone.last(4)}"
      p.channel = params[:channel].presence || "whatsapp"
    end
    passenger.name = params[:name] if params[:name].present?
    passenger.telegram_id = params[:telegram_id] if params[:telegram_id].present?
    passenger.channel = params[:channel] if params[:channel].present?
    if params[:latitude].present? && params[:longitude].present?
      passenger.last_latitude = params[:latitude].to_f
      passenger.last_longitude = params[:longitude].to_f
    end
    passenger.save!

    nearby = []
    if passenger.last_latitude && passenger.last_longitude
      nearby = Driver.nearest_to(passenger.last_latitude, passenger.last_longitude, 15.0).map do |m|
        d = m[:driver]
        { id: d.id, name: d.name, plate: d.plate, phone: d.phone, latitude: d.latitude, longitude: d.longitude, distance_km: m[:distance_km], eta_minutes: [(m[:distance_km] * 2.0).round + 2, 2].max }
      end
    end

    render json: {
      passenger: passenger.as_json(only: [:id, :name, :phone, :telegram_id, :last_latitude, :last_longitude, :channel]),
      nearby: nearby
    }
  end

  # POST /api/v1/auth/driver/register
  # Taksici kaydı: ad, telefon, plaka zorunlu. Aynı cephe tekrar kaydolursa mevcut kaydı günceller.
  def register
    name = params[:name].to_s.strip
    phone = params[:phone].to_s.strip
    plate = params[:plate].to_s.strip

    if name.blank? || phone.blank? || plate.blank?
      return render json: { error: "Ad, telefon ve plaka zorunludur" }, status: :unprocessable_entity
    end

    if Driver.exists?(plate: plate) && !Driver.find_by(plate: plate)&.phone&.eql?(phone)
      return render json: { error: "Bu plakaya ait başka bir kayıt var" }, status: :conflict
    end

    driver = Driver.find_or_initialize_by(phone: phone)
    driver.name = name
    driver.plate = plate
    driver.status = "available"
    driver.latitude = params[:latitude].to_f if params[:latitude].present?
    driver.longitude = params[:longitude].to_f if params[:longitude].present?
    driver.latitude = 41.0082 if driver.latitude.blank? # İstanbul default
    driver.longitude = 28.9784 if driver.longitude.blank?
    driver.save!

    render json: {
      driver: driver.as_json(only: [:id, :name, :phone, :plate, :latitude, :longitude, :status]),
      message: "Kayıt başarılı. Artık çağrı alabilirsiniz."
    }
  end

  def driver
    driver = Driver.find_by(phone: params[:phone]) || Driver.find_by(plate: params[:plate]) || Driver.find_by(id: params[:driver_id])
    unless driver
      return render json: { error: "Şoför bulunamadı" }, status: :not_found
    end
    driver.update!(telegram_id: params[:telegram_id]) if params[:telegram_id].present?
    render json: { driver: driver.as_json(only: [:id, :name, :phone, :plate, :latitude, :longitude, :status, :telegram_id]) }
  end

  def drivers
    render json: { drivers: Driver.all.order(:id).as_json(only: [:id, :name, :phone, :plate, :status]) }
  end
end
