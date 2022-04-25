import { spawn } from 'child_process'

export function pipeExec(bin: string, commands: string[]) {
  return new Promise<void>((resolve, reject) => {
    const subprocess = spawn(bin, commands, {
      shell: true,
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    subprocess.on('error', reject)
    subprocess.on('close', (code) => {
      if (code !== 0) reject(new Error(`Exit code: ${code}`))
      else resolve()
    })
  })
}
