"use client"

import type React from "react"
import { useCallback, useEffect, useState, useRef } from "react"
import { motion, AnimatePresence, useScroll, useTransform, useInView } from "framer-motion"
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
} from "@livekit/components-react"
import { Room, RoomEvent, Track } from "livekit-client"
import {
  Code,
  Camera,
  Mic,
  Shield,
  Brain,
  CameraOff,
  MicOff,
  Send,
  MessageSquare,
  AlertTriangle,
  Eye,
  Fingerprint,
  Lock,
  Wifi,
  Monitor,
  Headphones,
  Keyboard,
  MousePointer,
  Activity,
  X,
  RefreshCw,
  Play,
} from "lucide-react"
import TranscriptionView from "../components/TranscriptionView"
import FlashCardContainer from "../components/FlashCardContainer"
import QuizContainer from "../components/QuizContainer"
import { CloseIcon } from "../components/CloseIcon"
import { NoAgentNotification } from "../components/NoAgentNotification"
import useCombinedTranscriptions from "../hooks/useCombinedTranscriptions"

interface Violation {
  type: string
  severity: string
  details: string
  evidence?: string
  timestamp: string
  confidence?: number
  aiDetected?: boolean
}

interface ProcessCheckResponse {
  status: "clear" | "violations_detected" | "error"
  severity: string
  report: {
    timestamp: string
    severity: string
    violations: Violation[]
    summary: {
      totalViolations: number
      criticalViolations: number
      highViolations: number
      mediumViolations: number
      lowViolations: number
    }
  }
  systemInfo: any
  timestamp: string
}

interface BiometricData {
  faceDetected: boolean
  eyeTracking: { x: number; y: number }
  headPose: { pitch: number; yaw: number; roll: number }
  attentionScore: number
}

interface BehaviorMetrics {
  tabSwitches: number
  rightClicks: number
  keystrokes: number
  mouseMovements: number
  idleTime: number
  suspiciousActivity: number
}

export default function Page() {
  const [room] = useState(new Room())
  const { scrollYProgress } = useScroll()
  const headerRef = useRef(null)
  const isHeaderInView = useInView(headerRef, { once: true, margin: "-100px" })

  // Security states
  const [isConnecting, setIsConnecting] = useState(false)
  const [showAssistant, setShowAssistant] = useState(false)
  const [violations, setViolations] = useState<Violation[]>([])
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [processCheckStatus, setProcessCheckStatus] = useState<"idle" | "checking" | "violations" | "error">("idle")
  const [severity, setSeverity] = useState<string>("CLEAN")

  // Enhanced security states
  const [biometricData, setBiometricData] = useState<BiometricData>({
    faceDetected: false,
    eyeTracking: { x: 0, y: 0 },
    headPose: { pitch: 0, yaw: 0, roll: 0 },
    attentionScore: 100,
  })
  const [behaviorMetrics, setBehaviorMetrics] = useState<BehaviorMetrics>({
    tabSwitches: 0,
    rightClicks: 0,
    keystrokes: 0,
    mouseMovements: 0,
    idleTime: 0,
    suspiciousActivity: 0,
  })
  const [securityScore, setSecurityScore] = useState(100)
  const [isProctoring, setIsProctoring] = useState(false)

  // Process termination states
  const [isTerminating, setIsTerminating] = useState(false)
  const [terminationResults, setTerminationResults] = useState<any>(null)
  const [isRechecking, setIsRechecking] = useState(false)

  // Refs
  const assistantRef = useRef(null)
  const monitorIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const biometricIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const behaviorIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastActivityRef = useRef(Date.now())

  // Enhanced process checking with AI-powered analysis
  const checkProcesses = useCallback(async () => {
    try {
      setIsRechecking(true)
      const sessionId = sessionStorage.getItem("interview-session") || crypto.randomUUID()
      sessionStorage.setItem("interview-session", sessionId)

      const response = await fetch("/api/check-processes", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": crypto.randomUUID(),
          "X-Session-ID": sessionId,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: ProcessCheckResponse = await response.json()

      if (data.status === "violations_detected") {
        setViolations(data.report.violations)
        setSeverity(data.report.severity)
        setShowWarningModal(true)
        setProcessCheckStatus("violations")

        // Update security score based on violations
        const scoreReduction = data.report.violations.reduce((acc, violation) => {
          switch (violation.severity) {
            case "CRITICAL":
              return acc + 30
            case "HIGH":
              return acc + 20
            case "MEDIUM":
              return acc + 10
            case "LOW":
              return acc + 5
            default:
              return acc
          }
        }, 0)
        setSecurityScore((prev) => Math.max(0, prev - scoreReduction))

        setIsRechecking(false)
        return false
      } else if (data.status === "clear") {
        setViolations([])
        setSeverity("CLEAN")
        setShowWarningModal(false)
        setProcessCheckStatus("clear" as "idle" | "checking" | "violations" | "error")
        setTerminationResults(null) // Clear previous results
        setIsRechecking(false)
        return true
      } else {
        throw new Error("Failed to check processes")
      }
    } catch (error) {
      console.error("Process check error:", error)
      setProcessCheckStatus("error")
      setIsRechecking(false)
      alert("Failed to check running processes. Please try again.")
      return false
    }
  }, [])

  // Terminate detected processes
  const terminateProcesses = useCallback(
    async (processIds: number[]) => {
      if (!processIds || processIds.length === 0) {
        alert("No processes to terminate")
        return null
      }

      setIsTerminating(true)
      setTerminationResults(null)

      try {
        const sessionId = sessionStorage.getItem("interview-session")
        const response = await fetch("/api/terminate-processes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-ID": sessionId || "",
          },
          body: JSON.stringify({
            processIds,
            sessionId: sessionId,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const results = await response.json()
        setTerminationResults(results)

        // Wait a moment then recheck processes
        setTimeout(async () => {
          await checkProcesses()
          setIsTerminating(false)
        }, 3000)

        return results
      } catch (error) {
        console.error("Process termination error:", error)
        alert("Failed to terminate processes. Please close them manually and try again.")
        setIsTerminating(false)
        return null
      }
    },
    [checkProcesses],
  )

  // Enhanced monitoring with behavioral analysis
  const monitorProcesses = useCallback(async () => {
    try {
      const response = await fetch("/api/monitor-processes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": crypto.randomUUID(),
          "X-Session-ID": sessionStorage.getItem("interview-session") || "",
        },
        body: JSON.stringify({
          biometricData,
          behaviorMetrics,
          securityScore,
          timestamp: new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: ProcessCheckResponse = await response.json()

      if (data.status === "violations_detected") {
        setViolations(data.report.violations)
        setSeverity(data.report.severity)
        setShowWarningModal(true)
        setProcessCheckStatus("violations")
        return false
      } else if (data.status === "clear") {
        setViolations([])
        setShowWarningModal(false)
        setProcessCheckStatus("clear" as "idle" | "checking" | "violations" | "error")
        return true
      } else {
        throw new Error("Failed to monitor processes")
      }
    } catch (error) {
      console.error("Process monitor error:", error)
      setProcessCheckStatus("error")
      return false
    }
  }, [biometricData, behaviorMetrics, securityScore])

  // Biometric monitoring using face detection
  const startBiometricMonitoring = useCallback(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn("Media devices not supported")
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }

        biometricIntervalRef.current = setInterval(() => {
          if (videoRef.current && canvasRef.current) {
            const canvas = canvasRef.current
            const ctx = canvas.getContext("2d")
            if (ctx) {
              canvas.width = videoRef.current.videoWidth
              canvas.height = videoRef.current.videoHeight
              ctx.drawImage(videoRef.current, 0, 0)

              // Simple face detection (in production, use a proper face detection library)
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
              const faceDetected = detectFace(imageData)

              setBiometricData((prev) => ({
                ...prev,
                faceDetected,
                attentionScore: faceDetected
                  ? Math.min(100, prev.attentionScore + 1)
                  : Math.max(0, prev.attentionScore - 2),
              }))

              // Log biometric violations
              if (!faceDetected) {
                fetch("/api/audit-logs", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "FACE_NOT_DETECTED",
                    severity: "HIGH",
                    details: "Candidate's face not detected in video feed",
                    timestamp: new Date().toISOString(),
                    confidence: 0.9,
                  }),
                })
              }
            }
          }
        }, 1000)
      })
      .catch((error) => {
        console.error("Error accessing camera for biometric monitoring:", error)
      })
  }, [])

  // Simple face detection (placeholder - use proper ML library in production)
  const detectFace = (imageData: ImageData): boolean => {
    // This is a simplified placeholder. In production, use libraries like:
    // - MediaPipe Face Detection
    // - TensorFlow.js Face Detection
    // - OpenCV.js
    const data = imageData.data
    let skinPixels = 0

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // Simple skin color detection
      if (
        r > 95 &&
        g > 40 &&
        b > 20 &&
        Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
        Math.abs(r - g) > 15 &&
        r > g &&
        r > b
      ) {
        skinPixels++
      }
    }

    return skinPixels > (data.length / 4) * 0.02 // At least 2% skin pixels
  }

  // Behavioral monitoring
  const startBehaviorMonitoring = useCallback(() => {
    let keystrokeCount = 0
    let mouseMoveCount = 0
    let rightClickCount = 0
    let tabSwitchCount = 0

    const handleKeydown = (e: KeyboardEvent) => {
      keystrokeCount++
      lastActivityRef.current = Date.now()

      // Detect suspicious key combinations
      if (e.ctrlKey || e.altKey || e.metaKey) {
        if (e.key === "c" || e.key === "v" || e.key === "a" || e.key === "s") {
          fetch("/api/audit-logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "SUSPICIOUS_KEYBOARD_SHORTCUT",
              severity: "HIGH",
              details: `Suspicious key combination: ${e.ctrlKey ? "Ctrl+" : ""}${e.altKey ? "Alt+" : ""}${e.metaKey ? "Cmd+" : ""}${e.key}`,
              timestamp: new Date().toISOString(),
            }),
          })
        }
      }

      // Detect F12 (Developer Tools)
      if (e.key === "F12" || (e.ctrlKey && e.shiftKey && e.key === "I")) {
        e.preventDefault()
        fetch("/api/audit-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "DEVELOPER_TOOLS_ATTEMPT",
            severity: "CRITICAL",
            details: "Attempt to open developer tools detected",
            timestamp: new Date().toISOString(),
          }),
        })
      }
    }

    const handleMouseMove = () => {
      mouseMoveCount++
      lastActivityRef.current = Date.now()
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      rightClickCount++
      fetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "RIGHT_CLICK_ATTEMPT",
          severity: "MEDIUM",
          details: "Right-click context menu attempt",
          timestamp: new Date().toISOString(),
        }),
      })
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        tabSwitchCount++
        fetch("/api/audit-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "TAB_SWITCH",
            severity: "HIGH",
            details: "User switched away from interview tab",
            timestamp: new Date().toISOString(),
          }),
        })
      }
    }

    // Add event listeners
    document.addEventListener("keydown", handleKeydown)
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("contextmenu", handleContextMenu)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    // Update behavior metrics periodically
    behaviorIntervalRef.current = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current

      setBehaviorMetrics((prev) => ({
        keystrokes: keystrokeCount,
        mouseMovements: mouseMoveCount,
        rightClicks: rightClickCount,
        tabSwitches: tabSwitchCount,
        idleTime: idleTime,
        suspiciousActivity: prev.suspiciousActivity + (idleTime > 30000 ? 1 : 0),
      }))

      // Reset counters
      keystrokeCount = 0
      mouseMoveCount = 0
    }, 5000)

    return () => {
      document.removeEventListener("keydown", handleKeydown)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("contextmenu", handleContextMenu)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  // Enhanced monitoring with multiple security layers
  const startMonitoring = useCallback(() => {
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current)
    }

    setIsProctoring(true)
    startBiometricMonitoring()
    const cleanupBehavior = startBehaviorMonitoring()

    monitorIntervalRef.current = setInterval(async () => {
      const isClear = await monitorProcesses()

      // Calculate dynamic security score
      const currentScore =
        100 -
        behaviorMetrics.tabSwitches * 5 -
        behaviorMetrics.rightClicks * 2 -
        behaviorMetrics.suspiciousActivity * 10 -
        (biometricData.faceDetected ? 0 : 20)

      setSecurityScore(Math.max(0, currentScore))

      // Terminate interview on critical violations or low security score
      if ((!isClear && severity === "CRITICAL") || currentScore < 20) {
        stopMonitoring()
        room.disconnect()
        setShowAssistant(false)
        alert("Interview terminated due to critical security violations.")
      }
    }, 3000) // More frequent monitoring

    return cleanupBehavior
  }, [monitorProcesses, room, severity, behaviorMetrics, biometricData])

  // Stop all monitoring
  const stopMonitoring = useCallback(() => {
    setIsProctoring(false)

    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current)
      monitorIntervalRef.current = null
    }

    if (biometricIntervalRef.current) {
      clearInterval(biometricIntervalRef.current)
      biometricIntervalRef.current = null
    }

    if (behaviorIntervalRef.current) {
      clearInterval(behaviorIntervalRef.current)
      behaviorIntervalRef.current = null
    }

    // Stop video stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Enhanced connection with security verification
  const proceedToConnect = useCallback(async () => {
    try {
      setIsConnecting(true)
      // Generate session ID if not exists
      let sessionId = sessionStorage.getItem("interview-session")
      if (!sessionId) {
        sessionId = crypto.randomUUID()
        sessionStorage.setItem("interview-session", sessionId)
      }

      const url = new URL(
        process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
        window.location.origin,
      )

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": crypto.randomUUID(),
          "X-Session-ID": sessionId,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const connectionDetailsData = await response.json()

      await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken)
      await room.localParticipant.setMicrophoneEnabled(true)
      await room.localParticipant.setCameraEnabled(true)

      setShowAssistant(true)
      setShowWarningModal(false) // Close the warning modal
      const cleanupBehavior = startMonitoring()

      setTimeout(() => {
        assistantRef.current?.scrollIntoView({ behavior: "smooth" })
      }, 500)

      setIsConnecting(false)
      // Cleanup function
      return cleanupBehavior
    } catch (error) {
      console.error("Connection error:", error)
      alert("Failed to connect to the interview. Please try again.")
      setIsConnecting(false)
    }
  }, [room, startMonitoring])

  // Enhanced connection with comprehensive security checks
  const onConnectButtonClicked = useCallback(async () => {
    setIsConnecting(true)
    setProcessCheckStatus("checking")

    try {
      // Request fullscreen mode
      await document.documentElement.requestFullscreen()
    } catch (error) {
      console.error("Failed to enter fullscreen:", error)
      alert("Please allow fullscreen mode to proceed with the interview.")
      setIsConnecting(false)
      return
    }

    // Disable right-click and other shortcuts
    document.addEventListener("contextmenu", (e) => e.preventDefault())
    document.addEventListener("selectstart", (e) => e.preventDefault())
    document.addEventListener("dragstart", (e) => e.preventDefault())

    // Check processes and system security
    const isClear = await checkProcesses()
    if (!isClear) {
      setIsConnecting(false)
      return
    }

    await proceedToConnect()
  }, [checkProcesses, proceedToConnect])

  // Enhanced security monitoring effects
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && showAssistant) {
        setBehaviorMetrics((prev) => ({ ...prev, tabSwitches: prev.tabSwitches + 1 }))
        alert("Please stay focused on the interview tab to continue.")
      }
    }

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && showAssistant) {
        alert("Please remain in fullscreen mode during the interview.")
        document.documentElement.requestFullscreen().catch(() => {
          alert("Failed to re-enter fullscreen. Please enable fullscreen to continue.")
        })
      }
    }

    const handleDevToolsDetection = () => {
      const threshold = 160
      if (window.outerHeight - window.innerHeight > threshold || window.outerWidth - window.innerWidth > threshold) {
        fetch("/api/audit-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "DEVELOPER_TOOLS_DETECTED",
            severity: "CRITICAL",
            details: "Developer tools window detected",
            timestamp: new Date().toISOString(),
          }),
        })
      }
    }

    if (showAssistant) {
      document.addEventListener("visibilitychange", handleVisibilityChange)
      document.addEventListener("fullscreenchange", handleFullscreenChange)

      // Check for developer tools every 500ms
      const devToolsInterval = setInterval(handleDevToolsDetection, 500)

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange)
        document.removeEventListener("fullscreenchange", handleFullscreenChange)
        clearInterval(devToolsInterval)
        stopMonitoring()
      }
    }
  }, [showAssistant, stopMonitoring])

  // Handle media device errors
  useEffect(() => {
    const handleDeviceError = (error: any) => {
      console.error("Media device error:", error)
      alert(
        "Error acquiring camera or microphone permissions. Please grant the necessary permissions and reload the page.",
      )
      fetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "MEDIA_DEVICE_ERROR",
          severity: "CRITICAL",
          details: `Media device error: ${error.message}`,
          timestamp: new Date().toISOString(),
        }),
      })
    }

    room.on(RoomEvent.MediaDevicesError, handleDeviceError)
    return () => {
      room.off(RoomEvent.MediaDevicesError, handleDeviceError)
    }
  }, [room])

  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "50%"])
  const backgroundOpacity = useTransform(scrollYProgress, [0, 0.5], [0.05, 0])

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Hidden elements for biometric monitoring */}
      <video ref={videoRef} style={{ display: "none" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

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
                      India's most advanced AI-powered interview platform with military-grade anti-cheating protection.
                      Experience intelligent, multilingual technical assessments with biometric verification, behavioral
                      analysis, and real-time security monitoring.
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
                              <LoadingSpinner /> Initializing Security...
                            </>
                          ) : (
                            <>
                              <Shield className="w-5 h-5" /> Start Secure Interview
                            </>
                          )}
                        </span>
                      </motion.button>
                    </motion.div>
                  </motion.div>

                  {/* Enhanced Security Features Grid */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={isHeaderInView ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.8, delay: 0.8 }}
                    className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
                  >
                    {[
                      {
                        icon: <Eye className="w-6 h-6" />,
                        title: "Biometric Verification",
                        description: "Face detection, eye tracking, and attention monitoring",
                        color: "from-purple-500 to-purple-600",
                        delay: 0,
                      },
                      {
                        icon: <Activity className="w-6 h-6" />,
                        title: "Behavioral Analysis",
                        description: "Real-time keystroke and mouse pattern analysis",
                        color: "from-blue-500 to-blue-600",
                        delay: 0.1,
                      },
                      {
                        icon: <Monitor className="w-6 h-6" />,
                        title: "Screen Monitoring",
                        description: "Multi-monitor detection and screen sharing prevention",
                        color: "from-green-500 to-green-600",
                        delay: 0.2,
                      },
                      {
                        icon: <Wifi className="w-6 h-6" />,
                        title: "Network Security",
                        description: "VPN detection and suspicious connection monitoring",
                        color: "from-orange-500 to-orange-600",
                        delay: 0.3,
                      },
                    ].map((feature, index) => (
                      <FeatureCard key={index} {...feature} />
                    ))}
                  </motion.div>

                  {/* Advanced Security Features */}
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
                        <Shield className="w-6 h-6 text-blue-500" />
                        Advanced Security Features
                        <Lock className="w-6 h-6 text-green-500" />
                      </motion.h3>

                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                          {
                            text: "AI-Powered Process Detection",
                            color: "red-500",
                            icon: <Brain className="w-4 h-4" />,
                          },
                          {
                            text: "Real-time Biometric Authentication",
                            color: "purple-600",
                            icon: <Fingerprint className="w-4 h-4" />,
                          },
                          {
                            text: "Behavioral Pattern Analysis",
                            color: "blue-600",
                            icon: <Activity className="w-4 h-4" />,
                          },
                          {
                            text: "Multi-layer Audio Monitoring",
                            color: "green-600",
                            icon: <Headphones className="w-4 h-4" />,
                          },
                          {
                            text: "Advanced Keystroke Detection",
                            color: "orange-600",
                            icon: <Keyboard className="w-4 h-4" />,
                          },
                          {
                            text: "Mouse Movement Tracking",
                            color: "pink-600",
                            icon: <MousePointer className="w-4 h-4" />,
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
              <VideoCallInterface
                securityScore={securityScore}
                biometricData={biometricData}
                behaviorMetrics={behaviorMetrics}
                isProctoring={isProctoring}
                onStopMonitoring={stopMonitoring}
              />
            </RoomContext.Provider>
          </motion.main>
        )}
      </AnimatePresence>

      {/* Enhanced Warning Modal with Process Termination */}
      <AnimatePresence>
        {showWarningModal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          >
            <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className={`w-6 h-6 ${severity === "CRITICAL" ? "text-red-500" : "text-yellow-500"}`} />
                <h2 className="text-xl font-bold text-gray-800">
                  {severity === "CRITICAL" ? "Critical Security Violation" : "Security Alert"}
                </h2>
                <div
                  className={`ml-auto px-3 py-1 rounded-full text-sm font-medium ${
                    severity === "CRITICAL" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  Security Score: {securityScore}/100
                </div>
              </div>

              <p className="text-gray-600 mb-4">
                The following security issues must be resolved before {showAssistant ? "continuing" : "starting"} the
                interview. You can automatically close detected processes or manually close them.
              </p>

              {/* Process List with Termination Options */}
              <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                {violations.map((violation, index) => {
                  // Extract PID from violation details
                  const pidMatch = violation.details.match(/PID: (\d+)/)
                  const pid = pidMatch ? Number.parseInt(pidMatch[1]) : null

                  return (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border-l-4 ${
                        violation.severity === "CRITICAL"
                          ? "border-red-500 bg-red-50"
                          : violation.severity === "HIGH"
                            ? "border-orange-500 bg-orange-50"
                            : violation.severity === "MEDIUM"
                              ? "border-yellow-500 bg-yellow-50"
                              : "border-blue-500 bg-blue-50"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <strong className="text-gray-800">{violation.type}</strong>
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                violation.severity === "CRITICAL"
                                  ? "bg-red-200 text-red-800"
                                  : violation.severity === "HIGH"
                                    ? "bg-orange-200 text-orange-800"
                                    : violation.severity === "MEDIUM"
                                      ? "bg-yellow-200 text-yellow-800"
                                      : "bg-blue-200 text-blue-800"
                              }`}
                            >
                              {violation.severity}
                            </span>
                            {violation.aiDetected && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-purple-200 text-purple-800">
                                AI Detected
                              </span>
                            )}
                          </div>
                          <p className="text-gray-700 text-sm mb-1">{violation.details}</p>
                          {violation.evidence && (
                            <p className="text-gray-500 text-xs mb-2">Evidence: {violation.evidence}</p>
                          )}
                          {violation.confidence && (
                            <p className="text-gray-500 text-xs">
                              Confidence: {(violation.confidence * 100).toFixed(1)}%
                            </p>
                          )}
                        </div>

                        {/* Process Termination Button */}
                        {violation.type === "UNAUTHORIZED_APPLICATION" && pid && (
                          <div className="ml-4">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => terminateProcesses([pid])}
                              disabled={isTerminating}
                              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {isTerminating ? (
                                <>
                                  <LoadingSpinner />
                                  Closing...
                                </>
                              ) : (
                                <>
                                  <X className="w-3 h-3" />
                                  Close Process
                                </>
                              )}
                            </motion.button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Termination Results */}
              {terminationResults && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2">Process Termination Results:</h4>
                  <p className="text-sm text-blue-700">
                    ✅ {terminationResults.results?.terminated?.length || 0} processes terminated successfully
                  </p>
                  {terminationResults.results?.failed?.length > 0 && (
                    <p className="text-sm text-red-700">
                      ❌ {terminationResults.results.failed.length} processes failed to terminate
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      const unauthorizedProcesses = violations
                        .filter((v) => v.type === "UNAUTHORIZED_APPLICATION")
                        .map((v) => {
                          const pidMatch = v.details.match(/PID: (\d+)/)
                          return pidMatch ? Number.parseInt(pidMatch[1]) : null
                        })
                        .filter((pid) => pid !== null)

                      if (unauthorizedProcesses.length > 0) {
                        terminateProcesses(unauthorizedProcesses)
                      } else {
                        alert("No processes to terminate")
                      }
                    }}
                    disabled={
                      isTerminating || violations.filter((v) => v.type === "UNAUTHORIZED_APPLICATION").length === 0
                    }
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isTerminating ? (
                      <>
                        <LoadingSpinner />
                        Closing All Processes...
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4" />
                        Close All Detected Processes
                      </>
                    )}
                  </motion.button>
                </div>

                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={checkProcesses}
                    disabled={isTerminating || isRechecking}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md disabled:opacity-50 flex items-center gap-2"
                  >
                    {isRechecking ? (
                      <>
                        <LoadingSpinner />
                        Re-checking...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Re-check Security
                      </>
                    )}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={proceedToConnect}
                    disabled={isTerminating || isConnecting || severity === "CRITICAL"}
                    className="bg-gradient-to-r from-orange-500 to-green-600 text-white px-6 py-2 rounded-md hover:from-orange-600 hover:to-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isConnecting ? (
                      <>
                        <LoadingSpinner />
                        Starting Interview...
                      </>
                    ) : severity === "CRITICAL" ? (
                      "Resolve Critical Issues First"
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Proceed to Interview
                      </>
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Instructions */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-2">Instructions:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Click "Close Process" next to individual applications to terminate them</li>
                  <li>• Use "Close All Detected Processes" to terminate all unauthorized applications at once</li>
                  <li>• After closing processes, click "Re-check Security" to verify they're closed</li>
                  <li>• Critical violations must be resolved before starting the interview</li>
                  <li>• You can also manually close applications and then re-check</li>
                </ul>
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
  )
}

// Enhanced Video Call Interface with Security Dashboard
function VideoCallInterface({
  securityScore,
  biometricData,
  behaviorMetrics,
  isProctoring,
  onStopMonitoring,
}: {
  securityScore: number
  biometricData: BiometricData
  behaviorMetrics: BehaviorMetrics
  isProctoring: boolean
  onStopMonitoring: () => void
}) {
  const { state: agentState, agent, videoTrack: agentVideoTrack, audioTrack: agentAudioTrack } = useVoiceAssistant()
  const { localParticipant } = useLocalParticipant()
  const [chatInput, setChatInput] = useState("")
  const [isCameraEnabled, setIsCameraEnabled] = useState(true)
  const [isMicEnabled, setIsMicEnabled] = useState(true)
  const [showSecurityDashboard, setShowSecurityDashboard] = useState(false)
  const room = useRoomContext()
  const userVideoTracks = useTracks([Track.Source.Camera], { onlySubscribed: false })
  const userVideoTrack = userVideoTracks.find((track) => track.participant === localParticipant)

  const toggleCamera = useCallback(async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled)
      setIsCameraEnabled(!isCameraEnabled)
      fetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CAMERA_TOGGLE",
          severity: "LOW",
          details: `Camera ${isCameraEnabled ? "disabled" : "enabled"}`,
          timestamp: new Date().toISOString(),
        }),
      })
    } catch (error) {
      console.error("Error toggling camera:", error)
      alert("Failed to toggle camera. Please check your device settings.")
    }
  }, [localParticipant, isCameraEnabled])

  const toggleMicrophone = useCallback(async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicEnabled)
      setIsMicEnabled(!isMicEnabled)
      fetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "MICROPHONE_TOGGLE",
          severity: "LOW",
          details: `Microphone ${isMicEnabled ? "disabled" : "enabled"}`,
          timestamp: new Date().toISOString(),
        }),
      })
    } catch (error) {
      console.error("Error toggling microphone:", error)
      alert("Failed to toggle microphone. Please check your device settings.")
    }
  }, [localParticipant, isMicEnabled])

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return
    if (!agent) {
      alert("No agent connected. Please ensure the agent is running and try again.")
      return
    }

    const messageText = chatInput
    setChatInput("")

    try {
      console.log(`Sending message to agent ${agent.identity}: ${messageText}`)
      const result = await room.localParticipant.performRpc({
        destinationIdentity: agent.identity,
        method: "agent.textMessage",
        payload: JSON.stringify({ message: messageText }),
      })
      console.log(`Message submission result: ${result}`)

      fetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "MESSAGE_SENT",
          severity: "INFO",
          details: `User sent message: ${messageText.substring(0, 50)}...`,
          timestamp: new Date().toISOString(),
        }),
      })
    } catch (error) {
      console.error("Error sending message:", error)
      alert(`Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && chatInput.trim()) {
      handleSendMessage()
    }
  }

  return (
    <div className="h-screen flex bg-gray-900 text-white">
      <div className="flex-1 flex flex-col">
        {/* Enhanced Header with Security Status */}
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

          {/* Security Score Display */}
          <div className="flex items-center gap-4">
            <motion.div
              whileHover={{ scale: 1.05 }}
              onClick={() => setShowSecurityDashboard(!showSecurityDashboard)}
              className="cursor-pointer bg-gray-700 rounded-lg px-4 py-2 flex items-center gap-2"
            >
              <Shield
                className={`w-5 h-5 ${securityScore > 80 ? "text-green-400" : securityScore > 60 ? "text-yellow-400" : "text-red-400"}`}
              />
              <span className="text-sm font-medium">Security: {securityScore}/100</span>
              {isProctoring && <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>}
            </motion.div>

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
                <DisconnectButton
                  className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full transition-all duration-200 shadow-lg"
                  onClick={() => {
                    onStopMonitoring()
                    fetch("/api/audit-logs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        type: "INTERVIEW_ENDED",
                        severity: "INFO",
                        details: "User manually ended the interview",
                        timestamp: new Date().toISOString(),
                      }),
                    })
                  }}
                >
                  <CloseIcon />
                </DisconnectButton>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Security Dashboard Overlay */}
        <AnimatePresence>
          {showSecurityDashboard && (
            <motion.div
              initial={{ opacity: 0, y: -100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -100 }}
              className="absolute top-20 left-4 right-4 bg-gray-800/95 backdrop-blur-sm rounded-lg p-4 z-10 border border-gray-600"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium">Biometric</span>
                  </div>
                  <p className="text-xs text-gray-300">Face: {biometricData.faceDetected ? "✅" : "❌"}</p>
                  <p className="text-xs text-gray-300">Attention: {biometricData.attentionScore}%</p>
                </div>

                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium">Behavior</span>
                  </div>
                  <p className="text-xs text-gray-300">Tab Switches: {behaviorMetrics.tabSwitches}</p>
                  <p className="text-xs text-gray-300">Right Clicks: {behaviorMetrics.rightClicks}</p>
                </div>

                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Keyboard className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium">Input</span>
                  </div>
                  <p className="text-xs text-gray-300">Keystrokes: {behaviorMetrics.keystrokes}</p>
                  <p className="text-xs text-gray-300">Mouse: {behaviorMetrics.mouseMovements}</p>
                </div>

                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-medium">Security</span>
                  </div>
                  <p className="text-xs text-gray-300">Score: {securityScore}/100</p>
                  <p className="text-xs text-gray-300">Status: {isProctoring ? "Active" : "Inactive"}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Video Area */}
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
                  Your AI interviewer is connected and ready to conduct your technical interview with advanced security
                  monitoring.
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

            {/* User Video Overlay */}
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
                    <div
                      className={`w-2 h-2 rounded-full animate-pulse ${
                        biometricData.faceDetected ? "bg-green-500" : "bg-red-500"
                      }`}
                    ></div>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        securityScore > 80 ? "bg-green-500" : securityScore > 60 ? "bg-yellow-500" : "bg-red-500"
                      }`}
                    ></div>
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

      {/* Enhanced Chat Panel */}
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
  )
}

function LoadingSpinner() {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
    />
  )
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
  )
}

function FeatureCard({
  icon,
  title,
  description,
  color,
  delay,
}: {
  icon: React.ReactNode
  title: string
  description: string
  color: string
  delay: number
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-50px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50, rotateX: -15 }}
      animate={isInView ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: -15 }}
      transition={{ duration: 0.6, delay, type: "spring", stiffness: 100 }}
      whileHover={{
        scale: 1.05,
        rotateY: 5,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      }}
      className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 hover:shadow-2xl transition-all duration-300 group cursor-pointer"
    >
      <motion.div
        whileHover={{ rotate: 360, scale: 1.1 }}
        transition={{ duration: 0.6 }}
        className={`w-14 h-14 bg-gradient-to-r ${color} rounded-xl flex items-center justify-center text-white mb-4 group-hover:shadow-lg`}
      >
        {icon}
      </motion.div>
      <motion.h3
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ delay: delay + 0.2 }}
        className="font-bold text-gray-800 mb-2 text-lg"
      >
        {title}
      </motion.h3>
      <motion.p
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ delay: delay + 0.3 }}
        className="text-sm text-gray-600 leading-relaxed"
      >
        {description}
      </motion.p>
    </motion.div>
  )
}
