class CreateRides < ActiveRecord::Migration[8.1]
  def change
    create_table :rides do |t|
      t.references :passenger, null: false, foreign_key: true
      t.references :driver, null: true, foreign_key: true
      t.float :pickup_latitude
      t.float :pickup_longitude
      t.string :dropoff_address
      t.string :status
      t.datetime :scheduled_at
      t.string :ride_type
      t.datetime :reminder_sent_at
      t.integer :eta_minutes
      t.float :distance_km

      t.timestamps
    end
  end
end
