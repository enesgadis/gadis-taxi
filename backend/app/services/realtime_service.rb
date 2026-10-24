# Gerçek zamanlı (WebSocket) yayın katmanı.
# TrackingChannel üzerinden "room_<name>" odalarına JSON push eder.
class RealtimeService
  # Tüm canlı haritalara (kokpit, radar) şoför telemetrisi yayınla
  def self.broadcast_driver(driver)
    ActionCable.server.broadcast(
      "room_locations",
      {
        type: "driver_location",
        driver: driver_payload(driver)
      }
    )
  rescue StandardError => e
    Rails.logger.error "RealtimeService.broadcast_driver: #{e.message}"
  end

  # "room_ride_<id>" abonelerine (takip ekranı) yolculuk anlık durumu yayınla
  def self.broadcast_ride(ride)
    payload = {
      type: "ride_update",
      ride: ride_payload(ride),
      driver: ride.driver ? driver_payload(ride.driver) : nil
    }
    ActionCable.server.broadcast("room_ride_#{ride.id}", payload)
    ActionCable.server.broadcast(
      "room_locations",
      { type: "ride_update", ride_id: ride.id, status: ride.status, ride: ride_payload(ride) }
    )
  rescue StandardError => e
    Rails.logger.error "RealtimeService.broadcast_ride: #{e.message}"
  end

  # Tracking ekranının /tracking/ride/:id cevabıyla birebir aynı şema
  def self.ride_payload(ride)
    {
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
    }
  end

  def self.driver_payload(driver)
    {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      plate: driver.plate,
      latitude: driver.latitude,
      longitude: driver.longitude,
      status: driver.status
    }
  end
end
