import { useLocalParticipant, useTracks } from "@livekit/components-react"
import { Track } from "livekit-client"

export default function useLocalMicTrack() {
  const { localParticipant } = useLocalParticipant()
  const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false })

  const localMicTrack = micTracks.find((track) => track.participant === localParticipant)

  return localMicTrack
}
