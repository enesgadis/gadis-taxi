class DispatchService
  OFFER_TIMEOUT = 45 # sn — şoför yanıt penceresi
  MAX_OFFERS = 3     # en fazla kaç şoföre sunulur

  def self.assign_nearest_driver(pickup_lat:, pickup_lng:, passenger:, dropoff_address: nil, pickup_address: nil, ride_type: "instant", scheduled_at: nil, channel: nil, exclude_driver_id: nil, service: nil)
    svc = service.presence || "taxi"
    icon = svc == "courier" ? "📦" : (svc == "transfer" ? "🛬" : "🚕")
    hud  = svc == "courier" ? "Kurye" : (svc == "transfer" ? "Transfer" : "Taksi")
    ch = channel.presence || passenger.channel.presence || "whatsapp"
    matches = Driver.nearest_to(pickup_lat, pickup_lng, 35.0)
    matches = matches.reject { |m| m[:driver].id == exclude_driver_id } if exclude_driver_id
    frontend = ENV.fetch("FRONTEND_URL", "http://localhost:3000")

    ride = Ride.create!(
      passenger: passenger,
      pickup_latitude: pickup_lat,
      pickup_longitude: pickup_lng,
      pickup_address: pickup_address,
      dropoff_address: dropoff_address,
      status: "pending",
      ride_type: ride_type,
      scheduled_at: scheduled_at,
      channel: ch
    )

    RealtimeService.broadcast_ride(ride)

    if matches.empty?
      NotifyService.passenger(passenger, "#{icon} Yakınınızda müsait #{hud.downcase} yok. Talebiniz kuyrukta (##{ride.id}).")
      return { success: false, reason: :no_drivers_available, ride: ride }
    end

    # AI-native dağıtım: şoförE SORULUR. 45 sn yanıt yoksa sıradaki adaya otomatik sunulur.
    NotifyService.passenger(
      passenger,
      "#{icon} Talebiniz alındı (##{ride.id}). En yakınlardaki #{hud.downcase}lere teklif ediliyor — onay gelir gelmez şoför bilgisi ve canlı takip linki paylaşılacak."
    )
    start_offer_loop(ride, service: svc)

    { success: true, pending_offer: true, ride: ride }
  end

  # Çağrıyı sırayla yakın şoförlere sunar: yanıt ↔️ 45 sn → sıradaki.
  def self.start_offer_loop(ride, exclude_driver_id: nil, service: "taxi")
    icon = service == "courier" ? "📦" : (service == "transfer" ? "🛬" : "🚕")
    hud  = service == "courier" ? "Kurye" : (service == "transfer" ? "Transfer" : "Taksi")
    Thread.new do
      begin
        MAX_OFFERS.times do
          rt = ride.reload
          break unless rt.status == "pending"
          matches = Driver.nearest_to(rt.pickup_latitude, rt.pickup_longitude, 35.0)
                         .reject { |m| [exclude_driver_id, rt.driver_id].compact.include?(m[:driver].id) }
                         .reject { |m| m[:driver].status == "busy" }
          if matches.empty?
            NotifyService.passenger(rt.passenger, "⚠️ Şu an ulaşılabilir #{hud.downcase} kalmadı. Talebiniz kuyrukta (##{rt.id}) — ilk müsait gelişte atanacak.")
            break
          end
          d = matches.first[:driver]
          dist = matches.first[:distance_km]
          eta = [(dist * 2.0).round + 3, 3].max
          rt.update!(driver_id: d.id, status: "offered", distance_km: dist, eta_minutes: eta)
          RealtimeService.broadcast_driver(d)

          place = rt.pickup_address.presence || "(#{rt.pickup_latitude.round(4)}, #{rt.pickup_longitude.round(4)})"
          q = "#{icon} YENİ ÇAĞRI (#{OFFER_TIMEOUT} sn içinde yanıtla!)\n#{rt.passenger.name}: #{rt.passenger.phone}\nAlış: #{place}\nHedef: #{(rt.dropoff_address.presence || '-').to_s}\n#{dist} km / #{eta} dk"
          telegram_ok = d.telegram_id.present?
          sent = if telegram_ok
            TelegramService.send_with_buttons(
              chat_id: d.telegram_id,
              text: q,
              buttons: [[{ text: "✅ AL", callback_data: "kabul_#{rt.id}" }, { text: "❌ ALAMAM", callback_data: "ret_#{rt.id}" }]]
            )
          else
            { "ok" => false }
          end
          unless telegram_ok && sent.is_a?(Hash) && sent["ok"] == true
            NotifyService.driver(d, "#{q}\n\nKabul için: 'kabul #{rt.id}' | Alamam: 'iptal ret'")
          end

          sleep OFFER_TIMEOUT
          rt = ride.reload
          if rt.status == "offered" && rt.driver_id == d.id
            # Yanıt yok — AI adayı düşürür, sıradakine geçer
            rt.update!(driver_id: nil, status: "pending")
            NotifyService.driver(d, "⌛ Yanıt gelmedi; çağrı ##{rt.id} başka şoföre verildi.")
            NotifyService.passenger(rt.passenger, "⌛ #{d.name} yanıt vermedi — sıradaki #{hud.downcase}ye otomatik geçiliyor (##{rt.id}).")
            exclude_driver_id = d.id
          else
            break # kabul/red geldi — döngü işi bırakır
          end
        end
      rescue StandardError => e
        Rails.logger.error "[OFFER LOOP] #{e.message}"
      end
    end
  end

  # Red sonra: çağrı kuyruğa döndüğünde döngüyü yeniden başlatır
  def self.continue_offense(ride, exclude_driver_id: nil)
    start_offer_loop(ride, exclude_driver_id: exclude_driver_id, service: ride.ride_type == "instant" ? "taxi" : "taxi")
  end
end
