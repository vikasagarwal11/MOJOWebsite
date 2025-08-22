export function detectKind(file: File): 'image'|'video'|'other' {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    const name = file.name.toLowerCase();
    if (/(\.png|\.jpe?g|\.gif|\.webp|\.avif)$/.test(name)) return 'image';
    if (/(\.mp4|\.webm|\.mov|\.m4v|\.mkv)$/.test(name)) return 'video';
    return 'other';
  }