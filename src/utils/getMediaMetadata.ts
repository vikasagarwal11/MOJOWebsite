export async function getImageSize(file: File) {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      return await new Promise<{width?:number;height?:number}>((resolve) => {
        img.onload = () => { resolve({ width: img.width, height: img.height }); URL.revokeObjectURL(url); };
        img.onerror = () => { resolve({}); URL.revokeObjectURL(url); };
        img.src = url;
      });
    } catch { return {}; }
  }
  
  export async function getVideoDuration(file: File) {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      return await new Promise<{duration?:number}>((resolve) => {
        v.onloadedmetadata = () => { resolve({ duration: Math.round(v.duration || 0) }); URL.revokeObjectURL(url); };
        v.onerror = () => { resolve({}); URL.revokeObjectURL(url); };
        v.src = url;
      });
    } catch { return {}; }
  }