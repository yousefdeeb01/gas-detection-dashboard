# Gas Detection Dashboard

A real-time web dashboard for monitoring Arduino gas detection systems via USB serial connection.

## Features

✨ **Real-time Monitoring**
- Live gas level readings with threshold comparison
- Fan and buzzer status indicators
- Connection status display

📊 **Visual Analytics**
- Real-time line graph of gas levels over time (Chart.js)
- Threshold visualization
- Fan activation status overlay
- Auto-scrolling chart with up to 100 data points

📈 **Statistics & History**
- Peak gas level tracking
- Total gas detections count
- Total detection time accumulation
- Total fan runtime tracking
- Event timeline with timestamps

🎨 **User Interface**
- Dark theme with cyberpunk styling
- Responsive design (desktop & mobile)
- Real-time updates via WebSocket
- Color-coded alerts (Safe, Warning, Danger)

## Setup Instructions

### Prerequisites
- Node.js (v12+)
- Arduino with gas sensor (MQ series)
- USB cable to connect Arduino to laptop

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yousefdeeb01/gas-detection-dashboard.git
   cd gas-detection-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Upload the Arduino sketch**
   - Use the Arduino IDE to upload the `gas_detection_with_logging.ino` sketch from the main repository
   - Connect your Arduino via USB

4. **Start the server**
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Open the dashboard**
   - Open your browser and navigate to: `http://localhost:3000`
   - The server will automatically detect your connected Arduino

## Architecture

### Backend (Node.js)
- **express**: Web server
- **ws**: WebSocket server for real-time communication
- **serialport**: USB serial communication with Arduino

### Frontend
- **Vanilla JavaScript**: No heavy frameworks
- **Chart.js**: Interactive graphs and charts
- **HTML5/CSS3**: Modern responsive UI

### Data Flow
```
Arduino Serial Data → Node.js Serial Parser → Event Processing → WebSocket Broadcast → Dashboard UI
```

## Arduino Sketch Requirements

The Arduino sketch should output data in the following format:
```
Gas:XXX Threshold:YYY Fan:ZZZ Buzzer:WWW
```

Example:
```
Gas:245 Threshold:200 Fan:1023 Buzzer:0
```

## Dashboard Sections

### Current Readings
- Gas Level: Current sensor reading
- Threshold: Detection threshold value
- Status: Safe/Warning/Danger indicator

### Status Indicators
- 🔴 Fan: Active/Inactive
- 🔴 Buzzer: Active/Inactive
- 🔴 Gas Detected: Yes/No

### Statistics
- Peak Gas Level: Highest reading recorded
- Detections: Number of gas detection events
- Detection Time: Total time gas was detected
- Fan Runtime: Total time fan was active

### Event Timeline
- Timestamped log of all system events
- Color-coded by event type (Gas Detected, Fan Activated, etc.)
- Auto-scrolling with newest events at top

## Troubleshooting

### Arduino not detected?
- Ensure USB cable is properly connected
- Check Device Manager (Windows) or `ls /dev/tty*` (Mac/Linux) for COM port
- Install USB drivers if needed

### No data showing on dashboard?
- Check Arduino serial output format
- Verify baud rate is 9600
- Check browser console (F12) for JavaScript errors

### Connection keeps dropping?
- Ensure USB port is stable
- Try a different USB cable
- Restart the Node.js server

## Configuration

Edit `server.js` to customize:
- `PORT`: Change dashboard port (default: 3000)
- `MAX_DATA_POINTS`: Maximum chart data points (default: 1000)
- Baud rate: Change from 9600 if your Arduino uses different rate

## Browser Compatibility
- Chrome/Chromium: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Edge: ✅ Full support

## License

MIT

## Support

For issues or questions, please create an issue in the repository.
