/**
 * KernelSOC - Main Application Controller & UI Renderer
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Core Engine & Hardware Driver
  const scheduler = new KernelScheduler();
  const serialDriver = new WebSerialDriver(scheduler);

  // 2. DOM Elements Selection
  const attackCardsList = document.getElementById('attack-cards-list');
  const readyQueueList = document.getElementById('ready-queue-list');
  const timelineTrack = document.getElementById('timeline-track');
  const logTerminal = document.getElementById('log-terminal');

  // Top Bar Elements
  const cpuStatusText = document.getElementById('cpu-status-text');
  const topPidText = document.getElementById('top-pid-text');
  const topQueueSize = document.getElementById('top-queue-size');
  const topTickText = document.getElementById('top-tick-text');
  const cpuDot = document.getElementById('cpu-dot');
  const serialDot = document.getElementById('serial-dot');
  const serialText = document.getElementById('serial-text');
  const btnPausePlay = document.getElementById('btn-pause-play');
  const iconPausePlay = document.getElementById('icon-pause-play');
  const textPausePlay = document.getElementById('text-pause-play');
  const btnStep = document.getElementById('btn-step');
  const btnReset = document.getElementById('btn-reset');
  const btnConnectSerial = document.getElementById('btn-connect-serial');
  const btnDemoScenario = document.getElementById('btn-demo-scenario');

  // CPU Card Elements
  const cpuActiveAttack = document.getElementById('cpu-active-attack');
  const cpuActivePid = document.getElementById('cpu-active-pid');
  const cpuPulse = document.getElementById('cpu-pulse');
  const cpuStatPriority = document.getElementById('cpu-stat-priority');
  const cpuStatState = document.getElementById('cpu-stat-state');
  const cpuStatBurst = document.getElementById('cpu-stat-burst');
  const cpuStatArrival = document.getElementById('cpu-stat-arrival');
  const cpuStatPreemptions = document.getElementById('cpu-stat-preemptions');
  const cpuStatSwitches = document.getElementById('cpu-stat-switches');
  const cpuProgressPercent = document.getElementById('cpu-progress-percent');
  const cpuProgressFill = document.getElementById('cpu-progress-fill');
  const queueCountBadge = document.getElementById('queue-count-badge');

  // Banner & Demo Elements
  const preemptionBanner = document.getElementById('preemption-banner');
  const preemptionBannerText = document.getElementById('preemption-banner-text');
  const demoTrackerBar = document.getElementById('demo-tracker-bar');
  const demoStepDescription = document.getElementById('demo-step-description');
  const btnCancelDemo = document.getElementById('btn-cancel-demo');

  // Modal Elements
  const pcbModal = document.getElementById('pcb-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalPid = document.getElementById('modal-pid');
  const modalAttackName = document.getElementById('modal-attack-name');
  const modalCategory = document.getElementById('modal-category');
  const modalPriorityBadge = document.getElementById('modal-priority-badge');
  const modalState = document.getElementById('modal-state');
  const modalBurst = document.getElementById('modal-burst');
  const modalRemaining = document.getElementById('modal-remaining');
  const modalArrival = document.getElementById('modal-arrival');
  const modalPreemptions = document.getElementById('modal-preemptions');
  const modalSwitches = document.getElementById('modal-switches');
  const modalJson = document.getElementById('modal-json');

  let activeDemoStep = null;
  let demoTimerId = null;

  // ----------------------------------------------------
  // RENDER THREAT CARDS
  // ----------------------------------------------------
  function renderThreatCards() {
    attackCardsList.innerHTML = '';
    ATTACK_DEFINITIONS.forEach(attack => {
      const card = document.createElement('div');
      card.className = 'attack-card';
      
      const badgeClass = attack.priority === 5 ? 'badge-critical' : 
                         attack.priority === 4 ? 'badge-high' : 
                         attack.priority === 3 ? 'badge-medium' : 'badge-low';

      card.innerHTML = `
        <div class="attack-card-stripe" style="background: ${attack.color};"></div>
        <div class="attack-card-header">
          <span class="attack-card-name">${attack.name}</span>
          <span class="priority-badge ${badgeClass}">P${attack.priority} — ${attack.priorityLabel}</span>
        </div>
        <div class="attack-card-desc">${attack.description}</div>
        <div class="attack-card-footer">
          <span class="attack-meta">Burst: ${attack.cpuBurst}t | DL: +${attack.deadlineOffset}t</span>
          <button class="btn btn-cyan btn-inject" data-attack="${attack.id}" style="padding: 4px 10px; font-size: 11px;">
            <i class="fa-solid fa-bolt"></i> Inject Event
          </button>
        </div>
      `;

      card.querySelector('.btn-inject').addEventListener('click', () => {
        scheduler.injectAttack(attack.id);
        if (serialDriver.isConnected) {
          serialDriver.sendInject(attack.name);
        }
      });

      attackCardsList.appendChild(card);
    });
  }

  // ----------------------------------------------------
  // UPDATE UI STATE
  // ----------------------------------------------------
  function updateUI() {
    // 1. Top bar stats
    topTickText.textContent = scheduler.timerTick;
    topQueueSize.textContent = scheduler.readyQueue.length;
    queueCountBadge.textContent = `${scheduler.readyQueue.length} PCBs`;

    if (scheduler.runningProcess) {
      cpuStatusText.textContent = 'RUNNING';
      topPidText.textContent = scheduler.runningProcess.pid;
      cpuDot.className = 'pill-dot running';

      cpuPulse.className = 'cpu-pulse-ring';
      cpuActiveAttack.textContent = scheduler.runningProcess.attack;
      cpuActivePid.textContent = `PID: ${scheduler.runningProcess.pid}`;
      cpuStatPriority.textContent = `P${scheduler.runningProcess.priority} (${scheduler.runningProcess.priorityLabel})`;
      cpuStatState.textContent = scheduler.runningProcess.state;
      cpuStatState.style.color = 'var(--accent-emerald)';
      cpuStatBurst.textContent = `${scheduler.runningProcess.remainingTime} / ${scheduler.runningProcess.cpuBurst} ticks`;
      cpuStatArrival.textContent = `Tick #${scheduler.runningProcess.arrivalTick}`;
      cpuStatPreemptions.textContent = scheduler.runningProcess.preemptions;
      cpuStatSwitches.textContent = scheduler.runningProcess.contextSwitches;

      const progress = Math.round(((scheduler.cpuBurst - scheduler.remainingTime) / scheduler.cpuBurst) * 100) ||
                       Math.round(((scheduler.runningProcess.cpuBurst - scheduler.runningProcess.remainingTime) / scheduler.runningProcess.cpuBurst) * 100);
      cpuProgressPercent.textContent = `${progress}%`;
      cpuProgressFill.style.width = `${progress}%`;
      cpuProgressFill.style.background = `linear-gradient(90deg, ${scheduler.runningProcess.color}, var(--accent-emerald))`;
    } else {
      cpuStatusText.textContent = 'IDLE';
      topPidText.textContent = '--';
      cpuDot.className = 'pill-dot offline';

      cpuPulse.className = 'cpu-pulse-ring idle';
      cpuActiveAttack.textContent = 'SYSTEM IDLE';
      cpuActivePid.textContent = 'PID: IDLE';
      cpuStatPriority.textContent = '--';
      cpuStatState.textContent = 'IDLE';
      cpuStatState.style.color = 'var(--text-dim)';
      cpuStatBurst.textContent = '0 / 0 ticks';
      cpuStatArrival.textContent = '--';
      cpuStatPreemptions.textContent = '0';
      cpuStatSwitches.textContent = '0';
      cpuProgressPercent.textContent = '0%';
      cpuProgressFill.style.width = '0%';
    }

    // 2. Render Ready Queue
    renderReadyQueue();

    // 3. Render CPU Timeline
    renderTimeline();
  }

  // ----------------------------------------------------
  // RENDER READY QUEUE
  // ----------------------------------------------------
  function renderReadyQueue() {
    readyQueueList.innerHTML = '';
    if (scheduler.readyQueue.length === 0) {
      readyQueueList.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 30px 10px; font-family: var(--font-mono); font-size: 12px;">
          <i class="fa-solid fa-inbox" style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;"></i>
          <div>Ready Queue is empty</div>
          <div style="font-size: 10px; color: var(--text-dim); margin-top: 4px;">Inject a threat event from the simulator</div>
        </div>
      `;
      return;
    }

    scheduler.readyQueue.forEach(pcb => {
      const item = document.createElement('div');
      item.className = 'pcb-item';
      
      const badgeClass = pcb.priority === 5 ? 'badge-critical' : 
                         pcb.priority === 4 ? 'badge-high' : 
                         pcb.priority === 3 ? 'badge-medium' : 'badge-low';

      item.innerHTML = `
        <div class="pcb-main-info">
          <span class="pcb-pid-badge">PID ${pcb.pid}</span>
          <span class="pcb-attack-name" style="color: ${pcb.color};">${pcb.attack}</span>
        </div>
        <div class="pcb-stats">
          <span class="priority-badge ${badgeClass}">P${pcb.priority}</span>
          <span style="color: var(--text-muted);">${pcb.remainingTime}t left</span>
          <i class="fa-solid fa-circle-info" style="color: var(--accent-cyan); cursor: pointer;" title="Inspect PCB"></i>
        </div>
      `;

      item.addEventListener('click', () => openPCBModal(pcb));
      readyQueueList.appendChild(item);
    });
  }

  // ----------------------------------------------------
  // RENDER CPU TIMELINE
  // ----------------------------------------------------
  function renderTimeline() {
    timelineTrack.innerHTML = '';
    if (scheduler.timelineSegments.length === 0) {
      timelineTrack.innerHTML = `
        <div style="color: var(--text-dim); font-family: var(--font-mono); font-size: 11px; padding: 10px;">
          No CPU execution history yet. Start simulation or step tick.
        </div>
      `;
      return;
    }

    scheduler.timelineSegments.forEach(seg => {
      const duration = seg.endTick - seg.startTick;
      if (duration <= 0) return;

      const block = document.createElement('div');
      block.className = `timeline-block ${seg.preempted ? 'preempted-marker' : ''}`;
      block.style.background = seg.color;
      block.style.flex = `${duration}`;

      block.innerHTML = `
        <div>PID ${seg.pid}</div>
        <div style="font-size: 8px; opacity: 0.8;">${seg.attack} (${duration}t)</div>
      `;
      block.title = `PID ${seg.pid} (${seg.attack})\nStart Tick: ${seg.startTick}\nEnd Tick: ${seg.endTick}\nDuration: ${duration} ticks\nPreempted: ${seg.preempted ? 'YES' : 'NO'}`;

      timelineTrack.appendChild(block);
    });

    // Auto scroll timeline to end
    const wrapper = timelineTrack.parentElement;
    wrapper.scrollLeft = wrapper.scrollWidth;
  }

  // ----------------------------------------------------
  // EVENT LOG RENDERER
  // ----------------------------------------------------
  function renderLogEvent(event) {
    const row = document.createElement('div');
    row.className = 'log-row';

    row.innerHTML = `
      <span class="log-time">[${event.timestamp} | T#${event.tick}]</span>
      <span class="log-type log-type-${event.type}">${event.type}</span>
      <span class="log-details">${event.details}</span>
    `;

    logTerminal.insertBefore(row, logTerminal.firstChild);
  }

  function clearLogs() {
    logTerminal.innerHTML = '';
  }

  // ----------------------------------------------------
  // PREEMPTION BANNER TRIGGER
  // ----------------------------------------------------
  function triggerPreemptionNotice(data) {
    preemptionBannerText.textContent = `${data.message} — Remaining CPU time saved in Ready Queue.`;
    preemptionBanner.classList.add('active');

    // Hide after 5 seconds
    setTimeout(() => {
      preemptionBanner.classList.remove('active');
    }, 5000);
  }

  // ----------------------------------------------------
  // PCB INSPECTOR MODAL
  // ----------------------------------------------------
  function openPCBModal(pcb) {
    modalPid.textContent = pcb.pid;
    modalAttackName.textContent = pcb.attack;
    modalCategory.textContent = pcb.getPriorityLabel(pcb.priority) + ' Priority Threat';
    
    modalPriorityBadge.textContent = `P${pcb.priority} — ${pcb.priorityLabel}`;
    modalPriorityBadge.className = `priority-badge ${pcb.priority === 5 ? 'badge-critical' : pcb.priority === 4 ? 'badge-high' : pcb.priority === 3 ? 'badge-medium' : 'badge-low'}`;

    modalState.textContent = pcb.state;
    modalBurst.textContent = `${pcb.cpuBurst} ticks`;
    modalRemaining.textContent = `${pcb.remainingTime} ticks`;
    modalArrival.textContent = `Tick #${pcb.arrivalTick}`;
    modalPreemptions.textContent = pcb.preemptions;
    modalSwitches.textContent = pcb.contextSwitches;

    modalJson.textContent = JSON.stringify(pcb.toJSON(), null, 2);

    pcbModal.classList.add('active');
  }

  modalCloseBtn.addEventListener('click', () => pcbModal.classList.remove('active'));
  pcbModal.addEventListener('click', (e) => {
    if (e.target === pcbModal) pcbModal.classList.remove('active');
  });

  // Also allow clicking CPU card to view current running PCB in modal
  document.querySelector('.cpu-card').addEventListener('click', () => {
    if (scheduler.runningProcess) {
      openPCBModal(scheduler.runningProcess);
    }
  });

  // ----------------------------------------------------
  // JUDGE DEMO SCENARIO RUNNER (Section 10)
  // ----------------------------------------------------
  function runDemoScenario() {
    scheduler.reset();
    clearLogs();
    
    demoTrackerBar.classList.add('active');
    scheduler.play();

    // Step 1: Inject Port Scan (Medium priority, long burst)
    demoStepDescription.textContent = 'Step 1/5: Injecting Port Scan background process (Priority 2, Burst 15t)...';
    const portScanPcb = scheduler.injectAttack('port_scan');

    // Step 2: Allow Port Scan to run for 3 ticks
    demoTimerId = setTimeout(() => {
      // Step 3: Inject Malware Detection (Critical priority)
      demoStepDescription.textContent = 'Step 2/5: Injecting Malware Detection CRITICAL event (Priority 5)! Preemption imminent...';
      const malwarePcb = scheduler.injectAttack('malware_detection');

      // Step 4: Verify Preemption in 2 seconds
      setTimeout(() => {
        demoStepDescription.textContent = 'Step 3/5: Malware Detection preempted Port Scan! Running Critical Malware response...';
        
        // Step 5: Wait for Malware Detection to finish
        setTimeout(() => {
          demoStepDescription.textContent = 'Step 4/5: Malware Detection completing... Port Scan will be restored from Ready Queue.';
          
          setTimeout(() => {
            demoStepDescription.textContent = 'Step 5/5: DEMO COMPLETE! Port Scan restored with remaining execution time saved.';
            setTimeout(() => {
              demoTrackerBar.classList.remove('active');
            }, 4000);
          }, 4000);
        }, 5000);
      }, 2000);
    }, 2500);
  }

  btnCancelDemo.addEventListener('click', () => {
    demoTrackerBar.classList.remove('active');
    if (demoTimerId) clearTimeout(demoTimerId);
  });

  btnDemoScenario.addEventListener('click', runDemoScenario);

  // ----------------------------------------------------
  // PLAY / PAUSE / STEP / RESET CONTROLS
  // ----------------------------------------------------
  btnPausePlay.addEventListener('click', () => {
    if (scheduler.isRunning) {
      scheduler.pause();
      iconPausePlay.className = 'fa-solid fa-play';
      textPausePlay.textContent = 'RESUME';
      if (serialDriver.isConnected) serialDriver.sendPause();
    } else {
      scheduler.play();
      iconPausePlay.className = 'fa-solid fa-pause';
      textPausePlay.textContent = 'PAUSE';
      if (serialDriver.isConnected) serialDriver.sendResume();
    }
  });

  btnStep.addEventListener('click', () => {
    scheduler.pause();
    iconPausePlay.className = 'fa-solid fa-play';
    textPausePlay.textContent = 'RESUME';
    scheduler.stepTick();
  });

  btnReset.addEventListener('click', () => {
    scheduler.reset();
    clearLogs();
    iconPausePlay.className = 'fa-solid fa-play';
    textPausePlay.textContent = 'RESUME';
    if (serialDriver.isConnected) serialDriver.sendReset();
  });

  // Speed selector buttons
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      const speed = parseInt(btn.getAttribute('data-speed'), 10);
      scheduler.setSpeed(speed);
    });
  });

  // Export Log button
  document.getElementById('btn-export-log').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scheduler.eventLog, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `kernelsoc_event_log_tick_${scheduler.timerTick}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  document.getElementById('btn-clear-log').addEventListener('click', clearLogs);

  // WebSerial Connect Button
  btnConnectSerial.addEventListener('click', async () => {
    if (!serialDriver.isConnected) {
      try {
        await serialDriver.connect();
      } catch (e) {
        alert('WebSerial Connection Failed: ' + e.message + '\n\nContinuing in simulated kernel mode.');
      }
    } else {
      await serialDriver.disconnect();
    }
  });

  serialDriver.onStatusChange = (connected, message) => {
    if (connected) {
      serialDot.className = 'pill-dot online';
      serialText.textContent = 'HARDWARE SOC ONLINE';
      btnConnectSerial.innerHTML = `<i class="fa-solid fa-plug-circle-xmark"></i> DISCONNECT`;
      btnConnectSerial.classList.replace('btn-cyan', 'btn-rose');
    } else {
      serialDot.className = 'pill-dot offline';
      serialText.textContent = 'SIMULATED CORE';
      btnConnectSerial.innerHTML = `<i class="fa-solid fa-plug"></i> CONNECT SERIAL`;
      btnConnectSerial.classList.replace('btn-rose', 'btn-cyan');
    }
  };

  // ----------------------------------------------------
  // SCHEDULER CALLBACK HOOKS
  // ----------------------------------------------------
  scheduler.onStateChange = updateUI;
  scheduler.onPreemption = triggerPreemptionNotice;
  scheduler.onEventLogged = renderLogEvent;

  // ----------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------
  renderThreatCards();
  scheduler.reset();
  scheduler.play(); // Auto-start simulation in active state
});
