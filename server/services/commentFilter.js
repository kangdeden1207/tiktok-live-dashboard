// server/services/commentFilter.js
// Filter komentar berdasarkan keyword (mis. "spill", "diskon", "ready")
// supaya host/admin bisa fokus ke komentar yang actionable saat live.

class CommentFilter {
  constructor(defaultKeywords = []) {
    // Simpan keyword dalam bentuk lowercase Set untuk pencarian cepat
    this.keywords = new Set(defaultKeywords.map((k) => k.toLowerCase()));
  }

  addKeyword(keyword) {
    if (!keyword) return this.getKeywords();
    this.keywords.add(keyword.toLowerCase().trim());
    return this.getKeywords();
  }

  removeKeyword(keyword) {
    this.keywords.delete(keyword.toLowerCase().trim());
    return this.getKeywords();
  }

  getKeywords() {
    return Array.from(this.keywords);
  }

  // Mengembalikan keyword apa saja yang match di dalam sebuah komentar
  match(commentText = '') {
    const text = commentText.toLowerCase();
    return this.getKeywords().filter((kw) => text.includes(kw));
  }

  // Helper: tandai komentar dengan flag "isHot" + daftar matchedKeywords
  enrich(comment) {
    const matchedKeywords = this.match(comment.text);
    return {
      ...comment,
      matchedKeywords,
      isHot: matchedKeywords.length > 0,
    };
  }
}

module.exports = CommentFilter;
