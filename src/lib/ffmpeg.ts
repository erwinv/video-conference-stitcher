import { spawn } from 'child_process'

export async function ffmpegMux(
  inputPaths: string[],
  outputPath: string,
  complexFilter: string,
  videoOutputEncoding: string,
  audioOutputEncoding: string,
  outputStreams: string[],
  outputOpts: string[]
) {
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-v info',
      ...inputPaths.map((path) => `-i "${path}"`),
      complexFilter,
      videoOutputEncoding,
      audioOutputEncoding,
      ...outputStreams.map((stream) => `-map ${stream}`),
      ...outputOpts,
      '-y',
      outputPath,
    ],
    {
      shell: true,
      stdio: ['ignore', 'inherit', 'inherit'],
    }
  )

  return new Promise<void>((resolve, reject) => {
    ffmpeg.on('error', reject)
    ffmpeg.on('close', (code) => {
      if (code !== 0) reject(new Error(`Exit code: ${code}`))
      else resolve()
    })
  })
}
