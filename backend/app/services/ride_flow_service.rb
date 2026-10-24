# Yolculuk akış mantığı: hem web paneli (TrackingController) hem bot (DriverInboundService)
# bu tek servisi kullanır. Böylece kabul/durum geçişi iki kanalda birebir aynı davranır.
class RideFlowService
  # Şoför bekleyen (veya kendi bekleyen randevusunu) kabul eder
  def self.accept(driver, ride)
    return { success: false, error: "Bu talep zaten başka bir şoföre atandı" } unless ride.driver_id.nil? || ride.driver_id == driver.id
    return { success: false, error: "Talep artık kabul edilemez durumda (#{ride.status})" } unless %w[pending offered dispatched].include?(ride.status) || (ride.status == "confirmed" && ride.ride_type == "scheduled")
    dist = Driver.calculate_distance(driver.latitude, driver.longitude, ride.pickup_latitude, ride.pickup_longitude)
    eta = [(dist * 2.0).round + 2, 2].max

    driver.update!(status: "busy")
    ride.update!(driver: driver, status: "dispatched", distance_km: dist, eta_minutes: eta)

    tracking_url = "#{ENV.fetch('FRONTEND_URL', 'http://localhost:3000')}/track/#{ride.id}"
    NotifyService.passenger(
      ride.passenger,
      "🚖 Çağrı kabul edildi\nŞoför: #{driver.name}\nPlaka: #{driver.plate}\nTel: #{driver.phone}\nETA: #{eta} dk (#{dist} km)\n🗺️ #{tracking_url}"
    )

    RealtimeService.broadcast_driver(driver)
    RealtimeService.broadcast_ride(ride)

    { success: true, ride: ride, driver: driver, tracking_url: tracking_url, eta_minutes: eta }
  end

  # Şoför teklifi reddetti: çağrı boşa alınır, dispatch sıradaki adaya döner
  def self.reject_offer(driver, ride)
    return { success: false } unless ride.driver_id == driver.id && ride.status == "offered"
    ride.update!(driver_id: nil, status: "pending")
    NotifyService.passenger(ride.passenger, "ℹ️ #{driver.name} alamıyor — alternatif taksiye otomatik geçiliyor, bekleyin.")
    DispatchService.continue_offense(ride, exclude_driver_id: driver.id)
    { success: true }
  end

  # start (yolcu alındı) / complete / cancel
  def self.change_status(driver, ride, action)
    return { success: false, error: "Bu talep size atanmamış" } unless ride.driver_id == driver.id

    case action
    when "start"
      return { success: false, error: "Yolculuk zaten başlatılmış" } unless %w[dispatched confirmed].include?(ride.status)
      ride.update!(status: "in_progress")
      NotifyService.passenger(ride.passenger, "🚕 Yolculuğunuz başladı! Taksi yolda.")
    when "complete"
      return { success: false, error: "Yolculuk henüz başlamadı" } unless ride.status == "in_progress"
      ride.update!(status: "completed")
      driver.update!(status: "available")
      NotifyService.passenger(ride.passenger, "✅ Yolculuk tamamlandı. Bizi tercih ettiğiniz için teşekkürler!")
    when "cancel"
      return { success: false, error: "Tamamlanan yolculuk iptal edilemez" } if ride.status == "completed"
      ride.update!(status: "cancelled")
      driver.update!(status: "available") if ride.driver_id == driver.id
      NotifyService.passenger(ride.passenger, "❌ #{driver.name} bu çağrıyı iptal etti (##{ride.id}).")

      # Şoför "gelmem" dedi → boşuna beklemesin: otomatik yeni taksi ata.
      # Eski şoför dışlanır; en yakın diğer taksi hemen devreye girer.
      if ride.ride_type == "instant" && ride.pickup_latitude.present? && ride.pickup_longitude.present?
        retry_res = DispatchService.assign_nearest_driver(
          pickup_lat: ride.pickup_latitude,
          pickup_lng: ride.pickup_longitude,
          passenger: ride.passenger,
          dropoff_address: ride.dropoff_address,
          pickup_address: ride.pickup_address,
          ride_type: "instant",
          channel: ride.channel,
          exclude_driver_id: driver.id
        )
        if retry_res.is_a?(Hash) && retry_res[:success]
          nd = retry_res[:driver]
          NotifyService.passenger(
            ride.passenger,
            "✅ Panik yok — yeni taksiniz hemen devreye alındı!\nŞoför: #{nd.name}\nPlaka: #{nd.plate}\nTel: #{nd.phone}\nETA: #{retry_res[:eta_minutes]} dk\n🗺️ #{ENV.fetch('FRONTEND_URL', 'http://localhost:3000')}/track/#{retry_res[:ride].id}"
          )
          NotifyService.driver(driver, "✅ Çağrı ##{ride.id} iptal edildi ve yolcuya alternatif taksi atandı.")
        else
          NotifyService.passenger(ride.passenger, "⚠️ Şu an alternatif taksi bulunamadı. Talebiniz kuyrukta — ilk müsait taksi size atanacak.")
        end
      else
        NotifyService.passenger(ride.passenger, "Randevunuz için yeni şoför 1 saat önceden tekrar planlanacaktır. Dert etmeyin!")
      end
    else
      return { success: false, error: "Bilinmeyen aksiyon: #{action}" }
    end

    RealtimeService.broadcast_driver(driver)
    RealtimeService.broadcast_ride(ride)

    { success: true, status: ride.status, driver_status: driver.status }
  end

  # Şoförün GPS telemetrisi (web paneli ve bot paylaşımı ortak)
  def self.update_location(driver, lat, lng, status: nil)
    return { success: false, error: "Geçersiz koordinat" } if lat == 0.0 && lng == 0.0

    driver.latitude = lat unless lat == 0.0
    driver.longitude = lng unless lng == 0.0
    driver.status = status if status.present?
    driver.save!

    active_ride = driver.rides.where(status: %w[dispatched in_progress]).order(created_at: :desc).first
    if active_ride&.pickup_latitude && active_ride&.pickup_longitude
      dist = Driver.calculate_distance(driver.latitude, driver.longitude, active_ride.pickup_latitude, active_ride.pickup_longitude)
      eta = [(dist * 2.0).round + 2, 2].max
      active_ride.update!(distance_km: dist, eta_minutes: eta)
    end

    RealtimeService.broadcast_driver(driver)
    RealtimeService.broadcast_ride(active_ride) if active_ride

    { success: true, driver: driver, active_ride: active_ride }
  end
end
