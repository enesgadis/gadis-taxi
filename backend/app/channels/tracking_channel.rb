class TrackingChannel < ApplicationCable::Channel
  def subscribed
    room = params[:room].to_s

    # Geçerli odalar:
    #   "locations"  -> tüm canlı şoför telemetrisi (kokpit / radar)
    #   "ride_<id>"  -> tek bir yolculuğun canlı durumu (takip ekranı)
    if room == "locations" || room.start_with?("ride_")
      stream_from "room_#{room}"
    else
      reject
    end
  end
end
