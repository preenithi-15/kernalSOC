/**
 * KernelSOC - Web Serial API Driver & Protocol Integration
 */

class WebSerialDriver {
  constructor(scheduler) {
    this.scheduler = scheduler;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.isConnected = false;
    this.baudRate = 9600;
    this.buffer = '';
    
    // Callbacks
    this.onStatusChange = null;
    this.onRawData = null;
  }

  isSupported() {
    return 'serial' in navigator;
  }

  async connect() {
    if (!this.isSupported()) {
      throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });
      this.isConnected = true;

      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
      this.writer = textEncoder.writable.getWriter();

      this.readLoop();

      if (this.onStatusChange) this.onStatusChange(true, 'Connected to Hardware SOC');
      return true;
    } catch (err) {
      console.error('Serial connection error:', err);
      this.isConnected = false;
      if (this.onStatusChange) this.onStatusChange(false, err.message);
      throw err;
    }
  }

  async disconnect() {
    this.isConnected = false;
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
    }
    if (this.writer) {
      try {
        await this.writer.close();
      } catch (e) {}
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
      this.port = null;
    }
    if (this.onStatusChange) this.onStatusChange(false, 'Disconnected');
  }

  async readLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (this.isConnected) {
        const { value, done } = await this.reader.read();
        if (done) {
          this.reader.releaseLock();
          break;
        }
        if (value) {
          this.buffer += value;
          this.processBuffer();
        }
      }
    } catch (err) {
      console.error('Serial read loop error:', err);
    } finally {
      this.isConnected = false;
      if (this.onStatusChange) this.onStatusChange(false, 'Connection lost');
    }
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop(); // Keep last incomplete fragment in buffer

    for (const line of lines) {
      const trimmed = line.strip ? line.strip() : line.trim();
      if (!trimmed) continue;

      if (this.onRawData) this.onRawData(trimmed);

      try {
        const jsonMsg = JSON.parse(trimmed);
        this.handleHardwareEvent(jsonMsg);
      } catch (e) {
        // Line was plain text log from Arduino, log it
        console.log('[Hardware Log]', trimmed);
      }
    }
  }

  // Protocol event handling from Arduino/ESP32 kernel
  handleHardwareEvent(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'event':
        // Hardware injected or queued event
        this.scheduler.injectAttack(msg.attack, {
          pid: msg.pid,
          priority: msg.priority,
          state: msg.state || 'READY'
        });
        break;

      case 'switch':
        // Hardware forced context switch event
        this.scheduler.logEvent({
          type: 'CONTEXT_SWITCH',
          pid: msg.toPid,
          attack: 'HARDWARE_SWITCH',
          priority: 5,
          details: `Hardware switch: PID ${msg.fromPid} -> PID ${msg.toPid} (${msg.reason || 'hardware_event'})`
        });
        break;

      case 'tick':
        // Hardware clock tick
        if (this.scheduler.runningProcess && this.scheduler.runningProcess.pid === msg.pid) {
          this.scheduler.runningProcess.remainingTime = msg.remainingTime;
        }
        this.scheduler.stepTick();
        break;

      case 'complete':
        // Hardware task completion
        if (this.scheduler.runningProcess && this.scheduler.runningProcess.pid === msg.pid) {
          this.scheduler.runningProcess.remainingTime = 0;
          this.scheduler.stepTick();
        }
        break;
      
      default:
        console.log('Unknown hardware event:', msg);
    }
  }

  // Command dispatching to Arduino / ESP32 Controller
  async sendCommand(cmdObj) {
    const jsonStr = JSON.stringify(cmdObj) + '\n';
    if (this.isConnected && this.writer) {
      try {
        await this.writer.write(jsonStr);
        console.log('[Sent Command]', jsonStr);
      } catch (err) {
        console.error('Failed to send serial command:', err);
      }
    } else {
      console.log('[Simulated Serial Command]', jsonStr);
    }
  }

  sendInject(attackName) {
    this.sendCommand({ cmd: 'inject', attack: attackName });
  }

  sendPause() {
    this.sendCommand({ cmd: 'pause' });
  }

  sendResume() {
    this.sendCommand({ cmd: 'resume' });
  }

  sendReset() {
    this.sendCommand({ cmd: 'reset' });
  }
}
