import React, { useRef, useEffect, useState } from 'react';
import { Box, Typography, Alert } from '@mui/material';

const VideoFeed = ({ videoRef }) => {
  const canvasRef = useRef(null);
  const [dangerAlerts, setDangerAlerts] = useState([]);
  const ws = useRef(null);

  // Color mapping for different danger levels
  const dangerColors = {
    high: '#ff0000',    // Kırmızı
    medium: '#ffa500',  // Turuncu
    low: '#ffff00'      // Sarı
  };

  useEffect(() => {
    if (!videoRef.current) return;

    const setupWebSocket = () => {
      ws.current = new WebSocket('ws://localhost:8000/ws');

      ws.current.onopen = () => {
        console.log('WebSocket Connected');
      };

      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        // Clear previous drawings
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Reset danger alerts
        const currentAlerts = [];

        // Draw detections
        data.detections.forEach(detection => {
          const [x1, y1, x2, y2] = detection.box;
          const width = x2 - x1;
          const height = y2 - y1;

          // Choose color based on class and danger status
          let boxColor = '#00ff00'; // Default green for safe objects
          
          if (detection.in_danger) {
            boxColor = dangerColors[detection.danger_level] || dangerColors.high;
            
            // Add to alerts
            currentAlerts.push({
              message: `${detection.class} tehlikede! Tehlike kaynağı: ${detection.danger_source}`,
              level: detection.danger_level,
              hasProtection: detection.safety_equipment
            });
          }

          // Draw bounding box
          ctx.strokeStyle = boxColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(x1, y1, width, height);

          // Draw label
          ctx.fillStyle = boxColor;
          ctx.font = '16px Arial';
          const label = `${detection.class} ${detection.confidence.toFixed(2)}`;
          const textWidth = ctx.measureText(label).width;
          ctx.fillRect(x1, y1 - 20, textWidth + 10, 20);
          ctx.fillStyle = '#000000';
          ctx.fillText(label, x1 + 5, y1 - 5);
        });

        setDangerAlerts(currentAlerts);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        // Try to reconnect after 2 seconds
        setTimeout(setupWebSocket, 2000);
      };
    };

    setupWebSocket();

    // Set up canvas size
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      if (canvas && videoRef.current) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
      }
    };

    videoRef.current.addEventListener('loadedmetadata', updateCanvasSize);

    // Send frames to backend
    const sendFrame = () => {
      if (ws.current?.readyState === WebSocket.OPEN && videoRef.current?.videoWidth) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0);
        const frame = canvas.toDataURL('image/jpeg');
        ws.current.send(frame);
      }
    };

    const interval = setInterval(sendFrame, 100);

    return () => {
      clearInterval(interval);
      if (ws.current) {
        ws.current.close();
      }
      videoRef.current?.removeEventListener('loadedmetadata', updateCanvasSize);
    };
  }, [videoRef]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1
        }}
      />
      <Box sx={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }}>
        {dangerAlerts.map((alert, index) => (
          <Alert
            key={index}
            severity={alert.level === 'high' ? 'error' : alert.level === 'medium' ? 'warning' : 'info'}
            sx={{ mb: 1 }}
          >
            <Typography variant="body1">
              {alert.message}
              {alert.hasProtection ? ' (Koruyucu ekipman var)' : ' (Koruyucu ekipman eksik!)'}
            </Typography>
          </Alert>
        ))}
      </Box>
    </Box>
  );
};

export default VideoFeed; 