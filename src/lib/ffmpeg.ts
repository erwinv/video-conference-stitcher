import cuid from 'cuid'
import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

export async function ffmpegMux(
  inputPaths: string[],
  outputPath: string,
  complexFilter: string,
  videoOutputEncoding: string,
  audioOutputEncoding: string,
  outputStreams: string[]
) {
  const filterScript = join(tmpdir(), cuid())
  await writeFile(filterScript, complexFilter)

  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-v info',
      ...inputPaths.map((path) => `-i "${path}"`),
      `-filter_complex_script ${filterScript}`,
      videoOutputEncoding,
      audioOutputEncoding,
      ...outputStreams.map((stream) => `-map ${stream}`),
      '-y',
      outputPath,
    ],
    {
      shell: true,
      stdio: ['ignore', 'inherit', 'inherit'],
    }
  )

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg.on('error', reject)
      ffmpeg.on('close', (code) => {
        if (code !== 0) reject(new Error(`Exit code: ${code}`))
        else resolve()
      })
    })
  } finally {
    await unlink(filterScript)
  }
}

export async function ffprobe(path: string, entry: string) {
  const ffprobe = spawn(
    'ffprobe',
    [
      '-v error',
      `-show_entries ${entry}`,
      '-of default=noprint_wrappers=1:nokey=1',
      `"${path}"`,
    ],
    { shell: true, stdio: ['ignore', 'pipe', 'inherit'] }
  )

  return new Promise<string>((resolve, reject) => {
    ffprobe.stdout.on('data', resolve)
    ffprobe.on('error', reject)
    ffprobe.on('close', (code) => {
      if (code !== 0) reject()
    })
  })
}
