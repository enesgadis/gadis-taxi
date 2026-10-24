class Api::V1::CockpitController < ApplicationController
  def status
    drivers = Driver.all.order(id: :asc)
    rides = Ride.includes(:passenger, :driver).order(created_at: :desc).limit(20)
    rules = StationRule.all.order(category: :asc, id: :asc)
    scheduled_rides = Ride.upcoming_scheduled.includes(:passenger, :driver).order(scheduled_at: :asc)
    solid_queue_jobs_count = SolidQueue::Job.count rescue 0
    solid_queue_scheduled_count = SolidQueue::ScheduledExecution.count rescue 0

    render json: {
      stats: {
        total_drivers: drivers.count,
        available_drivers: drivers.where(status: "available").count,
        busy_drivers: drivers.where(status: "busy").count,
        total_rides: Ride.count,
        scheduled_active: scheduled_rides.count,
        rules_count: rules.count,
        solid_queue_jobs: solid_queue_jobs_count,
        solid_queue_scheduled: solid_queue_scheduled_count
      },
      drivers: drivers.as_json(only: [:id, :name, :phone, :plate, :latitude, :longitude, :status, :telegram_id]),
      recent_rides: rides.map do |r|
        {
          id: r.id,
          passenger_name: r.passenger.name,
          passenger_phone: r.passenger.phone,
          driver_name: r.driver&.name || "Bekliyor",
          driver_plate: r.driver&.plate || "-",
          status: r.status,
          ride_type: r.ride_type,
          scheduled_at: r.scheduled_at&.iso8601,
          reminder_sent_at: r.reminder_sent_at&.iso8601,
          pickup_latitude: r.pickup_latitude,
          pickup_longitude: r.pickup_longitude,
          pickup_address: r.pickup_address,
          distance_km: r.distance_km,
          eta_minutes: r.eta_minutes,
          channel: r.channel,
          created_at: r.created_at.iso8601
        }
      end,
      rules: rules.as_json(only: [:id, :title, :category, :content, :keywords]),
      upcoming_appointments: scheduled_rides.map do |r|
        {
          id: r.id,
          passenger_phone: r.passenger.phone,
          driver_name: r.driver&.name || "Atama Bekliyor",
          scheduled_at: r.scheduled_at.iso8601,
          pickup_address: r.pickup_address,
          reminder_status: r.reminder_sent_at.present? ? "Hatırlatma Gönderildi" : "Kuyrukta (1 saat önce gönderilecek)"
        }
      end
    }
  end

  def simulate_webhook
    msg_type = params[:type]
    phone = params[:phone] || "+905321112233"
    channel = params[:channel].presence || "whatsapp"
    telegram_id = params[:telegram_id]

    if msg_type == "location"
      result = MessageInboundService.process(
        sender_key: phone,
        name: params[:passenger_name],
        lat: params[:latitude].to_f,
        lng: params[:longitude].to_f,
        channel: channel,
        telegram_id: telegram_id
      )
      render json: { action: "dispatched", result: result }
    elsif msg_type == "text"
      result = MessageInboundService.process(
        sender_key: phone,
        name: params[:passenger_name],
        text: params[:text].to_s,
        channel: channel,
        telegram_id: telegram_id
      )
      render json: { action: result[:action] || "text", result: result }
    else
      render json: { error: "Unknown type" }, status: :unprocessable_entity
    end
  end

  def trigger_reminders
    rides = Ride.needs_reminder
    count = 0
    rides.each do |ride|
      AppointmentReminderJob.perform_now(ride.id)
      count += 1
    end
    render json: { message: "#{count} randevu hatırlatması tetiklendi." }
  end
end
