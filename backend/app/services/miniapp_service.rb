# Telegram WebApp initData doğrulaması:
# https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
require "openssl"

class MiniappService
  def self.verify_init_data(raw_init_data)
    return nil if raw_init_data.blank?

    pairs = Rack::Utils.parse_query(raw_init_data)
    hash = pairs.delete("hash")
    return nil if hash.blank?

    data_check_string = pairs.sort_by { |k, _| k }.map { |k, v| "#{k}=#{v}" }.join("\n")
    secret_key = OpenSSL::HMAC.digest("sha256", "WebAppData", ENV.fetch("TELEGRAM_BOT_TOKEN", ""))
    calculated = OpenSSL::HMAC.hexdigest("sha256", secret_key, data_check_string)

    return nil unless ActiveSupport::SecurityUtils.secure_compare(calculated, hash)

    JSON.parse(pairs["user"].to_s) if pairs["user"].present? && pairs["user"].is_a?(String)
  end
end
