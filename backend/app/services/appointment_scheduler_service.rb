class AppointmentSchedulerService
  def self.schedule_ride(passenger:, raw_text:, pickup_lat: nil, pickup_lng: nil, dropoff_address: nil, pickup_address: nil, explicit_time: nil, channel: nil)
    target_time = explicit_time || parse_natural_time(raw_text)
    unless target_time && target_time > Time.current
      msg = "Randevu saati anlaşılamadı. Örnek: Yarın saat 15:00 Ataşehir randevu"
      NotifyService.passenger(passenger, msg)
      return { success: false, error: msg }
    end

    place = LocationService.resolve(raw_text)
    lat = pickup_lat || passenger.last_latitude || place&.dig(:lat) || 41.0370
    lng = pickup_lng || passenger.last_longitude || place&.dig(:lng) || 28.9850
    addr = pickup_address.presence || place&.dig(:name)

    result = DispatchService.assign_nearest_driver(
      pickup_lat: lat,
      pickup_lng: lng,
      passenger: passenger,
      dropoff_address: dropoff_address,
      pickup_address: addr,
      ride_type: "scheduled",
      scheduled_at: target_time,
      channel: channel
    )
    ride = result[:ride]
    reminder_time = target_time - 1.hour
    if reminder_time > Time.current
      AppointmentReminderJob.set(wait_until: reminder_time).perform_later(ride.id)
    else
      AppointmentReminderJob.perform_later(ride.id)
    end
    { success: true, ride: ride, scheduled_at: target_time, reminder_at: reminder_time, driver: ride.driver }
  end

  def self.parse_natural_time(text)
    str = text.to_s.downcase
    base_date = Time.current
    if str.include?("yarın") || str.include?("yarin")
      base_date = 1.day.from_now
    elsif str.include?("öbür gün") || str.include?("obur gun")
      base_date = 2.days.from_now
    end

    if str =~ /(\d{1,2})[:.](\d{2})/
      hour = $1.to_i
      min = $2.to_i
      hour += 12 if hour > 0 && hour <= 7
      return base_date.change(hour: hour, min: min, sec: 0)
    elsif str =~ /saat\s+(\d{1,2})/
      hour = $1.to_i
      hour += 12 if hour > 0 && hour <= 7
      return base_date.change(hour: hour, min: 0, sec: 0)
    end

    return 1.day.from_now.change(hour: 15, min: 0, sec: 0) if str.include?("yarın") || str.include?("yarin")
    nil
  end
end
