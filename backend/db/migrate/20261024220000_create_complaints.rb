class CreateComplaints < ActiveRecord::Migration[8.0]
  def change
    create_table :complaints do |t|
      t.references :passenger, null: true, foreign_key: true
      t.references :driver, null: true
      t.references :ride, null: true
      t.text :raw_text
      t.string :category
      t.integer :severity
      t.text :ai_summary
      t.text :ai_reply
      t.text :suggested_action
      t.string :status, default: "open"
      t.string :channel, default: "telegram"
      t.timestamps
    end
  end
end
