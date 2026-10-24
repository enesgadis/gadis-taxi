class CreateStationRules < ActiveRecord::Migration[8.1]
  def change
    create_table :station_rules do |t|
      t.string :title
      t.string :category
      t.text :content
      t.string :keywords

      t.timestamps
    end
  end
end
