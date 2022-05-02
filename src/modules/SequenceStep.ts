import _ from 'lodash'
import Media from './Media'
import { Size, VideoLayout, VideoBox } from '../types/Types'
import { User } from '..'

export default class SequenceStep {
  public readonly id: string
  public readonly mediaList: Media[]
  public readonly startTime: number
  public readonly duration: number
  public readonly size: Size
  private readonly layout: VideoLayout

  constructor(
    id: string,
    mediaList: Media[],
    startTime: number,
    endTime: number,
    size: Size,
    layout: VideoLayout
  ) {
    this.id = id
    this.mediaList = mediaList
    this.startTime = startTime
    this.duration = endTime - startTime
    this.size = size
    this.layout = layout
  }

  generateFilter() {
    const mostRecentPresentation = _.chain(this.mediaList)
      .filter((media) => media.isPresentation)
      .sortBy((vid) => vid.startTime)
      .last()
      .value()

    // All generated videos. Audio without linked video and video files
    const videoList = mostRecentPresentation
      ? [mostRecentPresentation]
      : this.mediaList.filter(
          (media) =>
            media.hasVideo ||
            (media.hasAudio &&
              !media.hasVideo &&
              !this.mediaList.some(
                (other) =>
                  other.hasVideo &&
                  media.user &&
                  other.user?.id === media.user?.id
              ))
        )
    if (videoList.length > 9) {
      videoList.splice(9)
    }

    // TODO I assume videos are sorted by their id small to big
    const boxes: VideoBox[] = this.layout.getBoxes(videoList.length, this.size)
    // if(this.getDuration() < 30) return `nullsrc=s=${this.size.w}x${this.size.h}:d=${this.getDuration()/1000}[${this.id}_out_v];anullsrc,atrim=0:${this.getDuration()/1000}[${this.id}_out_a];`

    const out: string[] = []

    const bg = `color=s=${this.size.w}x${this.size.h},trim=0:${
      this.duration / 1000
    }`

    if (videoList.length === 0) {
      out.push(`${bg}[${this.id}_out_v];`)
    } else {
      out.push(`${bg}[${this.id}_bg];`)
    }

    // --------------- TRIM/SCALE VIDEOS ----------------------- //
    videoList.forEach((vid, ind) => {
      const box = boxes[ind]
      // Trim video
      if (vid.hasVideo) {
        const startOffset = (this.startTime - vid.startTime) / 1000
        const endOffset =
          (this.duration + this.startTime - vid.startTime) / 1000
        const trimmedVid = `[${vid.id}:v]trim=${startOffset}:${endOffset},setpts=PTS-STARTPTS,`
        out.push(trimmedVid)
      } else {
        out.push(
          `color=s=${this.size.w}x${this.size.h}:c=green@1.0,trim=0:${
            this.duration / 1000
          },drawtext=text='${
            vid.user?.name ?? ''
          }':x=(w-tw)/2:y=((h-th)/2):fontfile=/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf:fontcolor=black:fontsize=55,`
        )
      }
      // scale fit in box
      out.push(
        `scale=w='if(gt(iw/ih,${box.w}/(${box.h})),${box.w},-2)':h='if(gt(iw/ih,${box.w}/(${box.h})),-2,${box.h})':eval=init[${this.id}_${vid.id}_v];`
      )
    })

    // ---------------- OVERLAY VIDEOS ----------------------- //
    let prevVideoId = -1
    videoList.forEach((vid, ind) => {
      const box = boxes[ind]
      let keyOut: string
      // set as output of sequence step if last video in list
      if (ind + 1 === videoList.length) {
        keyOut = `${this.id}_out_v`
      } else {
        keyOut = `${this.id}_overlay_${vid.id}`
      }
      // set input background if first video and link other videos to their previous
      let keyIn: string
      if (prevVideoId === -1) {
        keyIn = `${this.id}_bg`
      } else {
        keyIn = `${this.id}_overlay_${prevVideoId}`
      }
      out.push(
        `[${keyIn}][${this.id}_${vid.id}_v]overlay=x='(${box.w}-w)/2+${
          box.x
        }':y='(${box.h}-h)/2+${box.y}':eval=init${
          prevVideoId === -1 ? ':shortest=1' : ''
        }[${keyOut}];`
      )

      prevVideoId = vid.id
    })

    // -----------   TRIM AUDIO  ---------------- //
    const audioList = this.mediaList.filter((media) => media.hasAudio)
    audioList.forEach((aud) => {
      const startOffset = (this.startTime - aud.startTime) / 1000
      const endOffset = (this.duration + this.startTime - aud.startTime) / 1000
      out.push(
        `[${aud.id}:a]atrim=${startOffset}:${endOffset},asetpts=PTS-STARTPTS[${this.id}_${aud.id}_a];`
      )
    })

    // -----------  MIX AUDIO ------------ //

    const inputList = audioList
      .map((aud) => `[${this.id}_${aud.id}_a]`)
      .join('')

    let c0 = ''
    let c1 = ''
    let currentIndex = 0
    audioList.forEach((aud, ind) => {
      const plus: string = ind === audioList.length - 1 ? '' : '+'
      if (aud.audioChannels === 6) {
        c0 += `0.4*c${currentIndex}+0.6*c${currentIndex + 2}${plus}`
        c1 += `0.4*c${currentIndex + 1}+0.6*c${currentIndex + 2}${plus}`
      } else {
        c0 += `c${currentIndex}${plus}`
        c1 += `c${currentIndex + 1}${plus}`
      }
      currentIndex += aud.audioChannels
    })
    if (audioList.length > 0) {
      out.push(
        `${inputList}amerge=inputs=${audioList.length},pan='stereo|c0<${c0}|c1<${c1}'[${this.id}_out_a];`
      )
    } else {
      // TODO what sample rate to choose? Maybe need to convert all sample rates of files before concat
      out.push(
        `anullsrc=r=48000:cl=stereo,atrim=0:${
          this.duration / 1000
        },asetpts=PTS-STARTPTS[${this.id}_out_a];`
      )
    }

    return out
  }
}
