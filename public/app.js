let ws = null;
let chart = null;
let maxDataPoints = 100;
let currentData = {
  labels: [],
  gasValues: [],
  thresholds: [],
  fanStatus: [],
  buzzerStatus: []
};

// Initialize WebSocket connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('Connected to server');
    updateConnectionStatus(true);
  };
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleMessage(message);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    updateConnectionStatus(false);
  };
  
  ws.onclose = () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false);
    // Attempt to reconnect after 3 seconds
    setTimeout(initWebSocket, 3000);
  };
}

function handleMessage(message) {
  switch (message.type) {
    case 'initial':
      handleInitialData(message);
      break;
    case 'data':
      handleDataUpdate(message);
      break;
    case 'connected':
      updateConnectionStatus(true);
      break;
    case 'disconnected':
      updateConnectionStatus(false);
      break;
    case 'error':
      showError(message.message);
      break;
  }
}

function handleInitialData(message) {
  console.log('Initial data received:', message);
  
  // Load historical data
  if (message.dataPoints && message.dataPoints.length > 0) {
    message.dataPoints.forEach(point => {
      addDataPoint(point);
    });
  }
  
  // Load event log
  if (message.eventLog && message.eventLog.length > 0) {
    message.eventLog.forEach(event => {
      addEventToTimeline(event);
    });
  }
  
  // Update stats
  if (message.stats) {
    updateStats(message.stats);
  }
  
  // Initialize chart
  if (chart) {
    chart.destroy();
  }
  initChart();
}

function handleDataUpdate(message) {
  const data = message.data;
  addDataPoint(data);
  updateCurrentReadings(data);
  updateStats(message.stats);
  updateChart();
}

function addDataPoint(data) {
  const time = new Date(data.timestamp).toLocaleTimeString();
  currentData.labels.push(time);
  currentData.gasValues.push(data.gasValue);
  currentData.thresholds.push(data.threshold);
  currentData.fanStatus.push(data.fanOn ? 1 : 0);
  currentData.buzzerStatus.push(data.buzzerOn ? 1 : 0);
  
  // Keep only last N points
  if (currentData.labels.length > maxDataPoints) {
    currentData.labels.shift();
    currentData.gasValues.shift();
    currentData.thresholds.shift();
    currentData.fanStatus.shift();
    currentData.buzzerStatus.shift();
  }
}

function updateCurrentReadings(data) {
  document.getElementById('currentGasLevel').textContent = data.gasValue;
  document.getElementById('currentThreshold').textContent = data.threshold;
  
  // Update gas status
  const statusElement = document.getElementById('gasStatus');
  if (data.gasDetected) {
    statusElement.textContent = 'DANGER';
    statusElement.className = 'reading-value status danger';
  } else if (data.gasValue > data.threshold * 0.7) {
    statusElement.textContent = 'WARNING';
    statusElement.className = 'reading-value status warning';
  } else {
    statusElement.textContent = 'SAFE';
    statusElement.className = 'reading-value status safe';
  }
  
  // Update indicators
  updateIndicator('fanIndicator', data.fanOn);
  updateIndicator('buzzerIndicator', data.buzzerOn);
  updateIndicator('gasIndicator', data.gasDetected);
}

function updateIndicator(id, active) {
  const element = document.getElementById(id);
  if (active) {
    element.classList.add('active');
  } else {
    element.classList.remove('active');
  }
}

function updateStats(stats) {
  document.getElementById('peakGasLevel').textContent = stats.maxGasLevel || '--';
  document.getElementById('totalDetections').textContent = stats.totalDetections || 0;
  document.getElementById('totalDetectionTime').textContent = formatTime(stats.totalDetectionTime || 0);
  document.getElementById('totalFanRuntime').textContent = formatTime(stats.totalFanRuntime || 0);
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function addEventToTimeline(event) {
  const timeline = document.getElementById('eventTimeline');
  
  // Remove placeholder if exists
  const placeholder = timeline.querySelector('.timeline-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  const eventDiv = document.createElement('div');
  eventDiv.className = `timeline-event ${event.level}`;
  
  const time = new Date(event.timestamp).toLocaleTimeString();
  eventDiv.innerHTML = `
    <div class="timeline-time">${time}</div>
    <div class="timeline-text">${event.event}</div>
    <div class="timeline-badge">${event.level}</div>
  `;
  
  timeline.insertBefore(eventDiv, timeline.firstChild);
  
  // Keep only last 50 events visible
  while (timeline.children.length > 50) {
    timeline.removeChild(timeline.lastChild);
  }
  
  // Auto-scroll to top
  timeline.scrollTop = 0;
}

function initChart() {
  const ctx = document.getElementById('gasChart').getContext('2d');
  const maxGas = Math.max(...currentData.gasValues, 300);
  
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: currentData.labels,
      datasets: [
        {
          label: 'Gas Level (ppm)',
          data: currentData.gasValues,
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0, 212, 255, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointBackgroundColor: '#00d4ff',
          yAxisID: 'y'
        },
        {
          label: 'Threshold',
          data: currentData.thresholds,
          borderColor: '#ffaa00',
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          pointRadius: 0,
          yAxisID: 'y'
        },
        {
          label: 'Fan Status',
          data: currentData.fanStatus.map(v => v ? maxGas * 0.5 : 0),
          borderColor: '#00ff88',
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          borderWidth: 1,
          fill: false,
          pointRadius: 0,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#e0e0ff',
            font: {
              size: 12
            },
            usePointStyle: true
          }
        },
        filler: {
          propagate: true
        }
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Gas Level (ppm)',
            color: '#00d4ff'
          },
          grid: {
            color: 'rgba(0, 212, 255, 0.1)'
          },
          ticks: {
            color: '#a0a0c0'
          },
          min: 0,
          max: Math.max(maxGas, 300)
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: 'Fan Status',
            color: '#00ff88'
          },
          grid: {
            drawOnChartArea: false
          },
          ticks: {
            color: '#a0a0c0'
          },
          min: 0,
          max: 1
        },
        x: {
          grid: {
            color: 'rgba(0, 212, 255, 0.05)'
          },
          ticks: {
            color: '#a0a0c0',
            maxTicksLimit: 10
          }
        }
      }
    }
  });
}

function updateChart() {
  if (chart && currentData.labels.length > 0) {
    const maxGas = Math.max(...currentData.gasValues, 300);
    
    chart.data.labels = currentData.labels;
    chart.data.datasets[0].data = currentData.gasValues;
    chart.data.datasets[1].data = currentData.thresholds;
    chart.data.datasets[2].data = currentData.fanStatus.map(v => v ? maxGas * 0.5 : 0);
    
    chart.options.scales.y.max = Math.max(maxGas, 300);
    chart.update('none'); // Update without animation for smooth real-time update
  }
}

function updateConnectionStatus(connected) {
  const element = document.getElementById('connectionStatus');
  if (connected) {
    element.textContent = '✓ Connected';
    element.className = 'connection-status connected';
  } else {
    element.textContent = '✕ Disconnected';
    element.className = 'connection-status disconnected';
  }
}

function showError(message) {
  console.error('Server error:', message);
  alert('Error: ' + message);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
});
