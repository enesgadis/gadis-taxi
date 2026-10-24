class CreatePassengers < ActiveRecord::Migration[8.1]
  def change
    create_table :passengers do |t|
      t.string :phone
      t.string :name

      t.timestamps
    end
  end
end
