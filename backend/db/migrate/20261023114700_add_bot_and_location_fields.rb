class AddBotAndLocationFields < ActiveRecord::Migration[8.1]
  def change
    add_column :passengers, :telegram_id, :string
    add_column :passengers, :last_latitude, :float
    add_column :passengers, :last_longitude, :float
    add_column :passengers, :channel, :string, default: "whatsapp"
    add_index :passengers, :telegram_id

    add_column :drivers, :telegram_id, :string
    add_index :drivers, :telegram_id

    add_column :rides, :pickup_address, :string
    add_column :rides, :channel, :string, default: "whatsapp"
  end
end
