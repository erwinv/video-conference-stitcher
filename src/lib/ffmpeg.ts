import { spawn } from 'child_process'

export async function ffmpegMux(
  inputPaths: string[],
  complexFilterGraph: string,
  outputOpts: string[],
  outputPath: string
) {
  const args = [
    ...inputPaths.map((path) => `-i ${path}`),
    complexFilterGraph,
    ...outputOpts,
    outputPath,
  ]

  const ffmpeg = spawn('ffmpeg', args, {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  return new Promise<number>((resolve, reject) => {
    ffmpeg.on('error', reject)
    ffmpeg.on('close', (code) => {
      if (code !== 0) reject(code)
      else resolve(code)
    })
  })
}
