import React from 'react';
import { X, Share2, Download } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { shareUrl } from '../../utils/share';

export default function MediaLightbox({ item, onClose, onPrev, onNext }:{ item:any; onClose:()=>void; onPrev:()=>void; onNext:()=>void }) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm">
      <div className="absolute inset-0 flex flex-col">
        <div className="flex items-center justify-between p-3">
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
            <X className="w-5 h-5 text-white" />
          </button>
          <div className="flex gap-2">
            <button onClick={()=>shareUrl(item.url, item.title)} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
              <Share2 className="w-4 h-4" /> Share
            </button>
            <a href={item.url} download className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
              <Download className="w-4 h-4" /> Download
            </a>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-3 gap-4">
          <button onClick={onPrev} className="text-white text-3xl px-3" aria-label="Previous">‹</button>
          <TransformWrapper>
            <TransformComponent>
              {item.type==='video' ? (
                <video src={item.url} controls autoPlay className="max-h-[85vh] max-w-[85vw] rounded-2xl"/>
              ) : (
                <img src={item.thumbnailUrl || item.url} alt={item.title} className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain"/>
              )}
            </TransformComponent>
          </TransformWrapper>
          <button onClick={onNext} className="text-white text-3xl px-3" aria-label="Next">›</button>
        </div>
      </div>
    </div>
  );
}