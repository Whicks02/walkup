import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import type { Transcoder, TranscodeOptions, TranscodeProgress } from '@walkup/core';

let ffmpegPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

/** In-browser transcoder backed by ffmpeg.wasm (single-threaded core, no COOP/COEP required). */
export class WasmTranscoder implements Transcoder {
  async transcode(
    input: { sourcePath: string } | { data: Uint8Array; sourceFormat: string },
    options: TranscodeOptions,
    onProgress?: (progress: TranscodeProgress) => void,
  ): Promise<Uint8Array> {
    if (!('data' in input)) {
      throw new Error('WasmTranscoder requires in-memory file data, not a source path');
    }

    const ffmpeg = await getFFmpeg();
    const inputName = `input.${input.sourceFormat}`;
    const outputName = `output.${options.targetFormat}`;

    const progressHandler = ({ progress }: { progress: number }) => {
      onProgress?.({ fraction: Math.min(1, Math.max(0, progress)) });
    };
    ffmpeg.on('progress', progressHandler);

    try {
      await ffmpeg.writeFile(inputName, input.data);
      const args = ['-i', inputName, '-b:a', `${options.bitrateKbps ?? 192}k`, outputName];
      await ffmpeg.exec(args);
      const result = await ffmpeg.readFile(outputName);
      return result as Uint8Array;
    } finally {
      ffmpeg.off('progress', progressHandler);
      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});
    }
  }
}
