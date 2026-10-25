require "net/http"
require "uri"
require "json"

class TelegramService
  # Bot kullanıcı adı (t.me linkleri için) — getMe sonucu cache'lenir
  def self.bot_username
    @bot_username ||= begin
      token = ENV.fetch("TELEGRAM_BOT_TOKEN", "TEST_TELEGRAM_TOKEN")
      return Rails.application.secrets.dig(:placeholder_bot) || "Gadis_Taxi_bot" if token == "TEST_TELEGRAM_TOKEN"
      uri = URI("https://api.telegram.org/bot#{token}/getMe")
      res = Net::HTTP.new(uri.host, uri.port).tap { |h| h.use_ssl = true }
      body = JSON.parse(res.get(uri).body) rescue {}
      body.dig("result", "username") || "Gadis_Taxi_bot"
    end
  end

  def self.send_chat_action(chat_id:, action: "typing")
    return if chat_id.blank?
    token = ENV.fetch("TELEGRAM_BOT_TOKEN", "TEST_TELEGRAM_TOKEN")
    return if token == "TEST_TELEGRAM_TOKEN"
    uri = URI("https://api.telegram.org/bot#{token}/sendChatAction")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.read_timeout = 5
    req = Net::HTTP::Post.new(uri.path, { "Content-Type" => "application/json" })
    req.body = { chat_id: chat_id, action: action }.to_json
    http.request(req) rescue nil
  end

  def self.send_message(chat_id:, text:)
    return { success: false } if chat_id.blank?

    token = ENV.fetch("TELEGRAM_BOT_TOKEN", "TEST_TELEGRAM_TOKEN")
    Rails.logger.info "[Telegram OUTBOUND] Chat: #{chat_id} | Message: #{text}"
    return { success: true, simulated: true, chat_id: chat_id, text: text } if token == "TEST_TELEGRAM_TOKEN"

    uri = URI("https://api.telegram.org/bot#{token}/sendMessage")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    request = Net::HTTP::Post.new(uri.path, { "Content-Type" => "application/json" })
    request.body = { chat_id: chat_id, text: text, parse_mode: "Markdown" }.to_json
    response = http.request(request)
    JSON.parse(response.body) rescue { code: response.code }
  end

  # Tarayıcıda açılabilir butonlu mesaj (inline_keyboard)
  def self.send_with_buttons(chat_id:, text:, buttons:)
    return send_message(chat_id: chat_id, text: text) if chat_id.blank? || buttons.blank?

    token = ENV.fetch("TELEGRAM_BOT_TOKEN", "TEST_TELEGRAM_TOKEN")
    Rails.logger.info "[Telegram OUTBOUND] Chat: #{chat_id} | Buttons: #{text}"
    return { success: true, simulated: true, chat_id: chat_id } if token == "TEST_TELEGRAM_TOKEN"

    uri = URI("https://api.telegram.org/bot#{token}/sendMessage")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    request = Net::HTTP::Post.new(uri.path, { "Content-Type" => "application/json" })
    request.body = {
      chat_id: chat_id,
      text: text,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons } # [[{text:..., url:...}], ...]
    }.to_json
    response = http.request(request)
    JSON.parse(response.body) rescue { code: response.code }
  end

  # Telegram Mini App butonu: Telegram dışına çıkmadan uygulama içi panel açar.
  # web_app tipi inline button yalnızca HTTPS kabul eder → FRONTEND_URL tünel adresi olmalı.
  def self.send_miniapp(chat_id:, text:, button_text: "🚖 Uygulamayı Aç")
    url = ENV.fetch("FRONTEND_URL", "").sub(%r{/\z}, "") + "/app"
    return send_message(chat_id: chat_id, text: text) if chat_id.blank? || ENV["FRONTEND_URL"].blank?

    token = ENV.fetch("TELEGRAM_BOT_TOKEN", "TEST_TELEGRAM_TOKEN")
    Rails.logger.info "[Telegram OUTBOUND] Chat: #{chat_id} | MiniApp: #{text}"
    return { success: true, simulated: true, chat_id: chat_id } if token == "TEST_TELEGRAM_TOKEN"

    uri = URI("https://api.telegram.org/bot#{token}/sendMessage")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    request = Net::HTTP::Post.new(uri.path, { "Content-Type" => "application/json" })
    request.body = {
      chat_id: chat_id,
      text: text,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: button_text, web_app: { url: url } }]]
      }
    }.to_json
    response = http.request(request)
    JSON.parse(response.body) rescue { code: response.code }
  end

  # Kullanıcıdan numara paylaşımı isteyen klavye (request_contact)
  def self.send_contact_request(chat_id:, text:)
    return send_message(chat_id: chat_id, text: text) if chat_id.blank?

    token = ENV.fetch("TELEGRAM_BOT_TOKEN", "TEST_TELEGRAM_TOKEN")
    Rails.logger.info "[Telegram OUTBOUND] Chat: #{chat_id} | Contact request"
    return { success: true, simulated: true, chat_id: chat_id } if token == "TEST_TELEGRAM_TOKEN"

    uri = URI("https://api.telegram.org/bot#{token}/sendMessage")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    request = Net::HTTP::Post.new(uri.path, { "Content-Type" => "application/json" })
    request.body = {
      chat_id: chat_id,
      text: text,
      reply_markup: {
        keyboard: [
          [{ text: "📱 Numaramı Paylaş", request_contact: true }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }.to_json
    response = http.request(request)
    JSON.parse(response.body) rescue { code: response.code }
  end
end
