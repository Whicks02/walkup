export interface TranscodeOptions {
  /** Output format extension, no dot, e.g. "mp3". */
  targetFormat: string;
  /** Constant bitrate in kbps for lossy targets. Ignored for lossless targets. */
  bitrateKbps?: number;
}

export interface TranscodeProgress {
  /** 0-1 fraction complete, when the backend can report it. */
  fraction?: number;
}

/**
 * Platform-specific transcoding backend. Desktop implements this with native ffmpeg;
 * web implements it with ffmpeg.wasm. Core code depends only on this interface so it
 * never pulls a platform-specific binary/wasm payload into the wrong bundle.
 */
export interface Transcoder {
  transcode(
    input: { sourcePath: string } | { data: Uint8Array; sourceFormat: string },
    options: TranscodeOptions,
    onProgress?: (progress: TranscodeProgress) => void,
  ): Promise<Uint8Array>;
}
