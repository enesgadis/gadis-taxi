class CreateDrivers < ActiveRecord::Migration[8.1]
  def change
    create_table :drivers do |t|
      t.string :name
      t.string :phone
      t.string :plate
      t.float :latitude
      t.float :longitude
      t.string :status

      t.timestamps
    end
  end
end
