class NotifyService
  def self.passenger(passenger, text)
    WhatsappService.send_message(to: passenger.phone, text: text) if passenger.phone.present?
    TelegramService.send_message(chat_id: passenger.telegram_id, text: text) if passenger.telegram_id.present?
  end

  def self.driver(driver, text)
    return unless driver
    WhatsappService.send_message(to: driver.phone, text: text) if driver.phone.present?
    TelegramService.send_message(chat_id: driver.telegram_id, text: text) if driver.telegram_id.present?
  end
end
