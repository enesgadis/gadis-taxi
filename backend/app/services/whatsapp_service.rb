require "net/http"
require "uri"
require "json"

class WhatsappService
  API_URL = "https://graph.facebook.com/v20.0"

  def self.send_message(to:, text:)
    phone_number_id = ENV.fetch("WHATSAPP_PHONE_NUMBER_ID", "TEST_PHONE_ID")
    access_token = ENV.fetch("WHATSAPP_ACCESS_TOKEN", "TEST_ACCESS_TOKEN")

    # In local/sandbox development without live Meta keys, log message payload safely
    Rails.logger.info "[WhatsApp OUTBOUND] To: #{to} | Message: #{text}"

    return { success: true, simulated: true, to: to, text: text } if access_token == "TEST_ACCESS_TOKEN"

    uri = URI("#{API_URL}/#{phone_number_id}/messages")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true

    request = Net::HTTP::Post.new(uri.path, {
      "Content-Type" => "application/json",
      "Authorization" => "Bearer #{access_token}"
    })

    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: { preview_url: false, body: text }
    }

    request.body = payload.to_json
    response = http.request(request)

    JSON.parse(response.body) rescue { code: response.code }
  end
end
