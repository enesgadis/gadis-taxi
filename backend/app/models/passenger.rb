class Passenger < ApplicationRecord
  has_many :rides, dependent: :destroy

  validates :phone, presence: true, uniqueness: true
end
