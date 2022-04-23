import fs from 'fs/promises'
import path from 'path'
import { Media, User, Layouts, Sequence } from '../index'
import { convertJanusMjr } from '../lib/command'
const { MosaicLayout } = Layouts

interface ConferenceInfo {
  start_time_microsecs: number
  start_time_iso: string
  users: Array<{
    id: number
    name: string
    display: string
    sessions: Array<{
      audio?: string
      video?: string
      data?: string
      combined?: string
      start_offset_microsecs: number
    }>
  }>
  record_id: string
  participant_id: number
  conference_id: number
  conference_name: string
  subscriber_user_id: string
  iss: string
  space: string
  email: string
  is_send_email: `${boolean}`
  stop_time_microsecs: number
  stop_time_iso: string
  hostname: string
}

async function main() {
  const [, , recordingsDir, conferenceId, outputFilename] = process.argv
  const infoPath = path.join(
    recordingsDir,
    `videoroom-${conferenceId}-info.json`
  )

  const info = JSON.parse(await fs.readFile(infoPath, 'utf8')) as ConferenceInfo

  const users = await Promise.all(
    info.users.map(async (user) => {
      const userMedia = await Promise.all(
        user.sessions.flatMap((session) => {
          const media = [] as Promise<Media>[]
          const offset = session.start_offset_microsecs / 1000
          if (session.audio) {
            media.push(
              convertJanusMjr(path.join(recordingsDir, session.audio)).then(
                (audioPath) => new Media(audioPath, offset, false, true)
              )
            )
          }
          if (session.video) {
            media.push(
              convertJanusMjr(path.join(recordingsDir, session.video)).then(
                (videoPath) => new Media(videoPath, offset, true, false)
              )
            )
          }
          return media
        })
      )

      return new User(user.id, userMedia, user.display)
    })
  )

  const outputPath = path.join(
    recordingsDir,
    path.basename(outputFilename, path.extname(outputFilename)) + '.webm'
  )

  const output = new Media(outputPath, 0, true, true)
  const layout = new MosaicLayout()
  const sequence = new Sequence(users, output, layout)
  await sequence.encode()
}

main()
