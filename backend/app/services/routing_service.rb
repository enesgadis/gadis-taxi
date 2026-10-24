require 'net/http'
require 'json'

# Gerçek karayolu rotası: OSRM (Open Source Routing Machine) public API proxysi.
# Google Directions API anahtarı gerektirmez; dönen GeoJSON koordinatları
# [lat, lng] formatına çevrilerek Leaflet polyline olarak çizilir.
class RoutingService
  OSRM_BASE = "https://router.project-osrm.org/route/v1/driving".freeze
  TIMEOUT = 6 # saniye

  Result = Struct.new(:ok?, :coordinates, :distance_km, :duration_min, :error, keyword_init: true)

  def self.route(start_lat:, start_lng:, end_lat:, end_lng:)
    path = "#{OSRM_BASE}/#{lng6(start_lng)},#{lat6(start_lat)};#{lng6(end_lng)},#{lat6(end_lat)}"
    uri = URI.parse("#{path}?overview=full&geometries=geojson")

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    http.open_timeout = TIMEOUT
    http.read_timeout = TIMEOUT

    res = http.get("#{uri.path}?#{uri.query}")
    data = JSON.parse(res.body)
    r = data.dig("routes", 0)
    return missing unless r && r.dig("geometry", "coordinates")

    coords = r.dig("geometry", "coordinates").map { |lng, lat| [lat, lng] } # GeoJSON [lng,lat] -> Leaflet [lat,lng]
    Result.new(
      ok?: true,
      coordinates: coords,
      distance_km: (r["distance"].to_f / 1000.0).round(2),
      duration_min: (r["duration"].to_f / 60.0).round(1),
      error: nil
    )
  rescue StandardError => e
    Rails.logger.error "RoutingService: #{e.message}"
    missing(e.message)
  end

  def self.missing(err = nil)
    Result.new(ok?: false, coordinates: nil, distance_km: nil, duration_min: nil, error: err || "rota hesaplanamadı")
  end

  def self.lat6(v) = format("%.6f", v.to_f)
  def self.lng6(v) = format("%.6f", v.to_f)
end
