Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  get  "webhook" => "webhooks#verify"
  post "webhook" => "webhooks#receive"
  post "telegram/webhook" => "webhooks#telegram"

  namespace :api do
    namespace :v1 do
      post "auth/passenger" => "auth#passenger"
      post "auth/telegram_init" => "miniapp#init"
      post "assistant/chat" => "assistant#chat"
      post "assistant/complaint" => "assistant#complaint"
      post "messages/relay" => "messages#relay"
      post "auth/driver" => "auth#driver"
      post "auth/driver/register" => "auth#register"
      get  "auth/drivers" => "auth#drivers"

      post "rides/instant" => "rides#instant"
      post "rides/schedule" => "rides#schedule"

      get  "cockpit/status" => "cockpit#status"
      post "cockpit/simulate_webhook" => "cockpit#simulate_webhook"
      post "cockpit/trigger_reminders" => "cockpit#trigger_reminders"

      get  "tracking/ride/:id" => "tracking#ride_status"
      get  "tracking/nearby_taxis" => "tracking#nearby_taxis"
      get  "tracking/map" => "tracking#map"
      get  "tracking/driver_portal" => "tracking#driver_portal"
      post "tracking/update_driver_location" => "tracking#update_driver_location"
      post "tracking/accept_ride" => "tracking#accept_ride"
      post "tracking/update_ride_status" => "tracking#update_ride_status"

      get "routing/route" => "routing#show"
    end
  end

  mount ActionCable.server => "/cable"
end
