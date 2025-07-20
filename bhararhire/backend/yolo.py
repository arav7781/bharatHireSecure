from flask import Flask, Response, render_template, jsonify
from flask_cors import CORS
import cv2
import numpy as np
from ultralytics import YOLO
import json
import base64
import threading
import time

app = Flask(__name__)
CORS(app)

# Load YOLO model
model = YOLO("YOLO11n.pt")  # Using object detection model instead of classification

class YOLOStream:
    def __init__(self):
        self.camera = None
        self.is_streaming = False
        self.frame = None
        self.results = None
        self.lock = threading.Lock()
        self.fps = 30
        self.frame_time = 1.0 / self.fps
    
    def start_stream(self):
        if not self.is_streaming:
            self.camera = cv2.VideoCapture(0)
            # Optimize camera settings for better performance
            self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.camera.set(cv2.CAP_PROP_FPS, 30)
            self.camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer to minimize lag
            self.is_streaming = True
            threading.Thread(target=self._capture_frames, daemon=True).start()
            return True
        return False
    
    def stop_stream(self):
        self.is_streaming = False
        if self.camera:
            self.camera.release()
            self.camera = None
        with self.lock:
            self.frame = None
            self.results = None
    
    def _capture_frames(self):
        last_time = time.time()
        while self.is_streaming and self.camera:
            ret, frame = self.camera.read()
            if ret:
                current_time = time.time()
                
                # Skip frames if processing is too slow
                if current_time - last_time >= self.frame_time:
                    # Run YOLO inference
                    results = model(frame, verbose=False)  # Disable verbose output
                    
                    # Draw bounding boxes
                    annotated_frame = results[0].plot()
                    
                    with self.lock:
                        self.frame = annotated_frame
                        self.results = results[0]
                    
                    last_time = current_time
            else:
                time.sleep(0.01)  # Small delay if frame read fails
    
    def get_frame(self):
        with self.lock:
            if self.frame is not None:
                # Use lower quality JPEG encoding for faster streaming
                ret, buffer = cv2.imencode('.jpg', self.frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ret:
                    return buffer.tobytes()
        return None
    
    def get_detections(self):
        with self.lock:
            if self.results is not None:
                detections = []
                if self.results.boxes is not None:
                    for box in self.results.boxes:
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                        conf = box.conf[0].cpu().numpy()
                        cls = int(box.cls[0].cpu().numpy())
                        
                        detections.append({
                            'bbox': [float(x1), float(y1), float(x2), float(y2)],
                            'confidence': float(conf),
                            'class': model.names[cls],
                            'class_id': cls
                        })
                
                return detections
        return []

# Global stream instance
yolo_stream = YOLOStream()

@app.route('/')
def index():
    return "YOLO Flask Server Running"

@app.route('/api/start_stream', methods=['POST'])
def start_stream():
    success = yolo_stream.start_stream()
    return jsonify({'success': success, 'message': 'Stream started' if success else 'Stream already running'})

@app.route('/api/stop_stream', methods=['POST'])
def stop_stream():
    yolo_stream.stop_stream()
    return jsonify({'success': True, 'message': 'Stream stopped'})

@app.route('/api/detections')
def get_detections():
    detections = yolo_stream.get_detections()
    return jsonify({'detections': detections})

@app.route('/video_feed')
def video_feed():
    def generate():
        while yolo_stream.is_streaming:
            frame = yolo_stream.get_frame()
            if frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n'
                       b'Cache-Control: no-cache\r\n'
                       b'Connection: close\r\n\r\n' + frame + b'\r\n')
            time.sleep(0.01)  # Small delay to prevent overwhelming
    
    return Response(generate(),
                    mimetype='multipart/x-mixed-replace; boundary=frame',
                    headers={'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Pragma': 'no-cache',
                            'Expires': '0'})

if __name__ == '__main__':
    try:
        app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)
    except KeyboardInterrupt:
        yolo_stream.stop_stream()
        print("Server stopped")