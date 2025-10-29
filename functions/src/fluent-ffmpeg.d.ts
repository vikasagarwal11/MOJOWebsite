// Type declarations for fluent-ffmpeg
// Created because @types/fluent-ffmpeg package is not available

declare module 'fluent-ffmpeg' {
  import { EventEmitter } from 'events';

  interface FfmpegCommand extends EventEmitter {
    (input?: string | FfmpegCommand): FfmpegCommand;
    
    input(input: string | number): FfmpegCommand;
    addInput(input: string | number): FfmpegCommand;
    addOptions(options: string | string[]): FfmpegCommand;
    output(output: string | number, pipe?: boolean): FfmpegCommand;
    run(): FfmpegCommand;
    kill(signal?: string): FfmpegCommand;
    on(event: string, listener: (...args: any[]) => void): FfmpegCommand;
    once(event: string, listener: (...args: any[]) => void): FfmpegCommand;
    format(format: string): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    size(size: string): FfmpegCommand;
    fps(fps: number): FfmpegCommand;
    videoBitrate(bitrate: string | number): FfmpegCommand;
    audioBitrate(bitrate: string | number): FfmpegCommand;
    audioFrequency(freq: number): FfmpegCommand;
    audioChannels(channels: number): FfmpegCommand;
    audioQuality(quality: number): FfmpegCommand;
    seekInput(time: string | number): FfmpegCommand;
    seek(time: string | number): FfmpegCommand;
    duration(time: string | number): FfmpegCommand;
    screenshots(options: any): FfmpegCommand;
    takeScreenshots(frameCount: number, folder: string, filename: string, callback?: (err: Error | null, filenames: string[]) => void): FfmpegCommand;
    keepPixelFormat(keep?: boolean): FfmpegCommand;
    native(): FfmpegCommand;
    nativeFramerate(): FfmpegCommand;
    videoFilters(filters: string | string[] | any): FfmpegCommand;
    audioFilters(filters: string | string[] | any): FfmpegCommand;
    complexFilter(filters: string | any[]): FfmpegCommand;
    inputOptions(options: string | string[]): FfmpegCommand;
    outputOptions(options: string | string[]): FfmpegCommand;
    outputFPS(fps: number): FfmpegCommand;
    recompress(): FfmpegCommand;
    noVideo(): FfmpegCommand;
    noAudio(): FfmpegCommand;
    renice(niceness: number): FfmpegCommand;
    ffprobe(callback: (err: Error | null, data: any) => void): void;
    
    // Event handlers
    on(event: 'start', listener: (commandLine: string) => void): FfmpegCommand;
    on(event: 'codecData', listener: (data: any) => void): FfmpegCommand;
    on(event: 'progress', listener: (progress: any) => void): FfmpegCommand;
    on(event: 'stderr', listener: (stderrLine: string) => void): FfmpegCommand;
    on(event: 'error', listener: (err: Error, stdout: string, stderr: string) => void): FfmpegCommand;
    on(event: 'end', listener: () => void): FfmpegCommand;
  }

  interface FfmpegStatic {
    (input?: string | FfmpegCommand): FfmpegCommand;
    setFfmpegPath(path: string): void;
    setFfprobePath(path: string): void;
    setFlvtoolPath(path: string): void;
  }

  const ffmpeg: FfmpegStatic;
  export default ffmpeg;
  export = ffmpeg;
}

