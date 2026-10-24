class Api::V1::RidesController < ApplicationController
  def instant
    passenger = Passenger.find_by(id: params[:passenger_id])
    return render json: { error: "Giriş yapın" }, status: :unauthorized unless passenger

    lat = params[:latitude].to_f
    lng = params[:longitude].to_f
    return render json: { error: "Konum gerekli" }, status: :unprocessable_entity if lat == 0.0 || lng == 0.0

    passenger.update!(last_latitude: lat, last_longitude: lng)
    place = LocationService.resolve(params[:pickup_address].to_s)
    result = DispatchService.assign_nearest_driver(
      pickup_lat: lat,
      pickup_lng: lng,
      passenger: passenger,
      pickup_address: params[:pickup_address].presence || place&.dig(:name) || "Uygulama konumu",
      dropoff_address: params[:dropoff_address],
      ride_type: "instant",
      channel: passenger.channel,
      service: params[:service]
    )
    render json: result
  end

  def schedule
    passenger = Passenger.find_by(id: params[:passenger_id])
    return render json: { error: "Giriş yapın" }, status: :unauthorized unless passenger

    text = params[:text].presence || "Yarın saat 15:00 Ataşehir randevu"
    lat = params[:latitude].present? ? params[:latitude].to_f : passenger.last_latitude
    lng = params[:longitude].present? ? params[:longitude].to_f : passenger.last_longitude
    if lat && lng
      passenger.update!(last_latitude: lat, last_longitude: lng)
    end
    result = AppointmentSchedulerService.schedule_ride(
      passenger: passenger,
      raw_text: text,
      pickup_lat: lat,
      pickup_lng: lng,
      pickup_address: params[:pickup_address],
      dropoff_address: params[:dropoff_address],
      channel: passenger.channel
    )
    render json: result
  end
end
