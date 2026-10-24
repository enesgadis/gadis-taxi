class CreateChatMessages < ActiveRecord::Migration[8.0]
  def change
    create_table :chat_messages do |t|
      t.string :chat_key, null: false   # ör. tg_8956059424 / wa_905...
      t.string :role, null: false       # user | bot
      t.text :text
      t.timestamps
    end
    add_index :chat_messages, [:chat_key, :created_at]
  end
end
