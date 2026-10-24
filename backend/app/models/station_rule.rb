class StationRule < ApplicationRecord
  validates :title, :category, :content, presence: true

  # RAG Search: Semantic & keyword matching
  def self.search_relevant(query, limit = 4)
    terms = query.to_s.downcase.split(/\s+/).reject(&:blank?)
    return all.limit(limit) if terms.empty?

    scored = all.map do |rule|
      score = 0
      text = "#{rule.title} #{rule.category} #{rule.content} #{rule.keywords}".downcase
      terms.each do |term|
        score += 3 if rule.keywords.to_s.downcase.include?(term)
        score += 2 if rule.title.downcase.include?(term)
        score += 1 if rule.content.downcase.include?(term)
      end
      { rule: rule, score: score }
    end

    scored.select { |item| item[:score] > 0 }
          .sort_by { |item| -item[:score] }
          .first(limit)
          .map { |item| item[:rule] }
  end
end
