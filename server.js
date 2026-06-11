const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
let isConnected = false;

// Data storage
let dataPoints = [];
let eventLog = [];
const MAX_DATA_POINTS = 1000;

// Statistics
let stats = {
  maxGasLevel: 0,
  totalDetections: 0,
  currentDetectionStart: null,
  totalDetectionTime: 0,
  totalFanRuntime: 0,
  fanActivationTime: null
};

// Serve static files
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/initial-data', (req, res) => {
  res.json({
    dataPoints: dataPoints,
    eventLog: eventLog,
    stats: stats,
    connected: isConnected
  });
});

// Simulate Arduino data for demo
function simulateArduinoData() {
  const timestamp = Date.now();
  const gasValue = Math.floor(Math.random() * 500) + 100;
  const threshold = 250;
  const fanOn = gasValue > threshold;
  const buzzerOn = gasValue > threshold;
  const gasDetected = gasValue > threshold;
  
  // Update stats
  if (gasValue > stats.maxGasLevel) {
    stats.maxGasLevel = gasValue;
  }
  
  // Track detection events
  if (gasDetected && !stats.currentDetectionStart) {
    stats.currentDetectionStart = timestamp;
    stats.totalDetections++;
    logEvent('Gas Detected', 'danger');
  } else if (!gasDetected && stats.currentDetectionStart) {
    const duration = timestamp - stats.currentDetectionStart;
    stats.totalDetectionTime += duration;
    stats.currentDetectionStart = null;
    logEvent('Gas Clear', 'success');
  }
  
  // Track fan runtime
  if (fanOn && !stats.fanActivationTime) {
    stats.fanActivationTime = timestamp;
    logEvent('Fan Activated', 'info');
  } else if (!fanOn && stats.fanActivationTime) {
    stats.totalFanRuntime += timestamp - stats.fanActivationTime;
    stats.fanActivationTime = null;
    logEvent('Fan Deactivated', 'info');
  }
  
  // Store data point
  const dataPoint = {
    timestamp,
    gasValue,
    threshold,
    fanOn,
    buzzerOn,
    gasDetected
  };
  
  dataPoints.push(dataPoint);
  if (dataPoints.length > MAX_DATA_POINTS) {
    dataPoints.shift();
  }
  
  // Broadcast to all connected clients
  broadcastMessage({
    type: 'data',
    data: dataPoint,
    stats: stats
  });
}

function logEvent(event, level) {
  const logEntry = {
    timestamp: Date.now(),
    event,
    level
  };
  eventLog.push(logEntry);
  if (eventLog.length > 100) {
    eventLog.shift();
  }
}

function broadcastMessage(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  isConnected = true;
  
  // Send initial data
  ws.send(JSON.stringify({
    type: 'initial',
    dataPoints: dataPoints,
    eventLog: eventLog,
    stats: stats,
    connected: isConnected
  }));
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
  console.log('Simulating Arduino data...');
  isConnected = true;
  broadcastMessage({ type: 'connected', message: 'Dashboard running (Demo Mode)' });
  
  // Simulate data every 2 seconds
  setInterval(simulateArduinoData, 2000);
});

process.on('SIGINT', () => {
  console.log('Server shutting down');
  process.exit();
});
