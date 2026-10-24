class AppointmentReminderSweepJob < ApplicationJob
  queue_as :default

  def perform
    Ride.needs_reminder.find_each do |ride|
      AppointmentReminderJob.perform_now(ride.id)
    end
  end
end
