import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

type WatermarkRequest = {
  mediaId: string;
};

type WatermarkResponse = {
  url: string;
  expiresAt: number;
  isCached?: boolean; // Indicates if watermark was cached or newly generated
};

const watermarkCallable = httpsCallable<WatermarkRequest, WatermarkResponse>(
  functions,
  'getWatermarkedMedia'
);

export async function requestWatermarkedDownload(mediaId: string): Promise<{ url: string; isCached: boolean }> {
  if (!mediaId) {
    throw new Error('Missing media identifier');
  }

  const result = await watermarkCallable({ mediaId });
  const data = result.data as WatermarkResponse | undefined;

  if (!data?.url) {
    throw new Error('Watermarked download URL not available');
  }

  return { url: data.url, isCached: data.isCached ?? false };
}
