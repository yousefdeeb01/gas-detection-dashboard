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

// Handle Arduino data
function handleArduinoData(line) {
  const timestamp = Date.now();
  
  // Parse data from format: "Gas:XXX Threshold:YYY Fan:ZZZ Buzzer:WWW"
  const gasMatch = line.match(/Gas:(\d+)/);
  const thresholdMatch = line.match(/Threshold:(\d+)/);
  const fanMatch = line.match(/Fan:(\d+)/);
  const buzzerMatch = line.match(/Buzzer:(\d+)/);
  
  if (gasMatch) {
    const gasValue = parseInt(gasMatch[1]);
    const threshold = thresholdMatch ? parseInt(thresholdMatch[1]) : 200;
    const fanOn = fanMatch ? parseInt(fanMatch[1]) > 500 : false;
    const buzzerOn = buzzerMatch ? parseInt(buzzerMatch[1]) > 500 : false;
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
  console.log('Waiting for Arduino connection on COM ports...');
  console.log('Connect your Arduino now!');
  
  // Try to detect and connect to Arduino
  tryConnectArduino();
});

async function tryConnectArduino() {
  try {
    // Try to import serialport
    const { SerialPort } = require('serialport');
    const { ReadlineParser } = require('@serialport/parser-readline');
    
    const ports = await SerialPort.list();
    console.log('Available COM ports:', ports.map(p => p.path));
    
    if (ports.length === 0) {
      console.log('No COM ports found. Waiting for Arduino...');
      setTimeout(tryConnectArduino, 5000);
      return;
    }
    
    const port = new SerialPort({
      path: ports[0].path,
      baudRate: 9600
    });
    
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    port.on('open', () => {
      console.log(`✓ Arduino connected on ${ports[0].path}`);
      isConnected = true;
      broadcastMessage({ type: 'connected', message: 'Arduino connected!' });
      logEvent('Arduino Connected', 'success');
    });
    
    parser.on('data', (line) => {
      handleArduinoData(line);
    });
    
    port.on('error', (err) => {
      console.error('Serial port error:', err.message);
      isConnected = false;
      broadcastMessage({ type: 'error', message: 'Arduino error: ' + err.message });
    });
    
    port.on('close', () => {
      console.log('Arduino disconnected');
      isConnected = false;
      broadcastMessage({ type: 'disconnected', message: 'Arduino disconnected' });
      logEvent('Arduino Disconnected', 'warning');
      setTimeout(tryConnectArduino, 5000);
    });
    
  } catch (error) {
    console.log('SerialPort not available - install it with: npm install serialport');
    console.log('For now, dashboard is in DEMO mode');
  }
}

process.on('SIGINT', () => {
  console.log('Server shutting down');
  process.exit();
});
