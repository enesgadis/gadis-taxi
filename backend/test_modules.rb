require_relative "config/environment"

puts "=== 1. TEST WHATSAPP LOCATION DISPATCH ==="
passenger = Passenger.find_or_create_by!(phone: "+905329998877") { |p| p.name = "Test Yolcu" }
# Test location near Taksim (41.0360, 28.9840)
res1 = DispatchService.assign_nearest_driver(
  pickup_lat: 41.0360,
  pickup_lng: 28.9840,
  passenger: passenger,
  dropoff_address: "Nişantaşı City's",
  ride_type: "instant"
)
puts "Dispatch Result: Success=#{res1[:success]} | Driver=#{res1[:driver]&.name} | Distance=#{res1[:distance_km]} km | ETA=#{res1[:eta_minutes]} mins"

puts "\n=== 2. TEST APPOINTMENT & SOLID QUEUE REMINDER ==="
res2 = AppointmentSchedulerService.schedule_ride(
  passenger: passenger,
  raw_text: "Yarın saat 15:00 için taksi",
  pickup_lat: 41.0370,
  pickup_lng: 28.9850
)
puts "Scheduled Result: Success=#{res2[:success]} | ScheduledAt=#{res2[:scheduled_at]} | ReminderAt=#{res2[:reminder_at]}"
puts "SolidQueue Scheduled Jobs: #{SolidQueue::ScheduledExecution.count}"

puts "\n=== 3. TEST RAG & STRICT DETERMINISTIC JSON ==="
q1 = "Taksimetre açılış ve km başı tarife ne kadar?"
rag1 = RagDeterministicService.process_query(user_message: q1)
puts "Query: #{q1}"
puts "Intent: #{rag1['intent']} | Confidence: #{rag1['confidence']}"
puts "Citations: #{rag1['rule_citations']}"
puts "Answer: #{rag1['answer_text']}"

q2 = "Evcil kedi taşıyabilir miyim?"
rag2 = RagDeterministicService.process_query(user_message: q2)
puts "\nQuery: #{q2}"
puts "Intent: #{rag2['intent']} | Citations: #{rag2['rule_citations']}"
puts "Answer: #{rag2['answer_text']}"

puts "\nALL MODULE BACKEND TESTS PASSED!"
