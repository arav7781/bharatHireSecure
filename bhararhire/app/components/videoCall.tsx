
"use client"

import React, { useCallback, useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, useScroll, useTransform, useInView } from "framer-motion";
import {
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  VoiceAssistantControlBar,
  useRoomContext,
  useVoiceAssistant,
  useLocalParticipant,
  useTracks,
} from "@livekit/components-react";
import { Room, RoomEvent, Track } from "livekit-client";
import {
  Code,
  Camera,
  Clock,
  Globe,
  Mic,
  Sparkles,
  Shield,
  ChevronDown,
  Brain,
  Terminal,
  Database,
  Video,
  CameraOff,
  MicOff,
  Send,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";

export default function VideoCallInterface() {
    const { state: agentState, agent, videoTrack: agentVideoTrack, audioTrack: agentAudioTrack } = useVoiceAssistant();
    const { localParticipant } = useLocalParticipant();
    const [chatInput, setChatInput] = useState("");
    const [isCameraEnabled, setIsCameraEnabled] = useState(true);
    const [isMicEnabled, setIsMicEnabled] = useState(true);
    const room = useRoomContext();
  
    const userVideoTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const userVideoTrack = userVideoTracks.find((track) => track.participant === localParticipant);
  
    const toggleCamera = useCallback(async () => {
      try {
        await localParticipant.setCameraEnabled(!isCameraEnabled);
        setIsCameraEnabled(!isCameraEnabled);
      } catch (error) {
        console.error("Error toggling camera:", error);
      }
    }, [localParticipant, isCameraEnabled]);
  
    const toggleMicrophone = useCallback(async () => {
      try {
        await localParticipant.setMicrophoneEnabled(!isMicEnabled);
        setIsMicEnabled(!isMicEnabled);
      } catch (error) {
        console.error("Error toggling microphone:", error);
      }
    }, [localParticipant, isMicEnabled]);
  
    const handleSendMessage = async () => {
      if (!chatInput.trim()) return;
      if (!agent) {
        alert("No agent connected. Please ensure the agent is running and try again.");
        return;
      }
  
      const messageText = chatInput;
      setChatInput("");
  
      try {
        console.log(`Sending message to agent ${agent.identity}: ${messageText}`);
        const result = await room.localParticipant.performRpc({
          destinationIdentity: agent.identity,
          method: "agent.textMessage",
          payload: JSON.stringify({ message: messageText }),
        });
        console.log(`Message submission result: ${result}`);
      } catch (error) {
        console.error("Error sending message:", error);
        alert(`Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    };
  
    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && chatInput.trim()) {
        handleSendMessage();
      }
    };
  
    return (
      <div className="h-screen flex bg-gray-900 text-white">
        <div className="flex-1 flex flex-col">
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center justify-between p-4 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700"
          >
            <div className="flex items-center gap-3">
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 10px rgba(255,153,51,0.5)",
                    "0 0 20px rgba(19,136,8,0.5)",
                    "0 0 10px rgba(255,153,51,0.5)",
                  ],
                }}
                transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
                className="w-10 h-10 bg-gradient-to-br from-orange-500 to-green-600 rounded-full flex items-center justify-center"
              >
                <Code className="w-5 h-5 text-white" />
              </motion.div>
              <div>
                <h1 className="text-xl font-bold">BharatHire AI Interview</h1>
                <p className="text-sm text-gray-400">
                  {agentState === "listening" && "🎤 Listening..."}
                  {agentState === "thinking" && "🤔 Thinking..."}
                  {agentState === "speaking" && "🗣️ Speaking..."}
                  {agentState === "connecting" && "🔄 Connecting..."}
                  {agentState === "disconnected" && "❌ Disconnected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleCamera}
                className={`p-2 rounded-lg transition-colors ${
                  isCameraEnabled ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isCameraEnabled ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleMicrophone}
                className={`p-2 rounded-lg transition-colors ${
                  isMicEnabled ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </motion.button>
              <motion.div whileHover={{ scale: 1.05 }} className="bg-gray-700 rounded-full p-2">
                <VoiceAssistantControlBar controls={{ leave: false }} />
              </motion.div>
              <motion.div whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}>
                <DisconnectButton className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full transition-all duration-200 shadow-lg">
                  <CloseIcon />
                </DisconnectButton>
              </motion.div>
            </div>
          </motion.div>
          <div className="flex-1 relative p-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8 }}
              className="h-full rounded-xl overflow-hidden bg-gray-800"
            >
              {agentState === "disconnected" ? (
                <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                      rotate: [0, 5, -5, 0],
                    }}
                    transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                    className="relative mb-8"
                  >
                    <motion.div
                      animate={{
                        boxShadow: [
                          "0 0 30px rgba(255,153,51,0.3)",
                          "0 0 60px rgba(19,136,8,0.3)",
                          "0 0 30px rgba(255,153,51,0.3)",
                        ],
                      }}
                      transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
                      className="w-32 h-32 bg-gradient-to-r from-orange-500 via-blue-600 to-green-600 rounded-full flex items-center justify-center relative"
                    >
                      <Code className="w-16 h-16 text-white" />
                    </motion.div>
                  </motion.div>
                  <h3 className="text-3xl font-bold mb-4">AI Interviewer Ready</h3>
                  <p className="text-gray-400 text-center max-w-md">
                    Your AI interviewer is connected and ready to conduct your technical interview.
                  </p>
                </div>
              ) : agentVideoTrack ? (
                <div className="h-full relative bg-black rounded-lg overflow-hidden">
                  <VideoTrack trackRef={agentVideoTrack} className="w-full h-full object-cover" />
                  <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2">
                    <p className="text-sm font-medium">AI Interviewer</p>
                    <p className="text-xs text-gray-300">BharatHire Assistant</p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg">
                  <div className="text-center">
                    <motion.div
                      animate={{
                        scale: [1, 1.2, 1],
                      }}
                      transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                      className="w-24 h-24 bg-gradient-to-r from-orange-500 to-green-600 rounded-full flex items-center justify-center mb-4 mx-auto"
                    >
                      <Mic className="w-12 h-12 text-white" />
                    </motion.div>
                    <BarVisualizer
                      state={agentState}
                      barCount={12}
                      trackRef={agentAudioTrack}
                      className="interviewer-visualizer mb-4"
                      options={{
                        minHeight: 4,
                        maxHeight: 40,
                      }}
                    />
                    <p className="text-lg font-medium">AI Interviewer</p>
                    <p className="text-sm text-gray-400">Audio Only Mode</p>
                  </div>
                </div>
              )}
              <motion.div
                initial={{ scale: 0, x: 100, y: 100 }}
                animate={{ scale: 1, x: 0, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="absolute bottom-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden border-2 border-gray-600 shadow-2xl"
              >
                {isCameraEnabled && userVideoTrack ? (
                  <div className="relative h-full">
                    <VideoTrack trackRef={userVideoTrack} className="w-full h-full object-cover" />
                    <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-1">
                      <p className="text-xs font-medium">You</p>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
                    <CameraOff className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="text-xs text-gray-400 text-center px-2">
                      {!isCameraEnabled ? "Camera disabled" : "Camera not available"}
                    </p>
                  </div>
                )}
              </motion.div>
            </motion.div>
          </div>
        </div>
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col"
        >
          <div className="p-4 border-b border-gray-700 bg-gray-800/90 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold">Interview Transcript</h2>
            </div>
            <p className="text-sm text-gray-400">Live conversation with AI interviewer</p>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <TranscriptionView userMessages={useCombinedTranscriptions()} />
          </div>
          <div className="p-4 border-t border-gray-700 bg-gray-800/90 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message or question..."
                  className="w-full p-3 pr-12 rounded-lg border border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || agentState === "connecting"}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-gradient-to-r from-orange-500 to-green-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:from-orange-600 hover:to-green-700 transition-all duration-200"
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Press Enter to send • Voice responses will appear automatically</p>
          </div>
        </motion.div>
        <FlashCardContainer />
        <QuizContainer />
        <RoomAudioRenderer />
        <NoAgentNotification state={agentState} />
        <style jsx global>{`
          .interviewer-visualizer .lk-audio-visualizer-bar {
            background: linear-gradient(to top, #ff9933, #138808);
            border-radius: 2px;
            margin: 0 1px;
          }
        `}</style>
      </div>
    );
  }