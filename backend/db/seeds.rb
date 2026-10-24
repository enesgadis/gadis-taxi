puts "Seeding drivers..."
Driver.destroy_all
drivers_data = [
  { name: "Ahmet Yılmaz", phone: "+905321000001", plate: "34 TAX 101", latitude: 41.0369, longitude: 28.9850, status: "available" }, # Taksim
  { name: "Mehmet Demir", phone: "+905321000002", plate: "34 TAX 102", latitude: 41.0422, longitude: 29.0067, status: "available" }, # Beşiktaş
  { name: "Canan Aydın", phone: "+905321000003", plate: "34 TAX 103", latitude: 40.9901, longitude: 29.0253, status: "available" }, # Kadıköy
  { name: "Serkan Kaya", phone: "+905321000004", plate: "34 TAX 104", latitude: 41.0122, longitude: 28.9760, status: "available" }, # Sultanahmet
  { name: "Barış Özkan", phone: "+905321000005", plate: "34 TAX 105", latitude: 41.0776, longitude: 29.0118, status: "busy" },
  { name: "Emre Çelik", phone: "+905321000006", plate: "34 TAX 106", latitude: 40.9923, longitude: 29.1278, status: "available" },
  { name: "Deniz Arslan", phone: "+905321000007", plate: "34 TAX 107", latitude: 40.9860, longitude: 29.1160, status: "available" }
]
drivers_data.each { |d| Driver.create!(d) }

puts "Seeding station rules & tariffs for RAG..."
StationRule.destroy_all
rules_data = [
  {
    title: "Açılış ve Kilometre Taksimetre Tarifesi",
    category: "Tarife",
    keywords: "ücret tarife taksimetre fiyat km açılış indi bindi maliyet kaç para",
    content: "Taksimetre açılış ücreti 35.00 TL'dir. Kilometre başına mesafe ücreti 25.00 TL'dir. Kısa mesafe minimum indi-bindi ücreti 120.00 TL olarak uygulanmaktadır. Gece ve gündüz aynı tarife geçerlidir."
  },
  {
    title: "Köprü ve Otoyol Geçiş Ücretleri",
    category: "Geçiş Ücreti",
    keywords: "köprü otoyol geçiş gişe avrasya boğaz fsm osmangazi otoban hgs",
    content: "15 Temmuz Şehitler ve Fatih Sultan Mehmet Köprüleri gidiş yönünde yolcu tarafından ödenir. Avrasya Tüneli ve Osmangazi Köprüsü gibi özel otoyol geçişleri resmi gişe bedeli üzerinden doğrudan yolcuya aittir. Şoför ekstra komisyon talep edemez."
  },
  {
    title: "Evcil Hayvan Taşıma Kuralları",
    category: "Kural",
    keywords: "evcil hayvan köpek kedi kafes taşıma pet",
    content: "Kedi ve küçük ırk köpekler özel taşıma çantası / kafesi içinde olmak şartıyla araçlara kabul edilir. Kafessiz büyük ırk hayvanlar için yolculuk öncesinde şoförün onayı gereklidir. Rehber köpekler her koşulda koşulsuz kabul edilir."
  },
  {
    title: "Bagaj ve Yük Taşıma Esasları",
    category: "Kural",
    keywords: "bagaj bavul valiz yük taşıma eşya hacim",
    content: "Aracın bagaj hacmini aşmayan 2 büyük boy veya 3 orta boy valiz için ek ücret talep edilmez. Bagaja sığmayan, araç içine zarar verebilecek veya görüşü engelleyen koli ve aşırı yükler güvenlik gerekçesiyle taşınmaz."
  },
  {
    title: "İleri Tarihli Randevu Sistemi",
    category: "Randevu",
    keywords: "randevu ileri tarihli yarın rezervasyon planlama zaman",
    content: "İleri tarihli randevular en az 2 saat, en fazla 7 gün öncesine kadar oluşturulabilir. Randevu saatinden tam 1 saat önce yolcu ve şoföre WhatsApp üzerinden anlık hatırlatma ve teyit mesajı gönderilir. İptaller randevuya 45 dakika kalana kadar ücretsizdir."
  },
  {
    title: "Havalimanı Transfer ve Bekleme Kuralları",
    category: "Havalimanı",
    keywords: "havalimanı sabiha gökçen istanbul airport uçak iniş karşılama bekleme",
    content: "İstanbul Havalimanı (IST) ve Sabiha Gökçen Havalimanı (SAW) transferlerinde ilk 15 dakikalık bekleme süresi ücretsizdir. 15 dakikayı aşan beklemelerde her 10 dakika için 30 TL bekleme bedeli taksimetreye ilave edilir."
  }
]
rules_data.each { |r| StationRule.create!(r) }

puts "Seeding sample passenger and ride..."
p1 = Passenger.find_or_create_by!(phone: "+905559876543") { |p| p.name = "Zeynep Kaya" }
Ride.create!(
  passenger: p1,
  driver: Driver.first,
  pickup_latitude: 41.0370,
  pickup_longitude: 28.9850,
  dropoff_address: "Kadıköy Rıhtım",
  status: "dispatched",
  ride_type: "instant",
  distance_km: 0.8,
  eta_minutes: 5
)

puts "Database seeded successfully!"
