class AppointmentReminderJob < ApplicationJob
  queue_as :default

  def perform(ride_id)
    ride = Ride.includes(:passenger, :driver).find_by(id: ride_id)
    return unless ride
    return if ride.reminder_sent_at.present? || ride.status == "cancelled"

    passenger = ride.passenger
    driver = ride.driver
    appointment_time = ride.scheduled_at.strftime("%H:%M (%d.%m.%Y)")
    place = ride.pickup_address.presence || "(#{ride.pickup_latitude}, #{ride.pickup_longitude})"

    NotifyService.passenger(
      passenger,
      "⏰ Randevuya 1 saat kaldı\nSaat: #{appointment_time}\nŞoför: #{driver&.name || 'Atanıyor'} (#{driver&.plate || '-'})\nTel: #{driver&.phone || '-'}\nAlış: #{place}"
    )

    if driver
      NotifyService.driver(
        driver,
        "⏰ Görev: 1 saat sonra randevu\nSaat: #{appointment_time}\nYolcu: #{passenger.phone}\nAlış: #{place}"
      )
    end

    ride.update!(reminder_sent_at: Time.current)
  end
end
