class Api::V1::TrackingController < ApplicationController
  # GET /api/v1/tracking/ride/:id - Passenger live tracking view
  def ride_status
    ride = Ride.includes(:passenger, :driver).find_by(id: params[:id])
    unless ride
      return render json: { error: "Sürüş bulunamadı" }, status: :not_found
    end

    render json: {
      bot_username: TelegramService.bot_username,
      ride: {
        id: ride.id,
        status: ride.status,
        ride_type: ride.ride_type,
        pickup_lat: ride.pickup_latitude,
        pickup_lng: ride.pickup_longitude,
        dropoff_address: ride.dropoff_address,
        distance_km: ride.distance_km,
        eta_minutes: ride.eta_minutes,
        scheduled_at: ride.scheduled_at&.iso8601,
        created_at: ride.created_at.iso8601
      },
      passenger: {
        name: ride.passenger.name,
        phone: ride.passenger.phone
      },
      driver: ride.driver ? {
        id: ride.driver.id,
        name: ride.driver.name,
        phone: ride.driver.phone,
        plate: ride.driver.plate,
        latitude: ride.driver.latitude,
        longitude: ride.driver.longitude,
        status: ride.driver.status
      } : nil
    }
  end

  # GET /api/v1/tracking/map - Ortak canlı harita
  # Şoförler: tüm aktif taksiler + taksi bekleyen müşteriler (dokun → iletişim)
  def map
    lat = params[:lat].present? ? params[:lat].to_f : 41.037
    lng = params[:lng].present? ? params[:lng].to_f : 28.985

    taxis = Driver.where.not(latitude: nil).where.not(longitude: nil)
                  .where(status: %w[available busy]).select(:id, :name, :plate, :phone, :latitude, :longitude, :status)

    pickups = Ride.where(status: %w[dispatched pending in_progress])
                  .where.not(pickup_latitude: nil)
                  .includes(:passenger).limit(50)

    render json: {
      center: { lat: lat, lng: lng },
      taxis: taxis.map do |d|
        {
          id: d.id, name: d.name, plate: d.plate, phone: d.phone, status: d.status,
          latitude: d.latitude, longitude: d.longitude,
          distance_km: Driver.calculate_distance(lat, lng, d.latitude, d.longitude).round(1)
        }
      end,
      pickups: pickups.map do |r|
        {
          ride_id: r.id, passenger_name: r.passenger.name, passenger_phone: r.passenger.phone,
          pickup_lat: r.pickup_latitude, pickup_lng: r.pickup_longitude,
          dropoff_address: r.dropoff_address, status: r.status, ride_type: r.ride_type,
          scheduled_at: r.scheduled_at&.iso8601
        }
      end
    }
  end

  # GET /api/v1/tracking/nearby_taxis?lat=41.037&lng=28.985 - Nearby taxis for passenger
  def nearby_taxis
    lat = params[:lat].to_f
    lng = params[:lng].to_f

    matches = Driver.nearest_to(lat, lng, 15.0)

    render json: {
      center: { lat: lat, lng: lng },
      count: matches.size,
      taxis: matches.map do |m|
        d = m[:driver]
        {
          id: d.id,
          name: d.name,
          plate: d.plate,
          phone: d.phone,
          latitude: d.latitude,
          longitude: d.longitude,
          distance_km: m[:distance_km],
          eta_minutes: [(m[:distance_km] * 2.0).round + 2, 2].max
        }
      end
    }
  end

  # GET /api/v1/tracking/driver_portal?driver_id=1 - Driver panel data
  def driver_portal
    driver = Driver.find_by(id: params[:driver_id]) || Driver.first

    # Pending customer requests waiting for a driver or assigned to this driver
    active_requests = Ride.includes(:passenger)
                          .where(status: %w[pending dispatched confirmed in_progress])
                          .where("driver_id = ? OR driver_id IS NULL", driver.id)
                          .order(created_at: :desc)

    render json: {
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        plate: driver.plate,
        latitude: driver.latitude,
        longitude: driver.longitude,
        status: driver.status
      },
      requests: active_requests.map do |r|
        dist = Driver.calculate_distance(driver.latitude, driver.longitude, r.pickup_latitude, r.pickup_longitude)
        {
          id: r.id,
          passenger_name: r.passenger.name,
          passenger_phone: r.passenger.phone,
          pickup_lat: r.pickup_latitude,
          pickup_lng: r.pickup_longitude,
          dropoff_address: r.dropoff_address,
          status: r.status,
          ride_type: r.ride_type,
          scheduled_at: r.scheduled_at&.iso8601,
          distance_to_pickup_km: dist,
          is_assigned_to_me: r.driver_id == driver.id
        }
      end
    }
  end

  # POST /api/v1/tracking/update_driver_location - Live driver GPS telemetry
  def update_driver_location
    driver = Driver.find_by(id: params[:driver_id])
    unless driver
      return render json: { error: "Şoför bulunamadı" }, status: :not_found
    end

    result = RideFlowService.update_location(driver, params[:latitude].to_f, params[:longitude].to_f, status: params[:status])
    return render json: { error: result[:error] }, status: :unprocessable_entity unless result[:success]

    active_ride = result[:active_ride]
    render json: {
      success: true,
      driver: {
        id: driver.id,
        name: driver.name,
        plate: driver.plate,
        latitude: driver.latitude,
        longitude: driver.longitude,
        status: driver.status
      },
      active_ride_updated: active_ride ? { id: active_ride.id, distance_km: active_ride.distance_km, eta_minutes: active_ride.eta_minutes } : nil
    }
  end

  # POST /api/v1/tracking/accept_ride - Driver claims a pending ride
  def accept_ride
    driver = Driver.find_by(id: params[:driver_id])
    ride = Ride.find_by(id: params[:ride_id])

    unless driver && ride
      return render json: { error: "Geçersiz şoför veya talep" }, status: :unprocessable_entity
    end

    result = RideFlowService.accept(driver, ride)
    unless result[:success]
      return render json: { error: result[:error] }, status: :unprocessable_entity
    end

    render json: { success: true, ride: result[:ride], tracking_url: result[:tracking_url] }
  end

  # POST /api/v1/tracking/update_ride_status
  # Şoför yolculuk durumunu ilerletir: start (yolcu alındı), complete (tur tamamlandı), cancel
  def update_ride_status
    driver = Driver.find_by(id: params[:driver_id])
    ride = Ride.find_by(id: params[:ride_id])

    unless driver && ride
      return render json: { error: "Geçersiz şoför veya talep" }, status: :unprocessable_entity
    end

    action = params[:action_name].to_s
    result = RideFlowService.change_status(driver, ride, action)
    unless result[:success]
      return render json: { error: result[:error] }, status: :unprocessable_entity
    end

    render json: { success: true, ride_id: ride.id, status: result[:status], driver_status: result[:driver_status] }
  end
end
