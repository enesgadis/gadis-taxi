module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :session_id

    def connect
      # Konuk bağlantılar için rastgele oturum kimliği üretir
      self.session_id = SecureRandom.uuid
    end
  end
end
