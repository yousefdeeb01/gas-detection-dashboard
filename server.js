const express = require('express');
const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
let serialPort = null;
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

// Auto-detect Arduino port
async function findArduinoPort() {
  try {
    const ports = await SerialPort.list();
    console.log('Available ports:', ports);
    
    // Look for common Arduino identifiers
    let arduinoPort = ports.find(port => 
      port.productId && (port.productId.includes('2341') || port.productId.includes('1a86'))
    );
    
    if (!arduinoPort) {
      arduinoPort = ports[0];
    }
    
    return arduinoPort ? arduinoPort.path : null;
  } catch (error) {
    console.error('Error finding Arduino port:', error);
    return null;
  }
}

// Connect to Arduino
async function connectArduino() {
  try {
    const portPath = await findArduinoPort();
    
    if (!portPath) {
      console.error('No Arduino port found');
      broadcastMessage({ type: 'error', message: 'Arduino not found. Please connect your device.' });
      return;
    }
    
    console.log(`Connecting to Arduino on port: ${portPath}`);
    
    serialPort = new SerialPort({
      path: portPath,
      baudRate: 9600
    });
    
    const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    serialPort.on('open', () => {
      console.log('Serial port opened');
      isConnected = true;
      broadcastMessage({ type: 'connected', message: 'Arduino connected' });
    });
    
    parser.on('data', (line) => {
      handleSerialData(line);
    });
    
    serialPort.on('error', (error) => {
      console.error('Serial port error:', error);
      isConnected = false;
      broadcastMessage({ type: 'error', message: 'Serial port error: ' + error.message });
    });
    
    serialPort.on('close', () => {
      console.log('Serial port closed');
      isConnected = false;
      broadcastMessage({ type: 'disconnected', message: 'Arduino disconnected' });
    });
    
  } catch (error) {
    console.error('Connection error:', error);
    isConnected = false;
    broadcastMessage({ type: 'error', message: error.message });
  }
}

function handleSerialData(line) {
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
  connectArduino();
  
  // Attempt to reconnect every 5 seconds if disconnected
  setInterval(() => {
    if (!isConnected) {
      console.log('Attempting to reconnect...');
      connectArduino();
    }
  }, 5000);
});

process.on('SIGINT', () => {
  if (serialPort) {
    serialPort.close(() => {
      console.log('Serial port closed');
      process.exit();
    });
  } else {
    process.exit();
  }
});
