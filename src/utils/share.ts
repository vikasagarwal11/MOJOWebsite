export async function shareUrl(url: string, title = 'Media') {
    try {
      if (navigator.share) { await navigator.share({ title, url }); }
      else { await navigator.clipboard.writeText(url); }
      return true;
    } catch { return false; }
  }