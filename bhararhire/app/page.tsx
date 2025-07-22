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
import TranscriptionView from "../components/TranscriptionView";
import FlashCardContainer from "../components/FlashCardContainer";
import QuizContainer from "../components/QuizContainer";
import { CloseIcon } from "../components/CloseIcon";
import { NoAgentNotification } from "../components/NoAgentNotification";
import useCombinedTranscriptions from "../hooks/useCombinedTranscriptions";

interface Violation {
  type: string;
  severity: string;
  details: string;
  evidence?: string;
  timestamp: string;
}

interface ProcessCheckResponse {
  status: 'clear' | 'violations_detected' | 'error';
  severity: string;
  report: {
    timestamp: string;
    severity: string;
    violations: Violation[];
    summary: {
      totalViolations: number;
      criticalViolations: number;
      highViolations: number;
      mediumViolations: number;
      lowViolations: number;
    };
  };
  systemInfo: any;
  timestamp: string;
}

export default function Page() {
  const [room] = useState(new Room());
  const { scrollYProgress } = useScroll();
  const headerRef = useRef(null);
  const isHeaderInView = useInView(headerRef, { once: true, margin: "-100px" });
  const [isConnecting, setIsConnecting] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [processCheckStatus, setProcessCheckStatus] = useState<"idle" | "checking" | "violations" | "error">("idle");
  const [severity, setSeverity] = useState<string>("CLEAN");
  const assistantRef = useRef(null);
  const monitorIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check running processes before starting interview
  const checkProcesses = useCallback(async () => {
    try {
      const response = await fetch("/api/check-processes");
      const data: ProcessCheckResponse = await response.json();
      if (data.status === "violations_detected") {
        setViolations(data.report.violations);
        setSeverity(data.report.severity);
        setShowWarningModal(true);
        setProcessCheckStatus("violations");
        return false;
      } else if (data.status === "clear") {
        setViolations([]);
        setSeverity("CLEAN");
        setShowWarningModal(false);
        setProcessCheckStatus("clear");
        return true;
      } else {
        throw new Error("Failed to check processes");
      }
    } catch (error) {
      console.error("Process check error:", error);
      setProcessCheckStatus("error");
      alert("Failed to check running processes. Please try again.");
      return false;
    }
  }, []);

  // Monitor processes during interview
  const monitorProcesses = useCallback(async () => {
    try {
      const response = await fetch("/api/monitor-processes");
      const data: ProcessCheckResponse = await response.json();
      if (data.status === "violations_detected") {
        setViolations(data.report.violations);
        setSeverity(data.report.severity);
        setShowWarningModal(true);
        setProcessCheckStatus("violations");
        return false;
      } else if (data.status === "clear") {
        setViolations([]);
        setShowWarningModal(false);
        setProcessCheckStatus("clear");
        return true;
      } else {
        throw new Error("Failed to monitor processes");
      }
    } catch (error) {
      console.error("Process monitor error:", error);
      setProcessCheckStatus("error");
      alert("Failed to monitor running processes. Please ensure no unauthorized apps are started.");
      return false;
    }
  }, []);

  // Start monitoring during interview
  const startMonitoring = useCallback(() => {
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
    }
    monitorIntervalRef.current = setInterval(async () => {
      await monitorProcesses();
    }, 5000); // Poll every 5 seconds
  }, [monitorProcesses]);

  // Stop monitoring when interview ends
  const stopMonitoring = useCallback(() => {
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
    }
  }, []);

  const onConnectButtonClicked = useCallback(async () => {
    setIsConnecting(true);
    setProcessCheckStatus("checking");

    // Request fullscreen mode
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error("Failed to enter fullscreen:", error);
      alert("Please allow fullscreen mode to proceed with the interview.");
      setIsConnecting(false);
      return;
    }

    // Check processes
    const isClear = await checkProcesses();
    if (!isClear) {
      setIsConnecting(false);
      // Start polling for process status
      const pollInterval = setInterval(async () => {
        const clear = await checkProcesses();
        if (clear) {
          clearInterval(pollInterval);
          await proceedToConnect();
        }
      }, 5000);
      return;
    }

    await proceedToConnect();
  }, [room]);

  const proceedToConnect = useCallback(async () => {
    try {
      const url = new URL(
        process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
        window.location.origin
      );
      const response = await fetch(url.toString());
      const connectionDetailsData = await response.json();
      await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken);
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.localParticipant.setCameraEnabled(true);
      setShowAssistant(true);
      startMonitoring(); // Start continuous monitoring
      setTimeout(() => {
        assistantRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 500);
    } catch (error) {
      console.error("Connection error:", error);
      alert("Failed to connect to the interview. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  }, [room, startMonitoring]);

  // Handle tab focus and fullscreen exit detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && showAssistant) {
        alert("Please stay focused on the interview tab to continue.");
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && showAssistant) {
        alert("Please remain in fullscreen mode during the interview.");
        document.documentElement.requestFullscreen().catch(() => {
          alert("Failed to re-enter fullscreen. Please enable fullscreen to continue.");
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      stopMonitoring();
    };
  }, [showAssistant, stopMonitoring]);

  // Handle media device errors
  useEffect(() => {
    room.on(RoomEvent.MediaDevicesError, onDeviceFailure);
    return () => {
      room.off(RoomEvent.MediaDevicesError, onDeviceFailure);
    };
  }, [room]);

  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const backgroundOpacity = useTransform(scrollYProgress, [0, 0.5], [0.05, 0]);

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <motion.div
        style={{ y: backgroundY, opacity: backgroundOpacity }}
        className="absolute inset-0 pointer-events-none"
      >
        <div className="absolute top-20 left-10 w-32 h-32 bg-gradient-to-br from-orange-400 to-red-400 rounded-full blur-3xl"></div>
        <div className="absolute top-40 right-20 w-40 h-40 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full blur-3xl"></div>
        <div className="absolute bottom-40 left-1/4 w-36 h-36 bg-gradient-to-br from-green-400 to-teal-400 rounded-full blur-3xl"></div>
      </motion.div>

      <FloatingParticles />

      <AnimatePresence mode="wait">
        {!showAssistant ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >
            <div className="bg-gradient-to-r from-orange-500 via-white to-green-600 p-1">
              <div className="bg-white mx-1 rounded-lg relative overflow-hidden">
                <motion.div
                  animate={{
                    background: [
                      "linear-gradient(45deg, rgba(255,153,51,0.1) 0%, rgba(19,136,8,0.1) 100%)",
                      "linear-gradient(45deg, rgba(19,136,8,0.1) 0%, rgba(255,153,51,0.1) 100%)",
                      "linear-gradient(45deg, rgba(255,153,51,0.1) 0%, rgba(19,136,8,0.1) 100%)",
                    ],
                  }}
                  transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                />
                <header ref={headerRef} className="container mx-auto px-6 py-8 relative z-10">
                  <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={isHeaderInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="text-center mb-8"
                  >
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={isHeaderInView ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -180 }}
                      transition={{ duration: 1, delay: 0.2, type: "spring", stiffness: 200 }}
                      className="flex items-center justify-center gap-3 mb-4"
                    >
                      <motion.div
                        animate={{
                          boxShadow: [
                            "0 0 20px rgba(255,153,51,0.5)",
                            "0 0 40px rgba(19,136,8,0.5)",
                            "0 0 20px rgba(255,153,51,0.5)",
                          ],
                        }}
                        transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
                        className="w-20 h-20 bg-gradient-to-br from-orange-500 to-green-600 rounded-full flex items-center justify-center relative"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                          className="absolute inset-1 border-2 border-white/30 rounded-full"
                        />
                        <Code className="w-10 h-10 text-white" />
                      </motion.div>
                      <motion.h1
                        initial={{ opacity: 0, x: -50 }}
                        animate={isHeaderInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
                        transition={{ duration: 0.8, delay: 0.4 }}
                        className="text-6xl font-bold bg-gradient-to-r from-orange-500 via-blue-600 to-green-600 bg-clip-text text-transparent"
                      >
                        BharatHire
                      </motion.h1>
                    </motion.div>
                    <motion.p
                      initial={{ opacity: 0, y: 30 }}
                      animate={isHeaderInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                      transition={{ duration: 0.8, delay: 0.6 }}
                      className="text-xl text-gray-700 max-w-4xl mx-auto leading-relaxed"
                    >
                      India's premier AI-powered interview platform for Software Development Engineers, AI/ML
                      specialists, and tech professionals. Experience intelligent, multilingual technical assessments.
                    </motion.p>
                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={isHeaderInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                      transition={{ duration: 0.8, delay: 0.8 }}
                      className="mt-8"
                    >
                      <motion.button
                        whileHover={{
                          scale: 1.05,
                          boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
                        }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onConnectButtonClicked}
                        disabled={isConnecting}
                        className="relative bg-gradient-to-r from-orange-500 to-green-600 hover:from-orange-600 hover:to-green-700 text-white font-bold px-12 py-5 rounded-full transition-all duration-300 shadow-xl overflow-hidden group disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        <motion.div
                          animate={{
                            x: ["-100%", "100%"],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Number.POSITIVE_INFINITY,
                            ease: "linear",
                          }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                        />
                        <span className="relative z-10 flex items-center gap-2 text-lg">
                          {isConnecting ? (
                            <>
                              <LoadingSpinner /> Checking environment...
                            </>
                          ) : (
                            <>
                              <Video className="w-5 h-5" /> Start Interview
                            </>
                          )}
                        </span>
                      </motion.button>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.2, duration: 0.8 }}
                      className="mt-12 flex justify-center"
                    >
                      <motion.div
                        animate={{ y: [0, 10, 0] }}
                        transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                        className="flex flex-col items-center cursor-pointer"
                        onClick={() => {
                          window.scrollBy({
                            top: window.innerHeight * 0.6,
                            behavior: "smooth",
                          });
                        }}
                      >
                        <span className="text-gray-500 text-sm mb-2">Explore Features</span>
                        <ChevronDown className="w-6 h-6 text-gray-500" />
                      </motion.div>
                    </motion.div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={isHeaderInView ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.8, delay: 0.8 }}
                    className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
                  >
                    {[
                      {
                        icon: <Globe className="w-6 h-6" />,
                        title: "Multilingual Support",
                        description: "Hindi, English, Tamil, Telugu, Bengali",
                        color: "from-orange-500 to-orange-600",
                        delay: 0,
                      },
                      {
                        icon: <Camera className="w-6 h-6" />,
                        title: "Live Coding Assessment",
                        description: "Real-time code evaluation with webcam proctoring",
                        color: "from-blue-500 to-blue-600",
                        delay: 0.1,
                      },
                      {
                        icon: <Clock className="w-6 h-6" />,
                        title: "Ultra-Low Latency",
                        description: "~100ms response time for seamless interviews",
                        color: "from-green-500 to-green-600",
                        delay: 0.2,
                      },
                      {
                        icon: <Brain className="w-6 h-6" />,
                        title: "AI-Powered Evaluation",
                        description: "Advanced ML models for technical assessment",
                        color: "from-purple-500 to-purple-600",
                        delay: 0.3,
                      },
                    ].map((feature, index) => (
                      <FeatureCard key={index} {...feature} />
                    ))}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={isHeaderInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
                    transition={{ duration: 0.8, delay: 1.2 }}
                    className="relative"
                  >
                    <motion.div
                      animate={{
                        background: [
                          "linear-gradient(135deg, rgba(255,153,51,0.1) 0%, rgba(59,130,246,0.1) 50%, rgba(19,136,8,0.1) 100%)",
                          "linear-gradient(135deg, rgba(19,136,8,0.1) 0%, rgba(255,153,51,0.1) 50%, rgba(59,130,246,0.1) 100%)",
                          "linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(19,136,8,0.1) 50%, rgba(255,153,51,0.1) 100%)",
                        ],
                      }}
                      transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                      className="rounded-2xl p-8 backdrop-blur-sm border border-white/20 shadow-xl"
                    >
                      <motion.h3
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.4 }}
                        className="text-2xl font-bold text-gray-800 mb-6 text-center flex items-center justify-center gap-2"
                      >
                        <Sparkles className="w-6 h-6 text-yellow-500" />
                        Interview Specializations
                        <Sparkles className="w-6 h-6 text-yellow-500" />
                      </motion.h3>
                      <div className="grid md:grid-cols-2 gap-6">
                        {[
                          {
                            text: "Software Development Engineer (SDE) Interviews",
                            color: "orange-500",
                            icon: <Terminal className="w-4 h-4" />,
                          },
                          {
                            text: "AI/ML Engineer Technical Assessments",
                            color: "purple-600",
                            icon: <Brain className="w-4 h-4" />,
                          },
                          {
                            text: "Data Structures & Algorithms Evaluation",
                            color: "green-600",
                            icon: <Database className="w-4 h-4" />,
                          },
                          {
                            text: "System Design & Architecture Reviews",
                            color: "blue-600",
                            icon: <Shield className="w-4 h-4" />,
                          },
                        ].map((capability, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 1.6 + index * 0.1 }}
                            whileHover={{ scale: 1.05, x: 10 }}
                            className="flex items-center gap-3 p-3 rounded-lg bg-white/50 backdrop-blur-sm hover:bg-white/70 transition-all duration-300"
                          >
                            <motion.div
                              animate={{ rotate: [0, 360] }}
                              transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                              className={`w-8 h-8 bg-${capability.color} rounded-full flex items-center justify-center text-white`}
                            >
                              {capability.icon}
                            </motion.div>
                            <span className="text-gray-700 font-medium">{capability.text}</span>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  </motion.div>
                </header>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.main
            key="interview"
            ref={assistantRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.8 }}
            className="fixed inset-0 bg-gray-900 z-50"
          >
            <RoomContext.Provider value={room}>
              <VideoCallInterface />
            </RoomContext.Provider>
          </motion.main>
        )}
      </AnimatePresence>

      {/* Warning Modal */}
      <AnimatePresence>
        {showWarningModal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          >
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
                <h2 className="text-xl font-bold text-gray-800">
                  {severity === "CRITICAL" ? "Critical Security Violation" : "Unauthorized Activity Detected"}
                </h2>
              </div>
              <p className="text-gray-600 mb-4">
                The following issues must be resolved before {showAssistant ? "continuing" : "starting"} the interview:
              </p>
              <ul className="list-disc pl-6 mb-6 max-h-60 overflow-y-auto">
                {violations.map((violation, index) => (
                  <li key={index} className={`text-gray-700 ${violation.severity === "CRITICAL" ? "text-red-600 font-semibold" : ""}`}>
                    <strong>{violation.type}</strong>: {violation.details} (Severity: {violation.severity})
                    {violation.evidence && (
                      <span className="block text-sm text-gray-500">Evidence: {violation.evidence}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => (showAssistant ? monitorProcesses() : checkProcesses())}
                  className="bg-gradient-to-r from-orange-500 to-green-600 text-white px-4 py-2 rounded-md hover:from-orange-600 hover:to-green-700"
                >
                  Check Again
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="fixed bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-orange-500 via-white to-green-600 z-40"
      />
    </div>
  );
}

function VideoCallInterface() {
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

function LoadingSpinner() {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
    />
  );
}

function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(30)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-gradient-to-r from-orange-400 to-green-400 rounded-full opacity-20"
          animate={{
            x: [0, Math.random() * 200 - 100, 0],
            y: [0, Math.random() * 200 - 100, 0],
            scale: [1, Math.random() * 1 + 0.5, 1],
            opacity: [0.2, Math.random() * 0.6 + 0.2, 0.2],
          }}
          transition={{
            duration: Math.random() * 10 + 10,
            repeat: Number.POSITIVE_INFINITY,
            delay: Math.random() * 5,
            ease: "easeInOut",
          }}
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
        />
      ))}
    </div>
  );
}



function onDeviceFailure(error: any) {
  console.error(error);
  alert(
    "Error acquiring camera or microphone permissions. Please make sure you grant the necessary permissions in your browser and reload the tab",
  );
} 