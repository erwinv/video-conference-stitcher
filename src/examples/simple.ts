import path from 'path'
import { User, Layouts, Sequence, Media, VideoLayout } from '../index'
const { MosaicLayout } = Layouts

async function basicEncode() {
  // GET LIST OF MEDIA PER USER
  const videoFolder = path.join(__dirname, '../../videos')

  const user1Media: Media[] = [
    new Media(path.join(videoFolder, 'vid1.mp4'), 0, true, true),
    new Media(path.join(videoFolder, 'vid2.mp4'), 1000, true, true),
    new Media(path.join(videoFolder, 'vid3.mp4'), 2000, true, true),
    new Media(path.join(videoFolder, 'vid1.mp4'), 2000, true, true),
    new Media(path.join(videoFolder, 'vid2.mp4'), 3000, true, true),
  ]

  const user2Media: Media[] = [
    new Media(path.join(videoFolder, 'vid3.mp4'), 3500, true, true),
    new Media(path.join(videoFolder, 'vid1.mp4'), 7000, true, true),
    new Media(path.join(videoFolder, 'vid2.mp4'), 6000, true, true),
    new Media(path.join(videoFolder, 'vid3.mp4'), 10000, true, true),
  ]
  // CREATE USERS WITH THEIR MEDIA FILES
  const users: User[] = [
    new User('user1', user1Media, 'John'),
    new User('user2', user2Media, 'Kevin'),
  ]

  // CREATE SEQUENCE SETTINGS
  const videoLayout: VideoLayout = new MosaicLayout()
  const outputMedia: Media = new Media(
    path.join(videoFolder, 'basicOutput.webm'),
    -1,
    true,
    true
  )

  // CREATE A SEQUENCE WITH GIVEN SETTINGS
  const sequence: Sequence = new Sequence(users, outputMedia, videoLayout)

  // ENCODE THE SEQUENCE
  await sequence.encode('360p')
}

basicEncode()
