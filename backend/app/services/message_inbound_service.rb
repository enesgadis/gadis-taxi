class MessageInboundService
  def self.process(sender_key:, name: nil, text: nil, lat: nil, lng: nil, channel: "whatsapp", telegram_id: nil)
    passenger = find_passenger(sender_key: sender_key, name: name, channel: channel, telegram_id: telegram_id)

    if lat && lng
      passenger.update!(last_latitude: lat, last_longitude: lng)
      return DispatchService.assign_nearest_driver(
        pickup_lat: lat,
        pickup_lng: lng,
        passenger: passenger,
        pickup_address: "Canlı konum",
        ride_type: "instant",
        channel: channel
      )
    end

    raw = text.to_s.strip
    lower = raw.downcase

    if nearby_intent?(lower)
      return nearby_reply(passenger, channel)
    end

    rag = RagDeterministicService.process_query(user_message: raw, passenger_phone: passenger.phone)
    if rag["intent"] == "schedule_ride"
      parsed_iso = rag["scheduled_datetime_iso"]
      explicit_time = parsed_iso ? Time.zone.parse(parsed_iso) : nil
      place = LocationService.resolve(raw)
      lat_use = passenger.last_latitude || place&.dig(:lat) || 41.0370
      lng_use = passenger.last_longitude || place&.dig(:lng) || 28.9850
      addr = place&.dig(:name) || rag["dropoff_address"]
      return AppointmentSchedulerService.schedule_ride(
        passenger: passenger,
        raw_text: raw,
        pickup_lat: lat_use,
        pickup_lng: lng_use,
        dropoff_address: rag["dropoff_address"],
        pickup_address: addr,
        explicit_time: explicit_time,
        channel: channel
      )
    end

    NotifyService.passenger(passenger, rag["answer_text"])
    { success: true, action: "rag", rag: rag }
  end

  def self.find_passenger(sender_key:, name:, channel:, telegram_id:)
    if channel == "telegram"
      p = Passenger.find_by(telegram_id: telegram_id.to_s) if telegram_id.present?
      p ||= Passenger.find_by(phone: sender_key)
      p ||= Passenger.create!(
        phone: sender_key,
        telegram_id: telegram_id.to_s,
        name: name.presence || "Yolcu #{sender_key.to_s.last(4)}",
        channel: "telegram"
      )
      p.update!(telegram_id: telegram_id.to_s, channel: "telegram") if p.telegram_id.blank?
      p
    else
      Passenger.find_or_create_by!(phone: sender_key) do |rec|
        rec.name = name.presence || "Yolcu #{sender_key.to_s.last(4)}"
        rec.channel = "whatsapp"
      end
    end
  end

  def self.nearby_intent?(msg)
    msg.include?("yakındaki") || msg.include?("yakindaki") || msg.include?("taksileri gör") ||
      msg.include?("bos taksi") || msg.include?("boş taksi") || msg.include?("yakin") || msg.include?("yakın")
  end

  def self.nearby_reply(passenger, channel)
    lat = passenger.last_latitude || 41.0370
    lng = passenger.last_longitude || 28.9850
    unless passenger.last_latitude
      NotifyService.passenger(passenger, "📍 Yakındaki taksiler için konumunuzu paylaşın veya semt yazın (ör. Ataşehir).")
      return { success: false, reason: :need_location }
    end

    matches = Driver.nearest_to(lat, lng, 15.0)
    list = matches.first(5).map do |m|
      d = m[:driver]
      "🚕 #{d.name} (#{d.plate}) - #{m[:distance_km]} km (~#{[(m[:distance_km] * 2).round + 2, 2].max} dk)"
    end.join("\n")

    radar = "#{ENV.fetch('FRONTEND_URL', 'http://localhost:3000')}/nearby?lat=#{lat}&lng=#{lng}"
    NotifyService.passenger(
      passenger,
      "📍 *Yakınınızdaki müsait taksiler:*\n\n#{list.presence || 'Yakında boş taksi yok.'}\n\n🗺️ #{radar}\n\nTaksi için konum gönderin veya 'Yarın saat 15:00 Ataşehir randevu' yazın."
    )
    { success: true, action: "nearby", count: matches.size }
  end
end
