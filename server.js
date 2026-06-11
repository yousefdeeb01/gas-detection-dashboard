const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
let isConnected = false;
let connectionRetries = 0;
const MAX_RETRIES = 10;

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
  
  console.log('📨 Received data:', line);
  
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
    
    console.log(`📊 Gas: ${gasValue}, Threshold: ${threshold}, Fan: ${fanOn}, Buzzer: ${buzzerOn}`);
    
    // Update stats
    if (gasValue > stats.maxGasLevel) {
      stats.maxGasLevel = gasValue;
    }
    
    // Track detection events
    if (gasDetected && !stats.currentDetectionStart) {
      stats.currentDetectionStart = timestamp;
      stats.totalDetections++;
      logEvent('Gas Detected', 'danger');
      console.log('⚠️ GAS DETECTED!');
    } else if (!gasDetected && stats.currentDetectionStart) {
      const duration = timestamp - stats.currentDetectionStart;
      stats.totalDetectionTime += duration;
      stats.currentDetectionStart = null;
      logEvent('Gas Clear', 'success');
      console.log('✓ Gas cleared');
    }
    
    // Track fan runtime
    if (fanOn && !stats.fanActivationTime) {
      stats.fanActivationTime = timestamp;
      logEvent('Fan Activated', 'info');
      console.log('🌬️ Fan activated');
    } else if (!fanOn && stats.fanActivationTime) {
      stats.totalFanRuntime += timestamp - stats.fanActivationTime;
      stats.fanActivationTime = null;
      logEvent('Fan Deactivated', 'info');
      console.log('🌬️ Fan deactivated');
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
  } else {
    console.warn('⚠️ Invalid data format received:', line);
    console.warn('Expected format: Gas:XXX Threshold:YYY Fan:ZZZ Buzzer:WWW');
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
  console.log('✓ Browser connected');
  
  // Send initial data
  ws.send(JSON.stringify({
    type: 'initial',
    dataPoints: dataPoints,
    eventLog: eventLog,
    stats: stats,
    connected: isConnected
  }));
  
  ws.on('close', () => {
    console.log('✕ Browser disconnected');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`\n🚀 Dashboard server running at http://localhost:${PORT}`);
  console.log('\n📍 Connection Status: Waiting for Arduino...');
  console.log('Connect your Arduino via USB now!\n');
  
  // Try to detect and connect to Arduino
  attemptArduinoConnection();
});

let serialPort = null;

async function attemptArduinoConnection() {
  try {
    // Try to import serialport
    const { SerialPort, ReadlineParser } = require('serialport');
    
    const ports = await SerialPort.list();
    console.log('🔍 Available COM ports:', ports.length > 0 ? ports.map(p => `${p.path} (${p.manufacturer || 'Unknown'})`).join(', ') : 'None');
    
    if (ports.length === 0) {
      connectionRetries++;
      const retryMsg = connectionRetries <= MAX_RETRIES 
        ? `Retrying in 5 seconds (${connectionRetries}/${MAX_RETRIES})...` 
        : 'Max retries reached. Retrying every 30 seconds...';
      console.log(`❌ No COM ports found. ${retryMsg}`);
      const retryDelay = connectionRetries > MAX_RETRIES ? 30000 : 5000;
      setTimeout(attemptArduinoConnection, retryDelay);
      return;
    }
    
    // Reset retry counter on successful port discovery
    connectionRetries = 0;
    
    // Try first available port
    const portPath = ports[0].path;
    console.log(`\n🔌 Attempting to connect to ${portPath}...`);
    console.log(`   (Manufacturer: ${ports[0].manufacturer || 'Unknown'})`);
    
    serialPort = new SerialPort({
      path: portPath,
      baudRate: 9600
    });
    
    const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    serialPort.on('open', () => {
      console.log(`✅ Arduino connected on ${portPath}!\n`);
      isConnected = true;
      broadcastMessage({ type: 'connected', message: 'Arduino connected!' });
      logEvent('Arduino Connected', 'success');
    });
    
    parser.on('data', (line) => {
      handleArduinoData(line);
    });
    
    serialPort.on('error', (err) => {
      console.error('❌ Serial port error:', err.message);
      isConnected = false;
      broadcastMessage({ type: 'error', message: 'Arduino error: ' + err.message });
    });
    
    serialPort.on('close', () => {
      console.log('❌ Arduino disconnected. Retrying in 5 seconds...');
      isConnected = false;
      broadcastMessage({ type: 'disconnected', message: 'Arduino disconnected' });
      logEvent('Arduino Disconnected', 'warning');
      setTimeout(attemptArduinoConnection, 5000);
    });
    
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' || error.message.includes('serialport')) {
      console.log('\n⚠️ SerialPort module not found.');
      console.log('📦 To connect to Arduino, install with:');
      console.log('   npm install serialport');
      console.log('\n💡 For development, the dashboard will accept data via REST API.\n');
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

process.on('SIGINT', () => {
  console.log('\n\nServer shutting down...');
  if (serialPort && serialPort.isOpen) {
    serialPort.close();
  }
  process.exit();
});
