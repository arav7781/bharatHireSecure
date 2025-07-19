"use client"

import useCombinedTranscriptions from "../hooks/useCombinedTranscriptions"
import * as React from "react"
import { motion } from "framer-motion"
import { User, Bot } from "lucide-react"

export default function TranscriptionView() {
  const combinedTranscriptions = useCombinedTranscriptions()
  const containerRef = React.useRef<HTMLDivElement>(null)

  // scroll to bottom when new transcription is added
  React.useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [combinedTranscriptions])

  return (
    <div className="relative h-full w-full">
      {/* Fade-out gradient mask */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-gray-800 to-transparent z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-800 to-transparent z-10 pointer-events-none" />

      {/* Scrollable content */}
      <div ref={containerRef} className="h-full flex flex-col gap-4 overflow-y-auto px-4 py-8">
        {combinedTranscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              className="w-16 h-16 bg-gradient-to-r from-orange-500 to-green-600 rounded-full flex items-center justify-center mb-4"
            >
              <Bot className="w-8 h-8 text-white" />
            </motion.div>
            <p className="text-gray-400 mb-2">Interview transcript will appear here</p>
            <p className="text-sm text-gray-500">Start speaking to begin the conversation</p>
          </div>
        ) : (
          combinedTranscriptions.map((segment, index) => (
            <motion.div
              key={segment.id || index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex gap-3 ${segment.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  segment.role === "user" ? "bg-blue-600" : "bg-gradient-to-r from-orange-500 to-green-600"
                }`}
              >
                {segment.role === "user" ? (
                  <User className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  segment.role === "user" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-100"
                }`}
              >
                <p className="text-sm leading-relaxed">{segment.text}</p>
                {segment.firstReceivedTime && (
                  <p className="text-xs opacity-70 mt-1">{new Date(segment.firstReceivedTime).toLocaleTimeString()}</p>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
