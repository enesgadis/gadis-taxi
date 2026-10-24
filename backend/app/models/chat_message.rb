# Konuşma belleği: her sohbetin son mesajları DB'de saklanır;
# AI her yeni mesajı bu geçmişle görür → "her mesaja merhabayla başlama" sorunu biter.
class ChatMessage < ApplicationRecord
  belongs_to :ride, optional: true
  self.table_name = "chat_messages"

  validates :chat_key, presence: true
  validates :role, inclusion: { in: %w[user bot] }

  def self.history_for(chat_key, limit = 8)
    where(chat_key: chat_key).order(created_at: :desc).limit(limit).reverse
      .map { |m| { role: m.role, text: m.text.to_s } }
  end

  def self.log!(chat_key, role, text)
    create!(chat_key: chat_key, role: role, text: text.to_s[0, 2000])
  end
end
