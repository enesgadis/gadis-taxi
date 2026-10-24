class LocationService
  PLACES = {
    "atasehir" => { lat: 40.9923, lng: 29.1278, name: "Ataşehir" },
    "taksim" => { lat: 41.0370, lng: 28.9850, name: "Taksim" },
    "kadikoy" => { lat: 40.9901, lng: 29.0253, name: "Kadıköy" },
    "besiktas" => { lat: 41.0422, lng: 29.0067, name: "Beşiktaş" },
    "levent" => { lat: 41.0776, lng: 29.0118, name: "Levent" },
    "sultanahmet" => { lat: 41.0082, lng: 28.9784, name: "Sultanahmet" },
    "umraniye" => { lat: 41.0165, lng: 29.1244, name: "Ümraniye" },
    "maltepe" => { lat: 40.9352, lng: 29.1389, name: "Maltepe" },
    "uskudar" => { lat: 41.0225, lng: 29.0150, name: "Üsküdar" },
    "sisli" => { lat: 41.0605, lng: 28.9870, name: "Şişli" },
    "bakirkoy" => { lat: 40.9800, lng: 28.8725, name: "Bakırköy" }
  }.freeze

  def self.resolve(text)
    n = normalize(text)
    PLACES.each do |key, val|
      return val if n.include?(key)
    end
    return PLACES["atasehir"] if n.include?("atase") || n.include?("ata seh")
    nil
  end

  def self.normalize(text)
    text.to_s.downcase
        .gsub("ı", "i").gsub("İ", "i")
        .gsub("ş", "s").gsub("ğ", "g").gsub("ü", "u").gsub("ö", "o").gsub("ç", "c")
        .gsub(/[^a-z0-9\s]/, " ")
        .squeeze(" ")
  end
end
