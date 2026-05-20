import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function killPort3001() {
  try {
    // Find PID using port 3001
    const { stdout } = await execAsync('netstat -ano | findstr :3001');
    
    if (!stdout.trim()) {
      console.log('✅ No process found on port 3001');
      return;
    }

    // Parse netstat output to extract PID
    const lines = stdout.trim().split('\n');
    const pids = new Set();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(parseInt(pid)) && parseInt(pid) > 0) {
        pids.add(pid);
      }
    }

    if (pids.size === 0) {
      console.log('✅ No valid PID found on port 3001');
      return;
    }

    console.log(`🔍 Found ${pids.size} process(es) on port 3001:`, [...pids]);

    // Kill each process
    for (const pid of pids) {
      try {
        await execAsync(`taskkill /F /PID ${pid}`);
        console.log(`✅ Killed process ${pid}`);
      } catch (error) {
        console.error(`❌ Failed to kill process ${pid}:`, error.message);
      }
    }

    console.log('🎉 Port 3001 reset complete');
  } catch (error) {
    if (error.stderr && error.stderr.includes('findstr')) {
      console.log('✅ No process found on port 3001');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

killPort3001();
