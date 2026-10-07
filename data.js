/**
 * KernelSOC - Data Models & Default Attack Definitions
 */

// 6 Core Threat Processes as specified in KernelSOC requirements
const ATTACK_DEFINITIONS = [
  {
    id: 'malware_detection',
    name: 'Malware Detection',
    priority: 5, // 1 (Low) to 5 (Critical)
    priorityLabel: 'Critical',
    cpuBurst: 8, // Ticks required
    deadlineOffset: 12, // Ticks from arrival
    color: '#ef4444', // Red / Rose
    bgGlow: 'rgba(239, 68, 68, 0.15)',
    description: 'Immediate high-priority threat analysis. Triggers immediate preemption of lower-priority tasks.',
    category: 'Critical Threat'
  },
  {
    id: 'insider_threat',
    name: 'Insider Threat',
    priority: 5,
    priorityLabel: 'Critical',
    cpuBurst: 10,
    deadlineOffset: 15,
    color: '#f97316', // Orange
    bgGlow: 'rgba(249, 115, 22, 0.15)',
    description: 'Unauthorized data exfiltration or privilege escalation event requiring CPU time.',
    category: 'Critical Threat'
  },
  {
    id: 'ddos_alert',
    name: 'DDoS Alert',
    priority: 5,
    priorityLabel: 'Critical',
    cpuBurst: 6,
    deadlineOffset: 10,
    color: '#ec4899', // Pink / Magenta
    bgGlow: 'rgba(236, 72, 153, 0.15)',
    description: 'High-rate network volumetric traffic alert that stresses the ready queue and CPU scheduler.',
    category: 'Network Threat'
  },
  {
    id: 'brute_force',
    name: 'Brute Force Login',
    priority: 4,
    priorityLabel: 'High',
    cpuBurst: 7,
    deadlineOffset: 18,
    color: '#eab308', // Yellow / Amber
    bgGlow: 'rgba(234, 179, 8, 0.15)',
    description: 'Repeated authentication failure burst. Creates multiple related arrival events.',
    category: 'Auth Threat'
  },
  {
    id: 'phishing_email',
    name: 'Phishing Email',
    priority: 3,
    priorityLabel: 'Medium',
    cpuBurst: 5,
    deadlineOffset: 20,
    color: '#3b82f6', // Blue
    bgGlow: 'rgba(59, 130, 246, 0.15)',
    description: 'Short content analysis task with strict deadline for email header & URL inspection.',
    category: 'Email Threat'
  },
  {
    id: 'port_scan',
    name: 'Port Scan',
    priority: 2,
    priorityLabel: 'Medium / Low',
    cpuBurst: 15,
    deadlineOffset: 40,
    color: '#06b6d4', // Cyan
    bgGlow: 'rgba(6, 182, 212, 0.15)',
    description: 'Long-running background network recon analysis. Ideal candidate for preemption demonstration.',
    category: 'Reconnaissance'
  }
];

// PCB (Process Control Block) Data Structure Builder
class PCB {
  constructor(pid, attackData, customParams = {}) {
    const attackDef = ATTACK_DEFINITIONS.find(a => a.name === attackData || a.id === attackData) || ATTACK_DEFINITIONS[0];
    
    this.pid = pid;
    this.attack = attackDef.name;
    this.attackId = attackDef.id;
    this.priority = customParams.priority !== undefined ? customParams.priority : attackDef.priority;
    this.priorityLabel = this.getPriorityLabel(this.priority);
    this.state = customParams.state || 'NEW'; // NEW, READY, RUNNING, PREEMPTED, COMPLETED
    this.arrivalTime = customParams.arrivalTime || Date.now();
    this.arrivalTick = customParams.arrivalTick || 0;
    this.cpuBurst = customParams.cpuBurst !== undefined ? customParams.cpuBurst : attackDef.cpuBurst;
    this.remainingTime = customParams.remainingTime !== undefined ? customParams.remainingTime : this.cpuBurst;
    this.deadlineTick = customParams.deadlineTick || (this.arrivalTick + (attackDef.deadlineOffset || 20));
    this.deadlineTime = customParams.deadlineTime || (this.arrivalTime + ((attackDef.deadlineOffset || 20) * 1000));
    this.preemptions = customParams.preemptions || 0;
    this.contextSwitches = customParams.contextSwitches || 0;
    this.color = attackDef.color;
    this.bgGlow = attackDef.bgGlow;
    this.executionHistory = []; // Timeline of ticks where this PID ran
  }

  getPriorityLabel(priority) {
    if (priority >= 5) return 'Critical';
    if (priority >= 4) return 'High';
    if (priority >= 3) return 'Medium';
    if (priority >= 2) return 'Low';
    return 'Minimal';
  }

  toJSON() {
    return {
      pid: this.pid,
      attack: this.attack,
      priority: this.priority,
      state: this.state,
      arrivalTime: this.arrivalTime,
      arrivalTick: this.arrivalTick,
      cpuBurst: this.cpuBurst,
      remainingTime: this.remainingTime,
      deadline: this.deadlineTime,
      deadlineTick: this.deadlineTick,
      preemptions: this.preemptions,
      contextSwitches: this.contextSwitches
    };
  }
}
