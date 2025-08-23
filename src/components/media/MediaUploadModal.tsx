import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Upload, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { useUploader } from '../../hooks/useUploader';
import { detectKind } from '../../utils/detectKind';
import { getImageSize, getVideoDuration } from '../../utils/getMediaMetadata';
// Removed unused import: react-zoom-pan-pinch
import EventTypeahead from './EventTypeahead';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function MediaUploadModal({ events, onClose, onMediaUploaded }:{ events:any[]; onClose:()=>void; onMediaUploaded:()=>void }) {
  const { currentUser } = useAuth();
  const { loading, uploadMany } = useUploader();
  const { register, handleSubmit, formState:{ errors }, watch, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  // NEW state for additive file selection
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<{ id:string|null; title:string|null }>({ id:null, title:null });
  const [previews, setPreviews] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const selectedFile = selectedFiles[selectedIdx];
  const selectedUrl = previews[selectedIdx];
  const fileKind = useMemo(()=> selectedFile ? detectKind(selectedFile) : null, [selectedFile]);

  // Dedupe by name+size+lastModified
  const keyOf = (f: File) => `${f.name}::${f.size}::${f.lastModified}`;

  function mergeFiles(prev: File[], next: File[]) {
    const seen = new Set(prev.map(keyOf));
    const merged = [...prev];
    for (const f of next) if (!seen.has(keyOf(f))) merged.push(f);
    return merged;
  }

  // Handle additive selection
  function onAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (list.length === 0) return;
    setSelectedFiles(prev => mergeFiles(prev, list));
    // Important: clear input so selecting the same file again still fires change
    e.target.value = '';
  }

  // Optional remove file
  function removeAt(i: number) {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== i));
  }

  // Build previews for ALL selected files
  useEffect(() => {
    previews.forEach(u => URL.revokeObjectURL(u)); // cleanup old
    const urls = selectedFiles.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    if (selectedIdx >= urls.length) setSelectedIdx(Math.max(0, urls.length - 1));
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [selectedFiles]);

  const onSubmit = async (data: FormData) => {
    if (!currentUser) { toast.error('Please sign in to upload.'); return; }
    if (selectedFiles.length === 0) { toast.error('Please select at least one file.'); return; }

    const fileArr = selectedFiles;

    try {
      await uploadMany(fileArr, async (f: File) => {
        const kind = detectKind(f);
        let dimensions: any; let duration: number | undefined;
        if (kind === 'image') { dimensions = await getImageSize(f); }
        if (kind === 'video') { const d = await getVideoDuration(f); duration = d.duration; }

        return {
          title: data.title.trim(),
          titleLower: data.title.trim().toLowerCase(),
          description: data.description?.trim() || undefined,
          type: kind,
          eventId: selectedEvent.id ?? null,
          eventTitle: selectedEvent.title ?? null,
          uploadedBy: currentUser.id,
          uploaderName: currentUser.displayName || 'Member',
          isPublic: true,
          likesCount: 0,
          commentsCount: 0,
          viewsCount: 0, // Initialize views counter for consistency
          transcodeStatus: kind === 'video' ? 'processing' : 'ready', // Videos need processing, images are ready
          ...(dimensions? { dimensions } : {}),
          ...(duration? { duration } : {}),
        };
      }, (fileName: string, progressPercent: number) => {
        // Update progress for this specific file
        setProgress(prev => ({ ...prev, [fileName]: progressPercent }));
      });

      // Removed verbose processing info - users don't need technical details

      // Simplified toast - users don't need technical details
      toast.success(`${fileArr.length} file(s) uploaded.`, { duration: 3000 });

      setProgress({}); // Clear progress
      setSelectedFiles([]); // Clear selected files
      reset(); 
      onMediaUploaded();
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Upload failed. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Upload Media</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-6 h-6 text-gray-500"/></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Choose Files</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400">
              <input
                type="file"
                accept="image/*,video/*"
                id="media-file-input"
                className="hidden"
                multiple
                onChange={onAddFiles}
              />
              <label htmlFor="media-file-input" className="cursor-pointer block">
                {previews.length > 0 ? (
                  <div className="space-y-4">
                                         {/* Main preview w/ arrows */}
                     <div className="relative">
                       {(/\.(mp4|webm|mov|m4v|mkv)$/i.test(selectedFiles[selectedIdx]?.name || '') ||
                         selectedFiles[selectedIdx]?.type.startsWith('video/')) ? (
                         <video src={selectedUrl} muted controls className="max-h-56 w-full mx-auto rounded-lg" />
                       ) : (
                         <img src={selectedUrl} alt="Preview" className="max-h-56 w-full mx-auto rounded-lg object-cover" />
                       )}
                       {/* Prev / Next */}
                       {previews.length > 1 && (
                         <>
                           <button
                             type="button"
                             onClick={(e) => { e.preventDefault(); setSelectedIdx(i => Math.max(0, i - 1)); }}
                             className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
                             aria-label="Previous"
                           >‹</button>
                           <button
                             type="button"
                             onClick={(e) => { e.preventDefault(); setSelectedIdx(i => Math.min(previews.length - 1, i + 1)); }}
                             className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
                             aria-label="Next"
                           >›</button>
                         </>
                       )}
                     </div>

                                         {/* Thumbnails + remove */}
                     {previews.length > 1 && (
                       <div className="flex gap-2 overflow-x-auto pb-1">
                         {previews.map((u, i) => (
                           <div key={i} className={`relative flex-none w-20 h-16 rounded-md overflow-hidden border ${i === selectedIdx ? 'border-purple-500' : 'border-transparent hover:border-gray-300'}`}>
                             <button
                               type="button"
                               onClick={(e) => { e.preventDefault(); setSelectedIdx(i); }}
                               className="w-full h-full"
                             >
                               {(/\.(mp4|webm|mov|m4v|mkv)$/i.test(selectedFiles[i]?.name || '') || selectedFiles[i]?.type.startsWith('video/')) ? (
                                 <video src={u} muted className="w-full h-full object-cover" />
                               ) : (
                                 <img src={u} className="w-full h-full object-cover" />
                               )}
                             </button>
                             <button
                               type="button"
                               onClick={(e) => { e.preventDefault(); removeAt(i); }}
                               className="absolute top-1 right-1 rounded bg-black/60 text-white text-[10px] px-1 hover:bg-black/80"
                               title="Remove file"
                             >×</button>
                           </div>
                         ))}
                       </div>
                     )}
                    <p className="text-sm text-gray-600">Click to add more files</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto"/>
                    <div>
                      <p className="text-lg font-medium text-gray-700">Upload your media</p>
                      <p className="text-sm text-gray-500">Drag & drop or click to browse (multiple allowed)</p>
                    </div>
                  </div>
                )}
              </label>
                         </div>
           </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>
              <input {...register('title')} type="text"
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.title?'border-red-300':'border-gray-300'} focus:ring-2 focus:ring-purple-500`}
                placeholder="Enter media title"/>
            </div>
            {errors.title && <p className="mt-1 text-sm text-red-600">{String(errors.title.message)}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
            <textarea {...register('description')} rows={3}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500"
              placeholder="Describe your media..."/>
          </div>

          <EventTypeahead value={selectedEvent} onChange={setSelectedEvent} seedEvents={events as any} />

          {/* Overall upload progress */}
          {Object.keys(progress).length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="text-sm font-medium text-gray-700">
                Overall Progress: {Math.round(Object.values(progress).reduce((sum, pct) => sum + pct, 0) / Object.keys(progress).length)}%
              </div>
              
              {/* Per-file upload progress */}
              <div className="space-y-1">
                {Object.entries(progress).map(([name, pct]) => (
                  <div key={name} className="text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span className="truncate max-w-[60%]">{name}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded">
                      <div className="h-1.5 bg-purple-500 rounded" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg disabled:opacity-50">
              {loading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}