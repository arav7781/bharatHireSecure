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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;
const execPromise = util.promisify(exec);

// Middleware
app.use(cors());
app.use(express.json());

// Enhanced logging with encryption
const logFile = path.join(__dirname, 'process_audit.log');
const secureLogFile = path.join(__dirname, 'secure_audit.log');

// Ensure log directory exists
try {
    if (!fs.existsSync(path.dirname(logFile))) {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
    }
} catch (error) {
    console.warn('Could not create log directory:', error.message);
}

function logToFile(message, level = 'INFO') {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level}] ${message}\n`;
        
        // Standard log
        fs.appendFileSync(logFile, logEntry, 'utf8');
        
        // Encrypted secure log for critical violations
        if (level === 'CRITICAL' || level === 'VIOLATION') {
            try {
                const encryptedEntry = encrypt(logEntry);
                fs.appendFileSync(secureLogFile, encryptedEntry + '\n', 'utf8');
            } catch (encryptError) {
                console.warn('Could not write encrypted log:', encryptError.message);
            }
        }
    } catch (error) {
        console.error('Logging error:', error.message);
    }
}

// Simple encryption for logs
function encrypt(text) {
    try {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(process.env.LOG_KEY || 'default-key-change-this', 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('Encryption error:', error.message);
        return text; // Fallback to plain text
    }
}

// Comprehensive list of unauthorized applications and patterns
const unauthorizedApps = [
    // Development tools
    { name: 'python.exe', description: 'Python interpreter', severity: 'HIGH' },
    { name: 'python3.exe', description: 'Python 3 interpreter', severity: 'HIGH' },
    { name: 'python', description: 'Python (Linux/Mac)', severity: 'HIGH' },
    { name: 'python3', description: 'Python 3 (Linux/Mac)', severity: 'HIGH' },
    { name: 'node.exe', description: 'Node.js runtime', severity: 'HIGH' },
    { name: 'node', description: 'Node.js (Linux/Mac)', severity: 'HIGH' },
    { name: 'npm.exe', description: 'Node Package Manager', severity: 'MEDIUM' },
    { name: 'npm', description: 'NPM (Linux/Mac)', severity: 'MEDIUM' },
    { name: 'pip.exe', description: 'Python Package Installer', severity: 'MEDIUM' },
    { name: 'pip', description: 'Python Package Installer', severity: 'MEDIUM' },
    
    // Cheating applications
    { name: 'electron.exe', description: 'Electron application (possible cheating app)', severity: 'CRITICAL' },
    { name: 'electron', description: 'Electron (Linux/Mac)', severity: 'CRITICAL' },
    
    // Code editors and IDEs
    { name: 'code.exe', description: 'Visual Studio Code', severity: 'HIGH' },
    { name: 'code', description: 'VS Code (Linux/Mac)', severity: 'HIGH' },
    { name: 'notepad++.exe', description: 'Notepad++', severity: 'MEDIUM' },
    { name: 'sublime_text.exe', description: 'Sublime Text', severity: 'MEDIUM' },
    { name: 'atom.exe', description: 'Atom Editor', severity: 'MEDIUM' },
    { name: 'webstorm.exe', description: 'WebStorm IDE', severity: 'HIGH' },
    { name: 'pycharm.exe', description: 'PyCharm IDE', severity: 'HIGH' },
    { name: 'intellij.exe', description: 'IntelliJ IDEA', severity: 'HIGH' },
    { name: 'eclipse.exe', description: 'Eclipse IDE', severity: 'HIGH' },
    
    // Terminals and command prompts
    { name: 'cmd.exe', description: 'Command Prompt', severity: 'MEDIUM' },
    { name: 'powershell.exe', description: 'PowerShell', severity: 'MEDIUM' },
    { name: 'bash', description: 'Bash Shell', severity: 'MEDIUM' },
    { name: 'zsh', description: 'Zsh Shell', severity: 'MEDIUM' },
    { name: 'terminal', description: 'Terminal', severity: 'MEDIUM' },
    { name: 'iterm2', description: 'iTerm2', severity: 'MEDIUM' },
    
    // Remote access tools
    { name: 'teamviewer.exe', description: 'TeamViewer', severity: 'CRITICAL' },
    { name: 'anydesk.exe', description: 'AnyDesk', severity: 'CRITICAL' },
    { name: 'chrome_remote_desktop', description: 'Chrome Remote Desktop', severity: 'CRITICAL' },
    { name: 'vnc', description: 'VNC Viewer', severity: 'CRITICAL' },
    
    // Communication tools
    { name: 'discord.exe', description: 'Discord', severity: 'HIGH' },
    { name: 'slack.exe', description: 'Slack', severity: 'HIGH' },
    { name: 'skype.exe', description: 'Skype', severity: 'HIGH' },
    { name: 'telegram.exe', description: 'Telegram', severity: 'HIGH' },
    { name: 'whatsapp.exe', description: 'WhatsApp', severity: 'HIGH' },
    
    // Screen recording/sharing
    { name: 'obs64.exe', description: 'OBS Studio', severity: 'HIGH' },
    { name: 'obs32.exe', description: 'OBS Studio (32-bit)', severity: 'HIGH' },
    { name: 'bandicam.exe', description: 'Bandicam', severity: 'HIGH' },
    { name: 'camtasia.exe', description: 'Camtasia', severity: 'HIGH' },
    
    // Virtual machines
    { name: 'vmware.exe', description: 'VMware', severity: 'CRITICAL' },
    { name: 'virtualbox.exe', description: 'VirtualBox', severity: 'CRITICAL' },
    { name: 'vmplayer.exe', description: 'VMware Player', severity: 'CRITICAL' },
    
    // Browsers (suspicious if multiple instances)
    { name: 'chrome.exe', description: 'Google Chrome', severity: 'LOW' },
    { name: 'firefox.exe', description: 'Mozilla Firefox', severity: 'LOW' },
    { name: 'msedge.exe', description: 'Microsoft Edge', severity: 'LOW' },
    { name: 'safari', description: 'Safari', severity: 'LOW' }
];

// Suspicious command line patterns
const suspiciousPatterns = [
    'main.js',
    'cheating',
    'screenshot',
    'keylogger',
    'automation',
    'selenium',
    'puppeteer',
    'playwright',
    'cypress',
    'remote',
    'proxy',
    'tunnel',
    'ngrok',
    'localhost:',
    'python -c',
    'node -e',
    'eval(',
    'exec(',
    'system(',
    'shell_exec'
];

// Check for network connections to suspicious domains
const suspiciousDomains = [
    'chatgpt.com',
    'openai.com',
    'claude.ai',
    'bard.google.com',
    'copilot.microsoft.com',
    'stackoverflow.com',
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'repl.it',
    'codepen.io',
    'jsfiddle.net',
    'codesandbox.io',
    'chegg.com',
    'coursehero.com'
];

// Function to get system information
async function getSystemInfo() {
    try {
        return {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            userInfo: os.userInfo(),
            uptime: os.uptime(),
            loadavg: os.loadavg(),
            totalmem: os.totalmem(),
            freemem: os.freemem(),
            cpus: os.cpus().length,
            networkInterfaces: Object.keys(os.networkInterfaces())
        };
    } catch (error) {
        console.error('Error getting system info:', error.message);
        return {
            platform: 'unknown',
            error: error.message
        };
    }
}

// Function to check for suspicious network connections
async function checkNetworkConnections() {
    try {
        let command;
        if (process.platform === 'win32') {
            command = 'netstat -an';
        } else {
            command = 'netstat -an';
        }
        
        const { stdout } = await execPromise(command);
        const connections = stdout.split('\n').filter(line => 
            line.trim() && line.includes('ESTABLISHED')
        );
        
        const suspiciousConnections = [];
        for (const domain of suspiciousDomains) {
            const found = connections.some(conn => conn.includes(domain));
            if (found) {
                suspiciousConnections.push(domain);
            }
        }
        
        return suspiciousConnections;
    } catch (error) {
        logToFile(`Network check error: ${error.message}`, 'ERROR');
        return [];
    }
}

// Enhanced process analysis
async function analyzeProcesses() {
    try {
        const processes = await psList({ all: false }); // Only user processes to avoid permission issues
        const results = {
            unauthorized: [],
            suspicious: [],
            browserInstances: [],
            systemInfo: await getSystemInfo(),
            networkThreats: await checkNetworkConnections(),
            processCount: processes.length,
            timestamp: new Date().toISOString()
        };

        // Count browser instances
        const browserCounts = {};
        
        processes.forEach(proc => {
            try {
                // Check unauthorized apps
                const unauthorizedApp = unauthorizedApps.find(app => 
                    proc.name && proc.name.toLowerCase() === app.name.toLowerCase()
                );
                
                if (unauthorizedApp) {
                    let description = unauthorizedApp.description;
                    let threat_level = unauthorizedApp.severity;
                    
                    // Enhanced electron detection
                    if (proc.name && proc.name.toLowerCase().includes('electron')) {
                        if (proc.cmd && proc.cmd.includes('main.js')) {
                            description = 'CRITICAL: Cheating application detected (main.js)';
                            threat_level = 'CRITICAL';
                        } else if (proc.cmd && proc.cmd.includes('.asar')) {
                            description = 'Electron app with packed resources (suspicious)';
                            threat_level = 'HIGH';
                        }
                    }
                    
                    // Check for suspicious command line patterns
                    const suspiciousCmd = proc.cmd ? suspiciousPatterns.some(pattern => 
                        proc.cmd.toLowerCase().includes(pattern.toLowerCase())
                    ) : false;
                    
                    if (suspiciousCmd) {
                        threat_level = 'CRITICAL';
                        description += ' [SUSPICIOUS COMMAND LINE DETECTED]';
                    }
                    
                    results.unauthorized.push({
                        name: proc.name || 'unknown',
                        pid: proc.pid || 0,
                        description: description,
                        cmd: proc.cmd || 'N/A',
                        severity: threat_level,
                        ppid: proc.ppid || 0,
                        cpu: proc.cpu || 0,
                        memory: proc.memory || 0,
                        startTime: proc.starttime || 'unknown'
                    });
                }
                
                // Count browser instances
                if (proc.name && (
                    proc.name.toLowerCase().includes('chrome') || 
                    proc.name.toLowerCase().includes('firefox') || 
                    proc.name.toLowerCase().includes('safari') || 
                    proc.name.toLowerCase().includes('edge')
                )) {
                    const browserName = proc.name.toLowerCase();
                    browserCounts[browserName] = (browserCounts[browserName] || 0) + 1;
                }
                
                // Check for processes with suspicious command lines
                if (proc.cmd) {
                    const hasSuspiciousPattern = suspiciousPatterns.some(pattern => 
                        proc.cmd.toLowerCase().includes(pattern.toLowerCase())
                    );
                    
                    if (hasSuspiciousPattern) {
                        results.suspicious.push({
                            name: proc.name || 'unknown',
                            pid: proc.pid || 0,
                            cmd: proc.cmd,
                            reason: 'Suspicious command line pattern detected'
                        });
                    }
                }
            } catch (procError) {
                console.warn('Error processing individual process:', procError.message);
            }
        });
        
        // Analyze browser instances
        Object.entries(browserCounts).forEach(([browser, count]) => {
            if (count > 3) { // More than 3 instances is suspicious
                results.browserInstances.push({
                    browser: browser,
                    count: count,
                    threat_level: count > 5 ? 'HIGH' : 'MEDIUM'
                });
            }
        });
        
        return results;
    } catch (error) {
        logToFile(`Process analysis error: ${error.message}`, 'ERROR');
        console.error('Process analysis error:', error);
        throw error;
    }
}

// Generate violation report
function generateViolationReport(results) {
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
        }
    };
    
    try {
        // Process unauthorized apps
        results.unauthorized.forEach(app => {
            const violation = {
                type: 'UNAUTHORIZED_APPLICATION',
                severity: app.severity,
                details: `${app.name} (PID: ${app.pid}) - ${app.description}`,
                evidence: app.cmd,
                timestamp: new Date().toISOString()
            };
            
            report.violations.push(violation);
            report.summary.totalViolations++;
            report.summary[`${app.severity.toLowerCase()}Violations`]++;
            
            if (app.severity === 'CRITICAL' && report.severity !== 'CRITICAL') {
                report.severity = 'CRITICAL';
            } else if (app.severity === 'HIGH' && report.severity === 'CLEAN') {
                report.severity = 'HIGH';
            }
        });
        
        // Process suspicious activities
        results.suspicious.forEach(activity => {
            report.violations.push({
                type: 'SUSPICIOUS_ACTIVITY',
                severity: 'MEDIUM',
                details: activity.reason,
                evidence: activity.cmd,
                timestamp: new Date().toISOString()
            });
            report.summary.totalViolations++;
            report.summary.mediumViolations++;
        });
        
        // Process network threats
        results.networkThreats.forEach(domain => {
            report.violations.push({
                type: 'SUSPICIOUS_NETWORK_ACTIVITY',
                severity: 'HIGH',
                details: `Connection to suspicious domain: ${domain}`,
                timestamp: new Date().toISOString()
            });
            report.summary.totalViolations++;
            report.summary.highViolations++;
            
            if (report.severity === 'CLEAN') {
                report.severity = 'HIGH';
            }
        });
        
        // Process browser instances
        results.browserInstances.forEach(browser => {
            report.violations.push({
                type: 'SUSPICIOUS_BROWSER_ACTIVITY',
                severity: browser.threat_level,
                details: `Multiple ${browser.browser} instances detected (${browser.count})`,
                timestamp: new Date().toISOString()
            });
            report.summary.totalViolations++;
            report.summary[`${browser.threat_level.toLowerCase()}Violations`]++;
        });
    } catch (error) {
        console.error('Error generating violation report:', error);
        logToFile(`Error generating violation report: ${error.message}`, 'ERROR');
    }
    
    return report;
}

// Enhanced endpoint to check running processes before starting the interview
app.get('/api/check-processes', async (req, res) => {
    try {
        const analysisResults = await analyzeProcesses();
        const violationReport = generateViolationReport(analysisResults);
        
        // Log the check
        if (violationReport.severity === 'CRITICAL') {
            const criticalApps = analysisResults.unauthorized
                .filter(app => app.severity === 'CRITICAL')
                .map(app => `${app.name} (PID: ${app.pid})`)
                .join(', ');
            logToFile(`CRITICAL VIOLATION - Pre-interview check: ${criticalApps}`, 'CRITICAL');
        } else if (violationReport.summary.totalViolations > 0) {
            logToFile(`${violationReport.summary.totalViolations} violations detected in pre-interview check`, 'VIOLATION');
        } else {
            logToFile('Pre-interview check passed - No violations detected', 'INFO');
        }
        
        res.json({
            status: violationReport.severity === 'CLEAN' ? 'clear' : 'violations_detected',
            severity: violationReport.severity,
            report: violationReport,
            systemInfo: analysisResults.systemInfo,
            timestamp: analysisResults.timestamp
        });
    } catch (error) {
        console.error('Error checking processes:', error);
        logToFile(`Error in pre-interview check: ${error.message}`, 'ERROR');
        res.status(500).json({
            status: 'error',
            message: 'Failed to check running processes',
            error: error.message
        });
    }
});

// Enhanced endpoint for continuous monitoring during the interview
app.get('/api/monitor-processes', async (req, res) => {
    try {
        const analysisResults = await analyzeProcesses();
        const violationReport = generateViolationReport(analysisResults);
        
        // Log monitoring results
        if (violationReport.severity === 'CRITICAL') {
            const criticalApps = analysisResults.unauthorized
                .filter(app => app.severity === 'CRITICAL')
                .map(app => `${app.name} (PID: ${app.pid})`)
                .join(', ');
            logToFile(`CRITICAL VIOLATION - During interview: ${criticalApps}`, 'CRITICAL');
        } else if (violationReport.summary.totalViolations > 0) {
            logToFile(`${violationReport.summary.totalViolations} violations detected during interview monitoring`, 'VIOLATION');
        }
        
        res.json({
            status: violationReport.severity === 'CLEAN' ? 'clear' : 'violations_detected',
            severity: violationReport.severity,
            report: violationReport,
            systemInfo: analysisResults.systemInfo,
            timestamp: analysisResults.timestamp
        });
    } catch (error) {
        console.error('Error monitoring processes:', error);
        logToFile(`Error in interview monitoring: ${error.message}`, 'ERROR');
        res.status(500).json({
            status: 'error',
            message: 'Failed to monitor running processes',
            error: error.message
        });
    }
});

// New endpoint to get detailed system information
app.get('/api/system-info', async (req, res) => {
    try {
        const systemInfo = await getSystemInfo();
        logToFile('System information requested', 'INFO');
        res.json({
            status: 'success',
            systemInfo: systemInfo,
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

// New endpoint to get audit logs (admin only)
app.get('/api/audit-logs', (req, res) => {
    try {
        if (!fs.existsSync(logFile)) {
            return res.json({ 
                status: 'success',
                logs: [], 
                message: 'No logs found' 
            });
        }
        
        const logs = fs.readFileSync(logFile, 'utf8')
            .split('\n')
            .filter(line => line.trim())
            .slice(-100); // Last 100 entries
        
        res.json({
            status: 'success',
            logs: logs,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error reading audit logs:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to read audit logs',
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    logToFile(`Unhandled error: ${error.message}`, 'ERROR');
    res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
});

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Graceful shutdown...');
    logToFile('Server shutting down gracefully', 'INFO');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Graceful shutdown...');
    logToFile('Server shutting down gracefully', 'INFO');
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

// Start server with enhanced security - SINGLE LISTEN CALL
app.listen(port, () => {
    console.log(`🚀 Enhanced Anti-Cheating Server running on port ${port}`);
    console.log('🔒 Security Features Active:');
    console.log('  - Process monitoring');
    console.log('  - Command line analysis');
    console.log('  - Network connection monitoring');
    console.log('  - Browser instance tracking');
    console.log('  - Encrypted audit logging');
    console.log('  - Real-time threat assessment');
    console.log('📊 Monitoring Configuration:');
    console.log(`  - ${unauthorizedApps.length} unauthorized applications`);
    console.log(`  - ${suspiciousPatterns.length} suspicious patterns`);
    console.log(`  - ${suspiciousDomains.length} suspicious domains`);
    console.log('✅ Server ready for connections');
    
    logToFile(`Enhanced server started on port ${port} with advanced security features`, 'INFO');
    logToFile(`Monitoring ${unauthorizedApps.length} unauthorized applications`, 'INFO');
    logToFile(`Watching for ${suspiciousPatterns.length} suspicious patterns`, 'INFO');
    logToFile(`Checking ${suspiciousDomains.length} suspicious domains`, 'INFO');
});