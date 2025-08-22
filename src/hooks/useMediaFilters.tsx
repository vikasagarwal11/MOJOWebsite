import { useMemo, useState } from 'react';

export type MediaSort = 'date_desc' | 'date_asc' | 'likes_desc';
export type MediaTypeFilter = 'all' | 'image' | 'video';

export function useMediaFilters(mediaFiles: any[]) {
  const [type, setType] = useState<MediaTypeFilter>('all');
  const [eventId, setEventId] = useState<string>('all');
  const [uploader, setUploader] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<MediaSort>('date_desc');

  const filtered = useMemo(() => {
    const txt = search.trim().toLowerCase();
    let out = mediaFiles.filter((m: any) => {
      const typeOk = type === 'all' || m.type === type;
      const eventOk = eventId === 'all' || m.eventId === eventId || (!m.eventId && eventId === 'no-event');
      const uploaderOk = uploader === 'all' || m.uploadedBy === uploader;
      const textOk = !txt ||
        (m.title && m.title.toLowerCase().includes(txt)) ||
        (m.description && m.description.toLowerCase().includes(txt)) ||
        (m.eventTitle && m.eventTitle.toLowerCase().includes(txt)) ||
        (m.uploaderName && m.uploaderName.toLowerCase().includes(txt));
      return typeOk && eventOk && uploaderOk && textOk;
    });

    switch (sort) {
      case 'date_asc': out = out.slice().sort((a,b)=>+new Date(a.createdAt)-+new Date(b.createdAt)); break;
      case 'likes_desc': out = out.slice().sort((a,b)=>(b.likesCount||0)-(a.likesCount||0)); break;
      default: out = out.slice().sort((a,b)=>+new Date(b.createdAt)-+new Date(a.createdAt));
    }
    return out;
  }, [mediaFiles, type, eventId, uploader, search, sort]);

  return { type, setType, eventId, setEventId, uploader, setUploader, search, setSearch, sort, setSort, filtered };
}