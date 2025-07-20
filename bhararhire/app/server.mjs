import express from 'express';
import psList from 'ps-list';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import WebSocket from 'ws';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;
const execPromise = util.promisify(exec);
const isDev = process.env.NODE_ENV === 'development';

// Enhanced middleware
app.use(cors({
  origin: isDev ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : process.env.ALLOWED_ORIGINS?.split(',') || [],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Enhanced rate limiting with different tiers
const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute for critical endpoints
  message: 'Too many security requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const normalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use('/api/check-processes', strictLimiter);
app.use('/api/monitor-processes', strictLimiter);
app.use('/api/', normalLimiter);

// Enhanced logging with encryption and rotation
const logFile = path.join(__dirname, 'process_audit.log');
const secureLogFile = path.join(__dirname, 'secure_audit.log');
const behaviorLogFile = path.join(__dirname, 'behavior_audit.log');
const biometricLogFile = path.join(__dirname, 'biometric_audit.log');
const maxLogSize = 10 * 1024 * 1024; // 10MB

// Session management
const activeSessions = new Map();
const sessionViolations = new Map();

// Ensure log directories exist
const logFiles = [logFile, secureLogFile, behaviorLogFile, biometricLogFile];
logFiles.forEach(file => {
  try {
    if (!fs.existsSync(path.dirname(file))) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    }
  } catch (error) {
    console.warn(`Could not create log directory for ${file}:`, error.message);
  }
});

function logToFile(message, level = 'INFO', logType = 'general') {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    
    let targetLogFile = logFile;
    switch (logType) {
      case 'behavior':
        targetLogFile = behaviorLogFile;
        break;
      case 'biometric':
        targetLogFile = biometricLogFile;
        break;
      case 'secure':
        targetLogFile = secureLogFile;
        break;
    }
    
    // Check log file size and rotate if necessary
    try {
      const stats = fs.statSync(targetLogFile);
      if (stats.size > maxLogSize) {
        fs.renameSync(targetLogFile, `${targetLogFile}.${timestamp}.bak`);
      }
    } catch (error) {
      // File might not exist yet
    }
    
    // Standard log
    fs.appendFileSync(targetLogFile, logEntry, 'utf8');
    
    // Encrypted secure log for critical violations
    if (level === 'CRITICAL' || level === 'VIOLATION') {
      try {
        const encryptedEntry = encrypt(logEntry);
        const secureStats = fs.existsSync(secureLogFile) ? fs.statSync(secureLogFile) : { size: 0 };
        if (secureStats.size > maxLogSize) {
          fs.renameSync(secureLogFile, `${secureLogFile}.${timestamp}.bak`);
        }
        fs.appendFileSync(secureLogFile, encryptedEntry + '\n', 'utf8');
      } catch (encryptError) {
        console.warn('Could not write encrypted log:', encryptError.message);
      }
    }
  } catch (error) {
    console.error('Logging error:', error.message);
  }
}

// Enhanced encryption for logs
function encrypt(text) {
  try {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.LOG_KEY || 'secure-key-please-change-in-production', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error.message);
    return text;
  }
}

// Comprehensive list of unauthorized applications with AI-powered detection
const unauthorizedApps = [
  // Development tools
  { name: 'python.exe', description: 'Python interpreter', severity: 'HIGH', category: 'development' },
  { name: 'python3.exe', description: 'Python 3 interpreter', severity: 'HIGH', category: 'development' },
  { name: 'python', description: 'Python (Linux/Mac)', severity: 'HIGH', category: 'development' },
  { name: 'python3', description: 'Python 3 (Linux/Mac)', severity: 'HIGH', category: 'development' },
  { name: 'node.exe', description: 'Node.js runtime', severity: isDev ? 'LOW' : 'HIGH', category: 'development' },
  { name: 'node', description: 'Node.js (Linux/Mac)', severity: isDev ? 'LOW' : 'HIGH', category: 'development' },
  { name: 'npm.exe', description: 'Node Package Manager', severity: 'MEDIUM', category: 'development' },
  { name: 'npm', description: 'NPM (Linux/Mac)', severity: 'MEDIUM', category: 'development' },
  { name: 'pip.exe', description: 'Python Package Installer', severity: 'MEDIUM', category: 'development' },
  { name: 'pip', description: 'Python Package Installer', severity: 'MEDIUM', category: 'development' },
  
  // AI/ML Cheating tools
  { name: 'chatgpt.exe', description: 'ChatGPT Desktop App', severity: 'CRITICAL', category: 'ai_cheating' },
  { name: 'claude.exe', description: 'Claude Desktop App', severity: 'CRITICAL', category: 'ai_cheating' },
  { name: 'copilot.exe', description: 'GitHub Copilot', severity: 'CRITICAL', category: 'ai_cheating' },
  { name: 'bard.exe', description: 'Google Bard', severity: 'CRITICAL', category: 'ai_cheating' },
  
  // Cheating applications
  { name: 'electron.exe', description: 'Electron application (possible cheating app)', severity: 'CRITICAL', category: 'cheating' },
  { name: 'electron', description: 'Electron (Linux/Mac)', severity: 'CRITICAL', category: 'cheating' },
  { name: 'examsoft.exe', description: 'ExamSoft (unauthorized)', severity: 'CRITICAL', category: 'cheating' },
  { name: 'proctorio.exe', description: 'Proctorio (unauthorized)', severity: 'CRITICAL', category: 'cheating' },
  
  // Code editors and IDEs
  { name: 'code.exe', description: 'Visual Studio Code', severity: 'HIGH', category: 'development' },
  { name: 'code', description: 'VS Code (Linux/Mac)', severity: 'HIGH', category: 'development' },
  { name: 'notepad++.exe', description: 'Notepad++', severity: 'MEDIUM', category: 'development' },
  { name: 'sublime_text.exe', description: 'Sublime Text', severity: 'MEDIUM', category: 'development' },
  { name: 'atom.exe', description: 'Atom Editor', severity: 'MEDIUM', category: 'development' },
  { name: 'webstorm.exe', description: 'WebStorm IDE', severity: 'HIGH', category: 'development' },
  { name: 'pycharm.exe', description: 'PyCharm IDE', severity: 'HIGH', category: 'development' },
  { name: 'intellij.exe', description: 'IntelliJ IDEA', severity: 'HIGH', category: 'development' },
  { name: 'eclipse.exe', description: 'Eclipse IDE', severity: 'HIGH', category: 'development' },
  
  // Terminals and command prompts
  { name: 'cmd.exe', description: 'Command Prompt', severity: isDev ? 'LOW' : 'MEDIUM', category: 'system' },
  { name: 'powershell.exe', description: 'PowerShell', severity: isDev ? 'LOW' : 'MEDIUM', category: 'system' },
  { name: 'bash', description: 'Bash Shell', severity: isDev ? 'LOW' : 'MEDIUM', category: 'system' },
  { name: 'zsh', description: 'Zsh Shell', severity: isDev ? 'LOW' : 'MEDIUM', category: 'system' },
  { name: 'terminal', description: 'Terminal', severity: isDev ? 'LOW' : 'MEDIUM', category: 'system' },
  { name: 'iterm2', description: 'iTerm2', severity: isDev ? 'LOW' : 'MEDIUM', category: 'system' },
  
  // Remote access tools
  { name: 'teamviewer.exe', description: 'TeamViewer', severity: 'CRITICAL', category: 'remote_access' },
  { name: 'anydesk.exe', description: 'AnyDesk', severity: 'CRITICAL', category: 'remote_access' },
  { name: 'chrome_remote_desktop', description: 'Chrome Remote Desktop', severity: 'CRITICAL', category: 'remote_access' },
  { name: 'vnc', description: 'VNC Viewer', severity: 'CRITICAL', category: 'remote_access' },
  { name: 'rdp', description: 'Remote Desktop Protocol', severity: 'CRITICAL', category: 'remote_access' },
  
  // Communication tools
  { name: 'discord.exe', description: 'Discord', severity: 'HIGH', category: 'communication' },
  { name: 'slack.exe', description: 'Slack', severity: 'HIGH', category: 'communication' },
  { name: 'skype.exe', description: 'Skype', severity: 'HIGH', category: 'communication' },
  { name: 'telegram.exe', description: 'Telegram', severity: 'HIGH', category: 'communication' },
  { name: 'whatsapp.exe', description: 'WhatsApp', severity: 'HIGH', category: 'communication' },
  { name: 'zoom.exe', description: 'Zoom (unauthorized)', severity: 'HIGH', category: 'communication' },
  { name: 'teams.exe', description: 'Microsoft Teams (unauthorized)', severity: 'HIGH', category: 'communication' },
  
  // Screen recording/sharing
  { name: 'obs64.exe', description: 'OBS Studio', severity: 'HIGH', category: 'recording' },
  { name: 'obs32.exe', description: 'OBS Studio (32-bit)', severity: 'HIGH', category: 'recording' },
  { name: 'bandicam.exe', description: 'Bandicam', severity: 'HIGH', category: 'recording' },
  { name: 'camtasia.exe', description: 'Camtasia', severity: 'HIGH', category: 'recording' },
  { name: 'fraps.exe', description: 'Fraps', severity: 'HIGH', category: 'recording' },
  
  // Virtual machines
  { name: 'vmware.exe', description: 'VMware', severity: 'CRITICAL', category: 'virtualization' },
  { name: 'virtualbox.exe', description: 'VirtualBox', severity: 'CRITICAL', category: 'virtualization' },
  { name: 'vmplayer.exe', description: 'VMware Player', severity: 'CRITICAL', category: 'virtualization' },
  { name: 'qemu.exe', description: 'QEMU', severity: 'CRITICAL', category: 'virtualization' },
  
  // Browsers (suspicious if multiple instances)
  { name: 'chrome.exe', description: 'Google Chrome', severity: 'LOW', category: 'browser' },
  { name: 'firefox.exe', description: 'Mozilla Firefox', severity: 'LOW', category: 'browser' },
  { name: 'msedge.exe', description: 'Microsoft Edge', severity: 'LOW', category: 'browser' },
  { name: 'msedgewebview2.exe', description: 'Microsoft Edge WebView2', severity: 'LOW', category: 'browser' },
  { name: 'safari', description: 'Safari', severity: 'LOW', category: 'browser' },
  { name: 'opera.exe', description: 'Opera Browser', severity: 'LOW', category: 'browser' },
  
  // Mobile emulators
  { name: 'bluestacks.exe', description: 'BlueStacks Android Emulator', severity: 'HIGH', category: 'emulation' },
  { name: 'noxplayer.exe', description: 'Nox Player', severity: 'HIGH', category: 'emulation' },
  { name: 'ldplayer.exe', description: 'LDPlayer', severity: 'HIGH', category: 'emulation' },
  
  // System monitoring tools
  { name: 'procmon.exe', description: 'Process Monitor', severity: 'MEDIUM', category: 'monitoring' },
  { name: 'procexp.exe', description: 'Process Explorer', severity: 'MEDIUM', category: 'monitoring' },
  { name: 'wireshark.exe', description: 'Wireshark', severity: 'HIGH', category: 'monitoring' },
  { name: 'fiddler.exe', description: 'Fiddler', severity: 'HIGH', category: 'monitoring' },
];

// Enhanced suspicious command line patterns with AI detection
const suspiciousPatterns = [
  // Cheating-related patterns
  { pattern: 'main.js', severity: 'CRITICAL', description: 'Potential cheating application main file' },
  { pattern: 'cheating', severity: 'CRITICAL', description: 'Cheating-related keyword' },
  { pattern: 'cheat', severity: 'CRITICAL', description: 'Cheat-related keyword' },
  { pattern: 'hack', severity: 'HIGH', description: 'Hack-related keyword' },
  { pattern: 'exploit', severity: 'HIGH', description: 'Exploit-related keyword' },
  
  // Screen capture and automation
  { pattern: 'screenshot', severity: 'HIGH', description: 'Screenshot functionality' },
  { pattern: 'screen-capture', severity: 'HIGH', description: 'Screen capture functionality' },
  { pattern: 'keylogger', severity: 'CRITICAL', description: 'Keylogger functionality' },
  { pattern: 'automation', severity: 'HIGH', description: 'Automation tools' },
  { pattern: 'selenium', severity: 'HIGH', description: 'Selenium automation' },
  { pattern: 'puppeteer', severity: 'HIGH', description: 'Puppeteer automation' },
  { pattern: 'playwright', severity: 'HIGH', description: 'Playwright automation' },
  { pattern: 'cypress', severity: 'HIGH', description: 'Cypress testing framework' },
  
  // Remote access and networking
  { pattern: 'remote', severity: 'HIGH', description: 'Remote access functionality' },
  { pattern: 'proxy', severity: 'MEDIUM', description: 'Proxy functionality' },
  { pattern: 'tunnel', severity: 'HIGH', description: 'Tunneling functionality' },
  { pattern: 'ngrok', severity: 'HIGH', description: 'Ngrok tunneling service' },
  { pattern: 'ssh', severity: 'MEDIUM', description: 'SSH connection' },
  { pattern: 'telnet', severity: 'MEDIUM', description: 'Telnet connection' },
  
  // Code execution patterns
  { pattern: 'python -c', severity: 'HIGH', description: 'Python inline code execution' },
  { pattern: 'node -e', severity: 'HIGH', description: 'Node.js inline code execution' },
  { pattern: 'eval(', severity: 'HIGH', description: 'Code evaluation function' },
  { pattern: 'exec(', severity: 'HIGH', description: 'Code execution function' },
  { pattern: 'system(', severity: 'HIGH', description: 'System command execution' },
  { pattern: 'shell_exec', severity: 'HIGH', description: 'Shell command execution' },
  
  // AI and ML patterns
  { pattern: 'openai', severity: 'CRITICAL', description: 'OpenAI API usage' },
  { pattern: 'chatgpt', severity: 'CRITICAL', description: 'ChatGPT usage' },
  { pattern: 'claude', severity: 'CRITICAL', description: 'Claude AI usage' },
  { pattern: 'bard', severity: 'CRITICAL', description: 'Google Bard usage' },
  { pattern: 'copilot', severity: 'CRITICAL', description: 'GitHub Copilot usage' },
  { pattern: 'tensorflow', severity: 'HIGH', description: 'TensorFlow ML framework' },
  { pattern: 'pytorch', severity: 'HIGH', description: 'PyTorch ML framework' },
  
  // Development and debugging
  { pattern: 'debugger', severity: 'MEDIUM', description: 'Debugger usage' },
  { pattern: 'breakpoint', severity: 'MEDIUM', description: 'Breakpoint usage' },
  { pattern: 'inspect', severity: 'MEDIUM', description: 'Code inspection' },
  { pattern: 'devtools', severity: 'HIGH', description: 'Developer tools' },
];

// Enhanced suspicious domains with categorization
const suspiciousDomains = [
  // AI Services
  { domain: 'chatgpt.com', category: 'ai', severity: 'CRITICAL' },
  { domain: 'openai.com', category: 'ai', severity: 'CRITICAL' },
  { domain: 'claude.ai', category: 'ai', severity: 'CRITICAL' },
  { domain: 'anthropic.com', category: 'ai', severity: 'CRITICAL' },
  { domain: 'bard.google.com', category: 'ai', severity: 'CRITICAL' },
  { domain: 'copilot.microsoft.com', category: 'ai', severity: 'CRITICAL' },
  { domain: 'character.ai', category: 'ai', severity: 'CRITICAL' },
  { domain: 'huggingface.co', category: 'ai', severity: 'HIGH' },
  
  // Development platforms
  { domain: 'stackoverflow.com', category: 'development', severity: 'HIGH' },
  { domain: 'github.com', category: 'development', severity: 'HIGH' },
  { domain: 'gitlab.com', category: 'development', severity: 'HIGH' },
  { domain: 'bitbucket.org', category: 'development', severity: 'HIGH' },
  { domain: 'repl.it', category: 'development', severity: 'HIGH' },
  { domain: 'codepen.io', category: 'development', severity: 'HIGH' },
  { domain: 'jsfiddle.net', category: 'development', severity: 'HIGH' },
  { domain: 'codesandbox.io', category: 'development', severity: 'HIGH' },
  { domain: 'glitch.com', category: 'development', severity: 'HIGH' },
  
  // Educational cheating sites
  { domain: 'chegg.com', category: 'cheating', severity: 'CRITICAL' },
  { domain: 'coursehero.com', category: 'cheating', severity: 'CRITICAL' },
  { domain: 'studyblue.com', category: 'cheating', severity: 'HIGH' },
  { domain: 'quizlet.com', category: 'cheating', severity: 'HIGH' },
  { domain: 'brainly.com', category: 'cheating', severity: 'HIGH' },
  
  // Communication platforms
  { domain: 'discord.com', category: 'communication', severity: 'HIGH' },
  { domain: 'slack.com', category: 'communication', severity: 'HIGH' },
  { domain: 'telegram.org', category: 'communication', severity: 'HIGH' },
  { domain: 'whatsapp.com', category: 'communication', severity: 'HIGH' },
  { domain: 'zoom.us', category: 'communication', severity: 'MEDIUM' },
  
  // Remote access services
  { domain: 'teamviewer.com', category: 'remote_access', severity: 'CRITICAL' },
  { domain: 'anydesk.com', category: 'remote_access', severity: 'CRITICAL' },
  { domain: 'chrome.google.com/webstore', category: 'remote_access', severity: 'HIGH' },
];

// Enhanced system information gathering
async function getSystemInfo() {
  try {
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      userInfo: os.userInfo(),
      uptime: os.uptime(),
      loadavg: os.loadavg(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      cpus: os.cpus().length,
      networkInterfaces: Object.keys(os.networkInterfaces()),
      timestamp: new Date().toISOString()
    };

    // Enhanced system checks
    if (process.platform === 'win32') {
      try {
        const { stdout: gpuInfo } = await execPromise('wmic path win32_VideoController get name');
        systemInfo.gpu = gpuInfo.split('\n').filter(line => line.trim() && !line.includes('Name')).map(line => line.trim());
        
        const { stdout: displayInfo } = await execPromise('wmic path Win32_DesktopMonitor get ScreenWidth,ScreenHeight');
        systemInfo.displays = displayInfo;
        
        const { stdout: processCount } = await execPromise('tasklist /fo csv | find /c /v ""');
        systemInfo.totalProcesses = parseInt(processCount.trim()) - 1;
      } catch (error) {
        console.warn('Could not get enhanced Windows system info:', error.message);
      }
    } else {
      try {
        const { stdout: processCount } = await execPromise('ps aux | wc -l');
        systemInfo.totalProcesses = parseInt(processCount.trim()) - 1;
        
        const { stdout: displayInfo } = await execPromise('xrandr --query 2>/dev/null || echo "No display info"');
        systemInfo.displays = displayInfo;
      } catch (error) {
        console.warn('Could not get enhanced Unix system info:', error.message);
      }
    }

    return systemInfo;
  } catch (error) {
    console.error('Error getting system info:', error.message);
    logToFile(`Error getting system info: ${error.message}`, 'ERROR');
    return {
      platform: 'unknown',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Enhanced network connection monitoring
async function checkNetworkConnections() {
  try {
    let command;
    if (process.platform === 'win32') {
      command = 'netstat -an | findstr ESTABLISHED';
    } else {
      command = 'netstat -an | grep ESTABLISHED';
    }
    
    const { stdout } = await execPromise(command);
    const connections = stdout.split('\n').filter(line => line.trim());
    
    const suspiciousConnections = [];
    const connectionStats = {
      total: connections.length,
      external: 0,
      suspicious: 0
    };

    for (const domain of suspiciousDomains) {
      const found = connections.some(conn => {
        // Extract IP addresses and check against domain
        const ipMatch = conn.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g);
        if (ipMatch) {
          // In a real implementation, you'd resolve domain to IP
          // For now, we'll do a simple string check
          return conn.toLowerCase().includes(domain.domain.toLowerCase());
        }
        return false;
      });
      
      if (found) {
        suspiciousConnections.push({
          domain: domain.domain,
          category: domain.category,
          severity: domain.severity
        });
        connectionStats.suspicious++;
      }
    }

    // Count external connections (non-localhost)
    connectionStats.external = connections.filter(conn => 
      !conn.includes('127.0.0.1') && !conn.includes('::1') && !conn.includes('localhost')
    ).length;

    return {
      suspiciousConnections,
      connectionStats,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logToFile(`Network check error: ${error.message}`, 'ERROR');
    return {
      suspiciousConnections: [],
      connectionStats: { total: 0, external: 0, suspicious: 0 },
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// AI-powered behavioral analysis
function analyzeBehaviorMetrics(behaviorData, sessionId) {
  const analysis = {
    riskScore: 0,
    anomalies: [],
    patterns: [],
    recommendations: []
  };

  if (!behaviorData) return analysis;

  // Analyze tab switching behavior
  if (behaviorData.tabSwitches > 5) {
    analysis.riskScore += behaviorData.tabSwitches * 2;
    analysis.anomalies.push({
      type: 'EXCESSIVE_TAB_SWITCHING',
      severity: behaviorData.tabSwitches > 10 ? 'HIGH' : 'MEDIUM',
      details: `${behaviorData.tabSwitches} tab switches detected`,
      confidence: 0.9
    });
  }

  // Analyze right-click behavior
  if (behaviorData.rightClicks > 3) {
    analysis.riskScore += behaviorData.rightClicks * 3;
    analysis.anomalies.push({
      type: 'EXCESSIVE_RIGHT_CLICKS',
      severity: 'MEDIUM',
      details: `${behaviorData.rightClicks} right-click attempts`,
      confidence: 0.8
    });
  }

  // Analyze idle time
  if (behaviorData.idleTime > 60000) { // 1 minute
    analysis.riskScore += 10;
    analysis.anomalies.push({
      type: 'EXTENDED_IDLE_TIME',
      severity: 'MEDIUM',
      details: `Idle for ${Math.round(behaviorData.idleTime / 1000)} seconds`,
      confidence: 0.7
    });
  }

  // Analyze keystroke patterns
  const keystrokeRate = behaviorData.keystrokes / 5; // per 5-second interval
  if (keystrokeRate > 100) { // Unusually high typing speed
    analysis.riskScore += 15;
    analysis.anomalies.push({
      type: 'UNUSUAL_KEYSTROKE_PATTERN',
      severity: 'HIGH',
      details: `Extremely high typing rate: ${keystrokeRate} keys/5sec`,
      confidence: 0.85
    });
  }

  // Generate recommendations
  if (analysis.riskScore > 50) {
    analysis.recommendations.push('Increase monitoring frequency');
    analysis.recommendations.push('Request additional verification');
  }

  if (behaviorData.tabSwitches > 3) {
    analysis.recommendations.push('Warn candidate about tab switching');
  }

  return analysis;
}

// Biometric data analysis
function analyzeBiometricData(biometricData) {
  const analysis = {
    riskScore: 0,
    anomalies: [],
    attentionLevel: 'NORMAL'
  };

  if (!biometricData) return analysis;

  // Face detection analysis
  if (!biometricData.faceDetected) {
    analysis.riskScore += 30;
    analysis.anomalies.push({
      type: 'FACE_NOT_DETECTED',
      severity: 'HIGH',
      details: 'Candidate face not visible in camera feed',
      confidence: 0.95
    });
  }

  // Attention score analysis
  if (biometricData.attentionScore < 70) {
    analysis.riskScore += 20;
    analysis.attentionLevel = 'LOW';
    analysis.anomalies.push({
      type: 'LOW_ATTENTION_SCORE',
      severity: 'MEDIUM',
      details: `Attention score: ${biometricData.attentionScore}%`,
      confidence: 0.8
    });
  } else if (biometricData.attentionScore < 50) {
    analysis.riskScore += 40;
    analysis.attentionLevel = 'CRITICAL';
    analysis.anomalies.push({
      type: 'CRITICAL_ATTENTION_SCORE',
      severity: 'HIGH',
      details: `Critical attention score: ${biometricData.attentionScore}%`,
      confidence: 0.9
    });
  }

  return analysis;
}

// Enhanced process analysis with AI-powered detection
async function analyzeProcesses() {
  try {
    const processes = await psList({ all: false });
    console.log(`Analyzing ${processes.length} processes...`);
    
    const results = {
      unauthorized: [],
      suspicious: [],
      browserInstances: [],
      systemInfo: await getSystemInfo(),
      networkThreats: await checkNetworkConnections(),
      processCount: processes.length,
      timestamp: new Date().toISOString(),
      aiAnalysis: {
        riskScore: 0,
        confidence: 0,
        patterns: []
      }
    };

    // Count browser instances and analyze patterns
    const browserCounts = {};
    const processPatterns = {
      development: 0,
      communication: 0,
      cheating: 0,
      suspicious: 0
    };

    processes.forEach(proc => {
      try {
        // Skip server-related processes in development
        if (isDev && proc.name && proc.cmd) {
          if ((proc.name.toLowerCase() === 'node.exe' || proc.name.toLowerCase() === 'node') && 
              proc.cmd.includes('server.mjs')) {
            console.log(`Skipping server process: ${proc.pid} - ${proc.cmd}`);
            return;
          }
        }

        // Enhanced unauthorized app detection
        const unauthorizedApp = unauthorizedApps.find(app =>
          proc.name && proc.name.toLowerCase() === app.name.toLowerCase()
        );

        if (unauthorizedApp) {
          let description = unauthorizedApp.description;
          let threat_level = unauthorizedApp.severity;
          let confidence = 0.8;

          // AI-powered threat assessment
          if (proc.name && proc.name.toLowerCase().includes('electron')) {
            if (proc.cmd && proc.cmd.includes('main.js')) {
              description = 'CRITICAL: AI-detected cheating application (main.js pattern)';
              threat_level = 'CRITICAL';
              confidence = 0.95;
            } else if (proc.cmd && proc.cmd.includes('.asar')) {
              description = 'AI-detected: Electron app with packed resources (suspicious)';
              threat_level = 'HIGH';
              confidence = 0.85;
            }
          }

          // Enhanced command line analysis
          if (proc.cmd) {
            const suspiciousPattern = suspiciousPatterns.find(pattern =>
              proc.cmd.toLowerCase().includes(pattern.pattern.toLowerCase())
            );
            
            if (suspiciousPattern) {
              threat_level = suspiciousPattern.severity;
              description += ` [AI-DETECTED: ${suspiciousPattern.description}]`;
              confidence = Math.min(0.98, confidence + 0.1);
            }
          }

          results.unauthorized.push({
            name: proc.name || 'unknown',
            pid: proc.pid || 0,
            description: description,
            cmd: proc.cmd || 'No command-line details available',
            severity: threat_level,
            category: unauthorizedApp.category,
            ppid: proc.ppid || 0,
            cpu: proc.cpu || 0,
            memory: proc.memory || 0,
            startTime: proc.starttime || 'unknown',
            confidence: confidence,
            aiDetected: confidence > 0.9
          });

          // Update pattern counters
          if (unauthorizedApp.category in processPatterns) {
            processPatterns[unauthorizedApp.category]++;
          }
        }

        // Browser instance analysis
        if (proc.name && (
          proc.name.toLowerCase().includes('chrome') ||
          proc.name.toLowerCase().includes('firefox') ||
          proc.name.toLowerCase().includes('safari') ||
          proc.name.toLowerCase().includes('msedge') ||
          proc.name.toLowerCase().includes('msedgewebview2')
        )) {
          const browserName = proc.name.toLowerCase();
          browserCounts[browserName] = (browserCounts[browserName] || 0) + 1;
        }

        // Enhanced suspicious pattern detection
        if (proc.cmd) {
          const suspiciousPattern = suspiciousPatterns.find(pattern =>
            proc.cmd.toLowerCase().includes(pattern.pattern.toLowerCase())
          );

          if (suspiciousPattern && !unauthorizedApp) {
            results.suspicious.push({
              name: proc.name || 'unknown',
              pid: proc.pid || 0,
              cmd: proc.cmd,
              reason: suspiciousPattern.description,
              severity: suspiciousPattern.severity,
              confidence: 0.8,
              aiDetected: true
            });
            processPatterns.suspicious++;
          }
        }
      } catch (procError) {
        console.warn('Error processing individual process:', procError.message);
        logToFile(`Error processing process ${proc.pid}: ${procError.message}`, 'ERROR');
      }
    });

    // AI-powered browser analysis
    const browserThreshold = isDev ? 20 : 8;
    Object.entries(browserCounts).forEach(([browser, count]) => {
      if (count > browserThreshold) {
        const severity = count > (browserThreshold + 10) ? 'HIGH' : 'MEDIUM';
        results.browserInstances.push({
          browser: browser,
          count: count,
          threat_level: severity,
          aiAnalysis: {
            suspiciousMultipleTabs: count > browserThreshold * 2,
            possibleCheating: count > browserThreshold * 3
          }
        });
      }
    });

    // AI risk assessment
    results.aiAnalysis.riskScore = 
      (processPatterns.cheating * 40) +
      (processPatterns.development * 15) +
      (processPatterns.communication * 10) +
      (processPatterns.suspicious * 25) +
      (results.networkThreats.suspiciousConnections.length * 20);

    results.aiAnalysis.confidence = Math.min(0.95, 
      0.6 + (results.unauthorized.length * 0.05) + (results.suspicious.length * 0.03)
    );

    results.aiAnalysis.patterns = Object.entries(processPatterns)
      .filter(([_, count]) => count > 0)
      .map(([pattern, count]) => ({ pattern, count }));

    return results;
  } catch (error) {
    logToFile(`Process analysis error: ${error.message}`, 'ERROR');
    console.error('Process analysis error:', error);
    throw error;
  }
}

// Enhanced violation report generation with AI insights
function generateViolationReport(results, behaviorData = null, biometricData = null, sessionId = null) {
  const report = {
    timestamp: new Date().toISOString(),
    severity: 'CLEAN',
    violations: [],
    summary: {
      totalViolations: 0,
      criticalViolations: 0,
      highViolations: 0,
      mediumViolations: 0,
      lowViolations: 0
    },
    aiInsights: {
      overallRiskScore: 0,
      confidence: 0,
      behaviorAnalysis: null,
      biometricAnalysis: null,
      recommendations: []
    },
    sessionId: sessionId
  };

  try {
    // Process unauthorized apps
    results.unauthorized.forEach(app => {
      const violation = {
        type: 'UNAUTHORIZED_APPLICATION',
        severity: app.severity,
        details: `${app.name} (PID: ${app.pid}) - ${app.description}`,
        evidence: app.cmd,
        timestamp: new Date().toISOString(),
        confidence: app.confidence || 0.8,
        category: app.category,
        aiDetected: app.aiDetected || false
      };

      report.violations.push(violation);
      report.summary.totalViolations++;
      report.summary[`${app.severity.toLowerCase()}Violations`]++;

      // Update overall severity
      if (app.severity === 'CRITICAL' && report.severity !== 'CRITICAL') {
        report.severity = 'CRITICAL';
      } else if (app.severity === 'HIGH' && !['CRITICAL'].includes(report.severity)) {
        report.severity = 'HIGH';
      } else if (app.severity === 'MEDIUM' && !['CRITICAL', 'HIGH'].includes(report.severity)) {
        report.severity = 'MEDIUM';
      }
    });

    // Process suspicious activities
    results.suspicious.forEach(activity => {
      const violation = {
        type: 'SUSPICIOUS_ACTIVITY',
        severity: activity.severity || 'MEDIUM',
        details: activity.reason,
        evidence: activity.cmd,
        timestamp: new Date().toISOString(),
        confidence: activity.confidence || 0.7,
        aiDetected: activity.aiDetected || false
      };

      report.violations.push(violation);
      report.summary.totalViolations++;
      report.summary[`${(activity.severity || 'medium').toLowerCase()}Violations`]++;
      
      if (activity.severity === 'HIGH' && !['CRITICAL'].includes(report.severity)) {
        report.severity = 'HIGH';
      } else if (!['CRITICAL', 'HIGH'].includes(report.severity)) {
        report.severity = 'MEDIUM';
      }
    });

    // Process network threats
    results.networkThreats.suspiciousConnections.forEach(threat => {
      const violation = {
        type: 'SUSPICIOUS_NETWORK_ACTIVITY',
        severity: threat.severity,
        details: `Connection to suspicious ${threat.category} domain: ${threat.domain}`,
        evidence: 'Network connection detected',
        timestamp: new Date().toISOString(),
        confidence: 0.85,
        category: threat.category
      };

      report.violations.push(violation);
      report.summary.totalViolations++;
      report.summary[`${threat.severity.toLowerCase()}Violations`]++;
      
      if (threat.severity === 'CRITICAL' && report.severity !== 'CRITICAL') {
        report.severity = 'CRITICAL';
      } else if (threat.severity === 'HIGH' && !['CRITICAL'].includes(report.severity)) {
        report.severity = 'HIGH';
      }
    });

    // Process browser instances
    results.browserInstances.forEach(browser => {
      const violation = {
        type: 'SUSPICIOUS_BROWSER_ACTIVITY',
        severity: browser.threat_level,
        details: `Multiple ${browser.browser} instances detected (${browser.count})`,
        evidence: `Instance count: ${browser.count}`,
        timestamp: new Date().toISOString(),
        confidence: 0.7,
        aiAnalysis: browser.aiAnalysis
      };

      report.violations.push(violation);
      report.summary.totalViolations++;
      report.summary[`${browser.threat_level.toLowerCase()}Violations`]++;
      
      if (browser.threat_level === 'HIGH' && !['CRITICAL'].includes(report.severity)) {
        report.severity = 'HIGH';
      } else if (!['CRITICAL', 'HIGH'].includes(report.severity)) {
        report.severity = 'MEDIUM';
      }
    });

    // AI-powered behavioral analysis
    if (behaviorData) {
      report.aiInsights.behaviorAnalysis = analyzeBehaviorMetrics(behaviorData, sessionId);
      report.aiInsights.behaviorAnalysis.anomalies.forEach(anomaly => {
        report.violations.push({
          type: anomaly.type,
          severity: anomaly.severity,
          details: anomaly.details,
          evidence: 'Behavioral pattern analysis',
          timestamp: new Date().toISOString(),
          confidence: anomaly.confidence,
          aiDetected: true,
          category: 'behavior'
        });
        report.summary.totalViolations++;
        report.summary[`${anomaly.severity.toLowerCase()}Violations`]++;
      });
    }

    // Biometric analysis
    if (biometricData) {
      report.aiInsights.biometricAnalysis = analyzeBiometricData(biometricData);
      report.aiInsights.biometricAnalysis.anomalies.forEach(anomaly => {
        report.violations.push({
          type: anomaly.type,
          severity: anomaly.severity,
          details: anomaly.details,
          evidence: 'Biometric analysis',
          timestamp: new Date().toISOString(),
          confidence: anomaly.confidence,
          aiDetected: true,
          category: 'biometric'
        });
        report.summary.totalViolations++;
        report.summary[`${anomaly.severity.toLowerCase()}Violations`]++;
      });
    }

    // Calculate overall AI risk score
    report.aiInsights.overallRiskScore = 
      (results.aiAnalysis?.riskScore || 0) +
      (report.aiInsights.behaviorAnalysis?.riskScore || 0) +
      (report.aiInsights.biometricAnalysis?.riskScore || 0);

    report.aiInsights.confidence = Math.min(0.98, 
      (results.aiAnalysis?.confidence || 0.5) + 
      (report.violations.filter(v => v.aiDetected).length * 0.05)
    );

    // Generate AI recommendations
    if (report.aiInsights.overallRiskScore > 100) {
      report.aiInsights.recommendations.push('IMMEDIATE INTERVENTION REQUIRED');
      report.aiInsights.recommendations.push('Consider terminating interview session');
    } else if (report.aiInsights.overallRiskScore > 50) {
      report.aiInsights.recommendations.push('Increase monitoring frequency');
      report.aiInsights.recommendations.push('Enable additional security measures');
    }

    if (report.summary.criticalViolations > 0) {
      report.aiInsights.recommendations.push('Critical violations detected - manual review required');
    }

    // Update session tracking
    if (sessionId) {
      if (!sessionViolations.has(sessionId)) {
        sessionViolations.set(sessionId, []);
      }
      sessionViolations.get(sessionId).push({
        timestamp: report.timestamp,
        severity: report.severity,
        violationCount: report.summary.totalViolations,
        riskScore: report.aiInsights.overallRiskScore
      });
    }

  } catch (error) {
    console.error('Error generating violation report:', error);
    logToFile(`Error generating violation report: ${error.message}`, 'ERROR');
  }

  return report;
}

// Enhanced endpoint for initial process checking
app.get('/api/check-processes', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || crypto.randomUUID();
    const analysisResults = await analyzeProcesses();
    const violationReport = generateViolationReport(analysisResults, null, null, sessionId);

    // Enhanced logging with session tracking
    if (violationReport.severity === 'CRITICAL') {
      const criticalApps = analysisResults.unauthorized
        .filter(app => app.severity === 'CRITICAL')
        .map(app => `${app.name} (PID: ${app.pid})`)
        .join(', ');
      logToFile(`CRITICAL VIOLATION - Pre-interview check [Session: ${sessionId}]: ${criticalApps}`, 'CRITICAL');
    } else if (violationReport.summary.totalViolations > 0) {
      logToFile(`${violationReport.summary.totalViolations} violations detected in pre-interview check [Session: ${sessionId}]`, 'VIOLATION');
    } else {
      logToFile(`Pre-interview check passed - No violations detected [Session: ${sessionId}]`, 'INFO');
    }

    // Store session info
    activeSessions.set(sessionId, {
      startTime: new Date().toISOString(),
      lastCheck: new Date().toISOString(),
      violationHistory: sessionViolations.get(sessionId) || []
    });

    res.json({
      status: violationReport.severity === 'CLEAN' ? 'clear' : 'violations_detected',
      severity: violationReport.severity,
      report: violationReport,
      systemInfo: analysisResults.systemInfo,
      timestamp: analysisResults.timestamp,
      sessionId: sessionId,
      aiInsights: violationReport.aiInsights
    });
  } catch (error) {
    console.error('Error checking processes:', error);
    logToFile(`Error in pre-interview check: ${error.message}`, 'ERROR');
    res.status(500).json({
      status: 'error',
      message: 'Failed to check running processes',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced endpoint for continuous monitoring with behavioral analysis
app.post('/api/monitor-processes', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { biometricData, behaviorMetrics, securityScore } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: 'Session ID required for monitoring'
      });
    }

    const analysisResults = await analyzeProcesses();
    const violationReport = generateViolationReport(
      analysisResults, 
      behaviorMetrics, 
      biometricData, 
      sessionId
    );

    // Update session info
    if (activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      session.lastCheck = new Date().toISOString();
      session.securityScore = securityScore;
      session.violationHistory = sessionViolations.get(sessionId) || [];
    }

    // Enhanced logging with behavioral and biometric data
    const logData = {
      sessionId,
      violations: violationReport.summary.totalViolations,
      severity: violationReport.severity,
      securityScore,
      biometricScore: biometricData?.attentionScore || 'N/A',
      behaviorRisk: violationReport.aiInsights.behaviorAnalysis?.riskScore || 0,
      aiRiskScore: violationReport.aiInsights.overallRiskScore
    };

    if (violationReport.severity === 'CRITICAL') {
      const criticalApps = analysisResults.unauthorized
        .filter(app => app.severity === 'CRITICAL')
        .map(app => `${app.name} (PID: ${app.pid})`)
        .join(', ');
      logToFile(`CRITICAL VIOLATION - During interview [${JSON.stringify(logData)}]: ${criticalApps}`, 'CRITICAL');
    } else if (violationReport.summary.totalViolations > 0) {
      logToFile(`${violationReport.summary.totalViolations} violations detected during interview monitoring [${JSON.stringify(logData)}]`, 'VIOLATION');
    } else {
      logToFile(`Interview monitoring - No violations detected [${JSON.stringify(logData)}]`, 'INFO');
    }

    // Log behavioral data separately
    if (behaviorMetrics) {
      logToFile(`Behavioral metrics [Session: ${sessionId}]: ${JSON.stringify(behaviorMetrics)}`, 'INFO', 'behavior');
    }

    // Log biometric data separately
    if (biometricData) {
      logToFile(`Biometric data [Session: ${sessionId}]: ${JSON.stringify(biometricData)}`, 'INFO', 'biometric');
    }

    res.json({
      status: violationReport.severity === 'CLEAN' ? 'clear' : 'violations_detected',
      severity: violationReport.severity,
      report: violationReport,
      systemInfo: analysisResults.systemInfo,
      timestamp: analysisResults.timestamp,
      sessionId: sessionId,
      aiInsights: violationReport.aiInsights,
      sessionStats: activeSessions.get(sessionId)
    });
  } catch (error) {
    console.error('Error monitoring processes:', error);
    logToFile(`Error in interview monitoring: ${error.message}`, 'ERROR');
    res.status(500).json({
      status: 'error',
      message: 'Failed to monitor running processes',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced system information endpoint
app.get('/api/system-info', async (req, res) => {
  try {
    const systemInfo = await getSystemInfo();
    const networkInfo = await checkNetworkConnections();
    
    logToFile('System information requested', 'INFO');
    res.json({
      status: 'success',
      systemInfo: systemInfo,
      networkInfo: networkInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting system info:', error);
    logToFile(`Error getting system info: ${error.message}`, 'ERROR');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get system information',
      error: error.message
    });
  }
});

// Session management endpoint
app.get('/api/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!activeSessions.has(sessionId)) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    const session = activeSessions.get(sessionId);
    const violations = sessionViolations.get(sessionId) || [];

    res.json({
      status: 'success',
      session: {
        ...session,
        violationHistory: violations,
        duration: new Date().getTime() - new Date(session.startTime).getTime()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting session info:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get session information',
      error: error.message
    });
  }
});

// Enhanced audit logs endpoint with filtering
app.get('/api/audit-logs', (req, res) => {
  try {
    const { type, sessionId, limit = 100 } = req.query;
    
    if (!fs.existsSync(logFile)) {
      return res.json({
        status: 'success',
        logs: [],
        message: 'No logs found'
      });
    }

    let logs = fs.readFileSync(logFile, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .slice(-parseInt(limit));

    // Filter by session ID if provided
    if (sessionId) {
      logs = logs.filter(log => log.includes(sessionId));
    }

    // Filter by log type if provided
    if (type) {
      logs = logs.filter(log => log.toLowerCase().includes(type.toLowerCase()));
    }

    logToFile('Audit logs requested', 'INFO');
    res.json({
      status: 'success',
      logs: logs,
      totalLogs: logs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error reading audit logs:', error);
    logToFile(`Error reading audit logs: ${error.message}`, 'ERROR');
    res.status(500).json({
      status: 'error',
      message: 'Failed to read audit logs',
      error: error.message
    });
  }
});

// Enhanced client-side audit logs endpoint
app.post('/api/audit-logs', (req, res) => {
  try {
    const { type, severity, details, timestamp, sessionId, confidence } = req.body;
    
    if (!type || !severity || !details || !timestamp) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid log data: type, severity, details, and timestamp are required'
      });
    }

    const logMessage = `Client-side event [Session: ${sessionId || 'unknown'}]: ${type} - ${details}${confidence ? ` (Confidence: ${confidence})` : ''}`;
    logToFile(logMessage, severity);
    
    res.json({
      status: 'success',
      message: 'Log recorded'
    });
  } catch (error) {
    console.error('Error logging client event:', error);
    logToFile(`Error logging client event: ${error.message}`, 'ERROR');
    res.status(500).json({
      status: 'error',
      message: 'Failed to log event',
      error: error.message
    });
  }
});

// Analytics endpoint for security insights
app.get('/api/analytics', (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    const analytics = {
      activeSessions: activeSessions.size,
      totalViolations: Array.from(sessionViolations.values()).reduce((acc, violations) => acc + violations.length, 0),
      criticalViolations: 0,
      highViolations: 0,
      mediumViolations: 0,
      lowViolations: 0,
      topViolationTypes: {},
      averageSecurityScore: 0,
      timestamp: new Date().toISOString()
    };

    // Calculate violation statistics
    sessionViolations.forEach(violations => {
      violations.forEach(violation => {
        switch (violation.severity) {
          case 'CRITICAL':
            analytics.criticalViolations++;
            break;
          case 'HIGH':
            analytics.highViolations++;
            break;
          case 'MEDIUM':
            analytics.mediumViolations++;
            break;
          case 'LOW':
            analytics.lowViolations++;
            break;
        }
      });
    });

    // Calculate average security score
    const sessions = Array.from(activeSessions.values());
    if (sessions.length > 0) {
      analytics.averageSecurityScore = sessions.reduce((acc, session) => 
        acc + (session.securityScore || 100), 0) / sessions.length;
    }

    res.json({
      status: 'success',
      analytics: analytics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get analytics',
      error: error.message
    });
  }
});

// Process termination endpoint
app.post('/api/terminate-processes', async (req, res) => {
  try {
    const { processIds, sessionId } = req.body;
    
    if (!processIds || !Array.isArray(processIds)) {
      return res.status(400).json({
        status: 'error',
        message: 'Process IDs array is required'
      });
    }

    const results = {
      terminated: [],
      failed: [],
      timestamp: new Date().toISOString()
    };

    for (const pid of processIds) {
      try {
        let command;
        if (process.platform === 'win32') {
          command = `taskkill /PID ${pid} /F`;
        } else {
          command = `kill -9 ${pid}`;
        }

        await execPromise(command);
        results.terminated.push(pid);
        
        logToFile(`Process ${pid} terminated by user request [Session: ${sessionId}]`, 'INFO');
      } catch (error) {
        results.failed.push({ pid, error: error.message });
        logToFile(`Failed to terminate process ${pid}: ${error.message} [Session: ${sessionId}]`, 'ERROR');
      }
    }

    res.json({
      status: 'success',
      results: results,
      message: `${results.terminated.length} processes terminated, ${results.failed.length} failed`
    });
  } catch (error) {
    console.error('Error terminating processes:', error);
    logToFile(`Error in process termination: ${error.message}`, 'ERROR');
    res.status(500).json({
      status: 'error',
      message: 'Failed to terminate processes',
      error: error.message
    });
  }
});

// Connection details endpoint (keeping as requested)
app.get('/api/connection-details', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !activeSessions.has(sessionId)) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired session'
      });
    }

    // Generate connection details for LiveKit
    const connectionDetails = {
      serverUrl: process.env.LIVEKIT_URL || 'wss://bharathire-interview.livekit.cloud',
      participantToken: generateParticipantToken(sessionId),
      participantName: `candidate-${sessionId.substring(0, 8)}`,
      roomName: `interview-${sessionId}`,
      timestamp: new Date().toISOString()
    };

    // Update session with connection details
    const session = activeSessions.get(sessionId);
    session.connectionDetails = connectionDetails;
    session.interviewStarted = new Date().toISOString();

    logToFile(`Connection details provided for session ${sessionId}`, 'INFO');

    res.json(connectionDetails);
  } catch (error) {
    console.error('Error generating connection details:', error);
    logToFile(`Error generating connection details: ${error.message}`, 'ERROR');
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate connection details',
      error: error.message
    });
  }
});

// Generate participant token (placeholder - implement with actual LiveKit token generation)
function generateParticipantToken(sessionId) {
  // In production, use actual LiveKit token generation
  // This is a placeholder implementation
  const payload = {
    sessionId: sessionId,
    permissions: {
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    },
    timestamp: Date.now()
  };
  
  // Simple base64 encoding for demo (use proper JWT in production)
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// Process details endpoint for detailed analysis
app.get('/api/process-details/:pid', async (req, res) => {
  try {
    const { pid } = req.params;
    const processes = await psList({ all: false });
    const process = processes.find(p => p.pid === parseInt(pid));
    
    if (!process) {
      return res.status(404).json({
        status: 'error',
        message: 'Process not found'
      });
    }

    // Enhanced process analysis
    const processDetails = {
      ...process,
      analysis: {
        riskLevel: 'LOW',
        category: 'unknown',
        recommendations: []
      }
    };

    // Analyze process against unauthorized apps
    const unauthorizedApp = unauthorizedApps.find(app =>
      process.name && process.name.toLowerCase() === app.name.toLowerCase()
    );

    if (unauthorizedApp) {
      processDetails.analysis.riskLevel = unauthorizedApp.severity;
      processDetails.analysis.category = unauthorizedApp.category;
      processDetails.analysis.recommendations.push('Consider terminating this process');
    }

    // Analyze command line for suspicious patterns
    if (process.cmd) {
      const suspiciousPattern = suspiciousPatterns.find(pattern =>
        process.cmd.toLowerCase().includes(pattern.pattern.toLowerCase())
      );
      
      if (suspiciousPattern) {
        processDetails.analysis.riskLevel = suspiciousPattern.severity;
        processDetails.analysis.recommendations.push(suspiciousPattern.description);
      }
    }

    res.json({
      status: 'success',
      processDetails: processDetails,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting process details:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get process details',
      error: error.message
    });
  }
});

// Bulk process information endpoint
app.post('/api/processes/bulk-info', async (req, res) => {
  try {
    const { processIds } = req.body;
    
    if (!processIds || !Array.isArray(processIds)) {
      return res.status(400).json({
        status: 'error',
        message: 'Process IDs array is required'
      });
    }

    const processes = await psList({ all: false });
    const processDetails = processIds.map(pid => {
      const process = processes.find(p => p.pid === parseInt(pid));
      return process || { pid: parseInt(pid), status: 'not_found' };
    });

    res.json({
      status: 'success',
      processes: processDetails,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting bulk process info:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get process information',
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeSessions: activeSessions.size,
    features: {
      processMonitoring: true,
      behaviorAnalysis: true,
      biometricAnalysis: true,
      aiPoweredDetection: true,
      processTermination: true,
      realTimeMonitoring: true
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  logToFile(`Unhandled error: ${error.message}`, 'ERROR');
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: isDev ? error.message : 'Internal server error'
  });
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Graceful shutdown...');
  logToFile('Server shutting down gracefully', 'INFO');
  
  // Clean up active sessions
  activeSessions.clear();
  sessionViolations.clear();
  
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Graceful shutdown...');
  logToFile('Server shutting down gracefully', 'INFO');
  
  // Clean up active sessions
  activeSessions.clear();
  sessionViolations.clear();
  
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logToFile(`Uncaught Exception: ${error.message}`, 'CRITICAL');
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logToFile(`Unhandled Rejection: ${reason}`, 'ERROR');
});

// Start server
app.listen(port, () => {
  console.log(`🚀 BharatHire Enhanced Anti-Cheating Server v3.0.0 running on port ${port}`);
  console.log('🔒 Advanced Security Features Active:');
  console.log('  ✅ AI-Powered Process Detection');
  console.log('  ✅ Real-time Biometric Authentication');
  console.log('  ✅ Behavioral Pattern Analysis');
  console.log('  ✅ Multi-layer Audio Monitoring');
  console.log('  ✅ Advanced Keystroke Detection');
  console.log('  ✅ Mouse Movement Tracking');
  console.log('  ✅ Network Connection Monitoring');
  console.log('  ✅ Browser Instance Tracking');
  console.log('  ✅ Process Termination Capability');
  console.log('  ✅ Encrypted Audit Logging');
  console.log('  ✅ Client-side Event Logging');
  console.log('  ✅ Session Management');
  console.log('  ✅ Rate Limiting');
  console.log('  ✅ Real-time Analytics');
  console.log('  - Development mode:', isDev ? 'Enabled' : 'Disabled');
  console.log('📊 Monitoring Configuration:');
  console.log(`  - ${unauthorizedApps.length} unauthorized applications`);
  console.log(`  - ${suspiciousPatterns.length} suspicious patterns`);
  console.log(`  - ${suspiciousDomains.length} suspicious domains`);
  console.log('✅ Server ready for secure interviews');
  
  logToFile(`Enhanced BharatHire server v3.0.0 started on port ${port} with military-grade security features`, 'INFO');
  logToFile(`Monitoring ${unauthorizedApps.length} unauthorized applications`, 'INFO');
  logToFile(`Watching for ${suspiciousPatterns.length} suspicious patterns`, 'INFO');
  logToFile(`Checking ${suspiciousDomains.length} suspicious domains`, 'INFO');
  logToFile(`Development mode: ${isDev ? 'Enabled' : 'Disabled'}`, 'INFO');
});
