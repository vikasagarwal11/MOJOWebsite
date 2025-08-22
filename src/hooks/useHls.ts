import { useEffect } from 'react';

export function useHls(videoEl: HTMLVideoElement | null, hlsUrl?: string) {
  useEffect(() => {
    if (!videoEl || !hlsUrl) return;
    const video = videoEl;
    async function attach() {
      if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = hlsUrl; return; }
      const Hls = (await import('hls.js')).default;
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
    }
    attach().catch(() => {});
  }, [videoEl, hlsUrl]);
}