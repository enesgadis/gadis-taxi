class Ride < ApplicationRecord
  belongs_to :passenger
  belongs_to :driver, optional: true

  validates :passenger, presence: true
  validates :status, inclusion: { in: %w[pending offered dispatched confirmed in_progress completed cancelled] }
  validates :ride_type, inclusion: { in: %w[instant scheduled] }

  scope :upcoming_scheduled, -> { where(ride_type: "scheduled", status: %w[pending confirmed]).where("scheduled_at > ?", Time.current) }
  scope :needs_reminder, -> {
    where(ride_type: "scheduled")
      .where(reminder_sent_at: nil)
      .where("scheduled_at <= ?", 1.hour.from_now)
      .where("scheduled_at > ?", Time.current)
  }
end
