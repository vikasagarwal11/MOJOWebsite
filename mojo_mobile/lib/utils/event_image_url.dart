/// Picks the best image URL from Firestore event fields (legacy + current), matching web usage.
String? pickEventImageUrl(Map<String, dynamic> data) {
  const keys = [
    'imageUrl',
    'coverImageUrl',
    'coverImage',
    'photoUrl',
    'photoURL',
    'bannerUrl',
    'image',
  ];
  for (final k in keys) {
    final v = data[k];
    final s = _coerceToHttpUrlString(v);
    if (s != null && s.isNotEmpty) return s;
  }
  return null;
}

String? _coerceToHttpUrlString(dynamic v) {
  if (v == null) return null;
  if (v is String) {
    final t = v.trim();
    if (t.isEmpty) return null;
    if (t.startsWith('gs://')) return null;
    return t;
  }
  if (v is Map) {
    final url = v['url'] ?? v['downloadURL'];
    if (url is String && url.trim().isNotEmpty) return url.trim();
  }
  return null;
}
