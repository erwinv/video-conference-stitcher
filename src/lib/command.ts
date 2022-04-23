import { spawn } from 'child_process'
import { basename, dirname, extname, join } from 'path'

export async function convertJanusMjr(mjrPath: string) {
  const dir = dirname(mjrPath)
  const base = basename(mjrPath, '.mjr')
  const ext = extname(mjrPath)

  if (['.aac', '.mp4', '.opus', '.webm'].includes(ext)) {
    return mjrPath
  } else if (ext !== '.mjr') {
    throw new Error()
  }

  let outputPath: string
  if (/-audio\b/.test(base)) {
    outputPath = join(dir, base + '.opus')
  } else if (/-video\b/.test(basename(mjrPath))) {
    outputPath = join(dir, base + '.webm')
  } else {
    throw new Error()
  }

  const janusPpRec = spawn('janus-pp-rec', [mjrPath, outputPath], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  return new Promise<string>((resolve, reject) => {
    janusPpRec.on('error', reject)
    janusPpRec.on('close', (code) => {
      if (code !== 0) reject(code)
      else resolve(outputPath)
    })
  })
}

export async function ffmpegEncode(args: string[]) {
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
