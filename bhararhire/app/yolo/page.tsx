"use client"
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Square, Play, Pause, AlertCircle } from 'lucide-react';

const YOLOLivePrediction = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [detections, setDetections] = useState([]);
  const [error, setError] = useState('');
  const [fps, setFps] = useState(0);
  const intervalRef = useRef(null);
  const fpsIntervalRef = useRef(null);
  const imgRef = useRef(null);
  const frameCountRef = useRef(0);

  const FLASK_URL = 'http://localhost:5000';

  const startStream = async () => {
    try {
      const response = await fetch(`${FLASK_URL}/api/start_stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsStreaming(true);
        setError('');
        
        // Start polling for detections at higher frequency
        intervalRef.current = setInterval(fetchDetections, 50); // 20 FPS
        
        // Start FPS counter
        frameCountRef.current = 0;
        fpsIntervalRef.current = setInterval(() => {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
        }, 1000);
        
      } else {
        setError(data.message || 'Failed to start stream');
      }
    } catch (err) {
      setError('Failed to connect to server. Make sure Flask server is running.');
      console.error('Error starting stream:', err);
    }
  };

  const stopStream = async () => {
    try {
      await fetch(`${FLASK_URL}/api/stop_stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      setIsStreaming(false);
      setDetections([]);
      setFps(0);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      if (fpsIntervalRef.current) {
        clearInterval(fpsIntervalRef.current);
        fpsIntervalRef.current = null;
      }
      
      // Force image refresh
      if (imgRef.current) {
        imgRef.current.src = '';
      }
      
    } catch (err) {
      console.error('Error stopping stream:', err);
    }
  };

  const fetchDetections = async () => {
    try {
      const response = await fetch(`${FLASK_URL}/api/detections`);
      const data = await response.json();
      setDetections(data.detections || []);
      frameCountRef.current += 1; // Count frames for FPS
    } catch (err) {
      console.error('Error fetching detections:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (fpsIntervalRef.current) {
        clearInterval(fpsIntervalRef.current);
      }
    };
  }, []);

  const getConfidenceColor = (confidence) => {
    if (confidence > 0.8) return 'text-green-600';
    if (confidence > 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceColorBg = (confidence) => {
    if (confidence > 0.8) return 'bg-green-100 border-green-300';
    if (confidence > 0.6) return 'bg-yellow-100 border-yellow-300';
    return 'bg-red-100 border-red-300';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Camera className="w-8 h-8 text-indigo-600" />
            <h1 className="text-4xl font-bold text-gray-800">YOLO Live Detection</h1>
          </div>
          <p className="text-gray-600 text-lg">Real-time object detection using YOLO model</p>
        </div>

        {/* Control Panel */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={isStreaming ? stopStream : startStream}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
                isStreaming
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {isStreaming ? (
                <>
                  <Pause className="w-5 h-5" />
                  Stop Prediction
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Start Prediction
                </>
              )}
            </button>
            
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isStreaming ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}>
              <div className={`w-3 h-3 rounded-full ${
                isStreaming ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
              }`} />
              {isStreaming ? 'Streaming' : 'Stopped'}
            </div>
            
            {isStreaming && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 text-blue-800">
                <span className="font-semibold">{fps} FPS</span>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-100 border border-red-300 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-red-700">{error}</span>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video Feed */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="bg-gray-800 px-6 py-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Live Video Feed
                </h2>
              </div>
              
              <div className="p-6">
                <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
                  {isStreaming ? (
                    <img
                      ref={imgRef}
                      src={`${FLASK_URL}/video_feed?t=${Date.now()}`}
                      alt="YOLO Live Feed"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        console.error('Image load error:', e);
                        setError('Failed to load video stream');
                      }}
                      onLoad={() => {
                        // Image loaded successfully, clear any previous errors
                        setError('');
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <div className="text-center">
                        <Camera className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg">Click "Start Prediction" to begin</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Detection Results */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg">
              <div className="bg-indigo-600 px-6 py-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Square className="w-5 h-5" />
                  Detections ({detections.length})
                </h2>
              </div>
              
              <div className="p-6">
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {detections.length > 0 ? (
                    detections.map((detection, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border-2 ${getConfidenceColorBg(detection.confidence)}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-800 capitalize">
                            {detection.class}
                          </span>
                          <span className={`text-sm font-bold ${getConfidenceColor(detection.confidence)}`}>
                            {(detection.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          <div>Box: [{detection.bbox.map(b => b.toFixed(0)).join(', ')}]</div>
                          <div>Class ID: {detection.class_id}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <Square className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No objects detected</p>
                      <p className="text-sm">Objects will appear here when detected</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Instructions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <p><strong>1. Start Flask Server:</strong> Run the Python Flask server with your YOLO model</p>
              <p><strong>2. Camera Permission:</strong> Allow camera access when prompted</p>
            </div>
            <div>
              <p><strong>3. Start Prediction:</strong> Click the "Start Prediction" button</p>
              <p><strong>4. View Results:</strong> See real-time detections with bounding boxes and confidence scores</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default YOLOLivePrediction;