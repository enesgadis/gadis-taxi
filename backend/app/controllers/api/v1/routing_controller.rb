class Api::V1::RoutingController < ApplicationController
  # GET /api/v1/routing/route?start_lat=&start_lng=&end_lat=&end_lng=
  # Gerçek karayolu rotasını OSRM üzerinden hesaplar (anahtar gerektirmez).
  def show
    start_lat = params[:start_lat].to_f
    start_lng = params[:start_lng].to_f
    end_lat = params[:end_lat].to_f
    end_lng = params[:end_lng].to_f

    if start_lat.zero? || start_lng.zero? || end_lat.zero? || end_lng.zero?
      return render json: { error: "start_* ve end_* koordinatları gerekli" }, status: :unprocessable_entity
    end

    result = RoutingService.route(
      start_lat: start_lat, start_lng: start_lng,
      end_lat: end_lat, end_lng: end_lng
    )

    if result.ok?
      render json: {
        coordinates: result.coordinates,
        distance_km: result.distance_km,
        duration_min: result.duration_min,
        provider: "osrm"
      }
    else
      render json: { error: result.error, coordinates: nil }, status: :bad_gateway
    end
  end
end
