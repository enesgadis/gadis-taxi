class Complaint < ApplicationRecord
  belongs_to :passenger, optional: true
  belongs_to :driver, optional: true
  belongs_to :ride, optional: true

  validates :category, presence: true
  validates :severity, inclusion: { in: 1..5 }

  scope :open, -> { where(status: "open").order(created_at: :desc) }
end
