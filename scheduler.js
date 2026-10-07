/**
 * KernelSOC - Preemptive Priority OS Scheduler Simulation Core
 */

class KernelScheduler {
  constructor() {
    this.pidCounter = 1;
    this.timerTick = 0;
    this.runningProcess = null;
    this.readyQueue = [];
    this.completedProcesses = [];
    this.timelineSegments = []; // { pid, attack, color, startTick, endTick, preempted: boolean }
    this.eventLog = [];
    this.isRunning = false;
    this.simulationSpeedMs = 800; // Tick interval in ms
    this.tickTimerId = null;

    // Event Listeners / Callbacks for UI updates
    this.onStateChange = null;
    this.onPreemption = null;
    this.onEventLogged = null;
  }

  // Generate unique PID (01, 02, etc.)
  generatePid() {
    const id = this.pidCounter++;
    return id < 10 ? `0${id}` : `${id}`;
  }

  // Inject a new attack event into the kernel
  injectAttack(attackName, customParams = {}) {
    const pid = customParams.pid || this.generatePid();
    const pcb = new PCB(pid, attackName, {
      ...customParams,
      arrivalTick: this.timerTick,
      arrivalTime: Date.now()
    });

    pcb.state = 'READY';
    this.readyQueue.push(pcb);

    this.logEvent({
      type: 'ARRIVED',
      pid: pcb.pid,
      attack: pcb.attack,
      priority: pcb.priority,
      details: `Event [${pcb.attack}] injected into kernel with Priority ${pcb.priority} (${pcb.priorityLabel})`,
      pcb: pcb
    });

    this.logEvent({
      type: 'QUEUED',
      pid: pcb.pid,
      attack: pcb.attack,
      priority: pcb.priority,
      details: `PCB PID ${pcb.pid} queued in Ready Queue`,
      pcb: pcb
    });

    // Check if newly injected process should preempt currently running process
    this.evaluateScheduling('ARRIVAL');

    if (this.onStateChange) this.onStateChange();
    return pcb;
  }

  // Core Scheduling Decision Evaluator
  evaluateScheduling(triggerReason = 'TICK') {
    // Sort ready queue by Priority (descending: 5 -> 1). If equal priority, sort by remaining time or arrival tick (EDF/FIFO)
    this.readyQueue.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority; // Higher priority number comes first
      }
      return a.arrivalTick - b.arrivalTick; // FIFO tie-breaker
    });

    if (this.readyQueue.length === 0 && !this.runningProcess) {
      return;
    }

    const highestPriorityCandidate = this.readyQueue[0];

    // Case 1: CPU is idle, pick highest priority task from ready queue
    if (!this.runningProcess && highestPriorityCandidate) {
      this.runningProcess = this.readyQueue.shift();
      this.runningProcess.state = 'RUNNING';
      this.runningProcess.contextSwitches++;
      
      this.startTimelineSegment(this.runningProcess);

      this.logEvent({
        type: 'RUNNING',
        pid: this.runningProcess.pid,
        attack: this.runningProcess.attack,
        priority: this.runningProcess.priority,
        details: `CPU dispatched PID ${this.runningProcess.pid} (${this.runningProcess.attack}) to RUNNING state`,
        pcb: this.runningProcess
      });
    }
    // Case 2: CPU is running a process, check if candidate in ready queue has HIGHER priority
    else if (this.runningProcess && highestPriorityCandidate && highestPriorityCandidate.priority > this.runningProcess.priority) {
      const victim = this.runningProcess;
      const intruder = this.readyQueue.shift();

      // PREEMPTION OCCURS!
      victim.state = 'PREEMPTED';
      victim.preemptions++;
      this.readyQueue.push(victim); // Re-queue victim

      // Sort ready queue again after victim returned
      this.readyQueue.sort((a, b) => b.priority - a.priority || a.arrivalTick - b.arrivalTick);

      // Close timeline segment for victim
      this.endTimelineSegment(true);

      // Set new running process
      intruder.state = 'RUNNING';
      intruder.contextSwitches++;
      this.runningProcess = intruder;

      // Start timeline segment for intruder
      this.startTimelineSegment(this.runningProcess);

      // Notify logs & preemption event
      const preemptionMsg = `PREEMPTION! Higher priority PID ${intruder.pid} (${intruder.attack}, P:${intruder.priority}) preempted PID ${victim.pid} (${victim.attack}, P:${victim.priority})`;
      
      this.logEvent({
        type: 'PREEMPTED',
        pid: victim.pid,
        attack: victim.attack,
        priority: victim.priority,
        details: `PID ${victim.pid} preempted by PID ${intruder.pid}. Saved remaining CPU burst: ${victim.remainingTime} ticks`,
        pcb: victim
      });

      this.logEvent({
        type: 'CONTEXT_SWITCH',
        pid: intruder.pid,
        attack: intruder.attack,
        priority: intruder.priority,
        details: `Context switch: PID ${victim.pid} (${victim.attack}) -> PID ${intruder.pid} (${intruder.attack})`,
        fromPid: victim.pid,
        toPid: intruder.pid,
        reason: 'higher_priority_preemption',
        pcb: intruder
      });

      if (this.onPreemption) {
        this.onPreemption({
          victim: victim,
          intruder: intruder,
          message: preemptionMsg
        });
      }
    }
  }

  // Advance simulation clock by 1 tick
  stepTick() {
    this.timerTick++;

    if (this.runningProcess) {
      this.runningProcess.remainingTime--;
      this.runningProcess.executionHistory.push(this.timerTick);

      // Update current timeline segment end tick
      if (this.timelineSegments.length > 0) {
        const lastSeg = this.timelineSegments[this.timelineSegments.length - 1];
        if (lastSeg && lastSeg.pid === this.runningProcess.pid) {
          lastSeg.endTick = this.timerTick;
        }
      }

      this.logEvent({
        type: 'TICK',
        pid: this.runningProcess.pid,
        attack: this.runningProcess.attack,
        priority: this.runningProcess.priority,
        details: `Tick #${this.timerTick}: PID ${this.runningProcess.pid} executing. Remaining time: ${this.runningProcess.remainingTime}/${this.runningProcess.cpuBurst} ticks`,
        pcb: this.runningProcess
      });

      // Check process completion
      if (this.runningProcess.remainingTime <= 0) {
        const finishedProcess = this.runningProcess;
        finishedProcess.state = 'COMPLETED';
        this.completedProcesses.push(finishedProcess);
        
        this.endTimelineSegment(false);
        this.runningProcess = null;

        this.logEvent({
          type: 'COMPLETED',
          pid: finishedProcess.pid,
          attack: finishedProcess.attack,
          priority: finishedProcess.priority,
          details: `PID ${finishedProcess.pid} (${finishedProcess.attack}) COMPLETED execution at tick #${this.timerTick}`,
          pcb: finishedProcess
        });

        // Trigger next process in queue
        this.evaluateScheduling('COMPLETION');
      }
    } else {
      // CPU Idle tick
      this.logEvent({
        type: 'TICK',
        pid: 'IDLE',
        attack: 'SYSTEM_IDLE',
        priority: 0,
        details: `Tick #${this.timerTick}: CPU is IDLE. Waiting for threat events...`,
        pcb: null
      });

      this.evaluateScheduling('IDLE_CHECK');
    }

    if (this.onStateChange) this.onStateChange();
  }

  startTimelineSegment(pcb) {
    this.timelineSegments.push({
      pid: pcb.pid,
      attack: pcb.attack,
      color: pcb.color,
      startTick: this.timerTick,
      endTick: this.timerTick + 1,
      preempted: false
    });
  }

  endTimelineSegment(wasPreempted = false) {
    if (this.timelineSegments.length > 0) {
      const lastSeg = this.timelineSegments[this.timelineSegments.length - 1];
      lastSeg.endTick = this.timerTick;
      if (wasPreempted) {
        lastSeg.preempted = true;
      }
    }
  }

  logEvent(eventObj) {
    const fullEvent = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      tick: this.timerTick,
      timestamp: new Date().toLocaleTimeString(),
      ...eventObj
    };
    this.eventLog.unshift(fullEvent); // Keep newest at top
    if (this.eventLog.length > 200) this.eventLog.pop(); // Cap log size
    if (this.onEventLogged) this.onEventLogged(fullEvent);
  }

  // Simulation controls
  play() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tickTimerId = setInterval(() => {
      this.stepTick();
    }, this.simulationSpeedMs);
  }

  pause() {
    this.isRunning = false;
    if (this.tickTimerId) {
      clearInterval(this.tickTimerId);
      this.tickTimerId = null;
    }
  }

  setSpeed(speedMs) {
    this.simulationSpeedMs = speedMs;
    if (this.isRunning) {
      this.pause();
      this.play();
    }
  }

  reset() {
    this.pause();
    this.pidCounter = 1;
    this.timerTick = 0;
    this.runningProcess = null;
    this.readyQueue = [];
    this.completedProcesses = [];
    this.timelineSegments = [];
    this.eventLog = [];
    
    this.logEvent({
      type: 'SYSTEM',
      pid: 'SYS',
      attack: 'KERNEL_RESET',
      priority: 0,
      details: 'Kernel SOC state, ready queue, timeline, and process counters reset to initial state.',
      pcb: null
    });

    if (this.onStateChange) this.onStateChange();
  }
}
