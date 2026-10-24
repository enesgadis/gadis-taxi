class Driver < ApplicationRecord
  has_many :rides, dependent: :nullify

  validates :name, :phone, :plate, presence: true
  validates :phone, :plate, uniqueness: true

  scope :available, -> { where(status: "available") }

  def self.nearest_to(lat, lng, max_km = 25.0)
    # Bounding-box ön filtresi: tüm şoförleri Ruby'ye yüklemek yerine
    # max_km yarıçapındaki ~ derece penceresini SQL'de kıs (1° ≈ 111 km)
    lat_delta = max_km / 111.0
    lng_delta = max_km / (111.0 * [Math.cos(lat * Math::PI / 180), 0.05].max)
    window = where(status: "available")
             .where("latitude BETWEEN ? AND ?", lat - lat_delta, lat + lat_delta)
             .where("longitude BETWEEN ? AND ?", lng - lng_delta, lng + lng_delta)

    window.to_a.map do |driver|
      distance = calculate_distance(lat, lng, driver.latitude, driver.longitude)
      { driver: driver, distance_km: distance }
    end.select { |item| item[:distance_km] <= max_km }
       .sort_by { |item| item[:distance_km] }
  end

  def self.calculate_distance(lat1, lon1, lat2, lon2)
    return Float::INFINITY if lat1.nil? || lon1.nil? || lat2.nil? || lon2.nil?

    rad_per_deg = Math::PI / 180
    rkm = 6371
    dlat_rad = (lat2 - lat1) * rad_per_deg
    dlon_rad = (lon2 - lon1) * rad_per_deg
    lat1_rad = lat1 * rad_per_deg
    lat2_rad = lat2 * rad_per_deg
    a = Math.sin(dlat_rad / 2)**2 + Math.cos(lat1_rad) * Math.cos(lat2_rad) * Math.sin(dlon_rad / 2)**2
    c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    (rkm * c).round(2)
  end
end
