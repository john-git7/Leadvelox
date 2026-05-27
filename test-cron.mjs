console.log('⏳ Starting Local Vercel Cron Simulator...');
console.log('Hitting http://localhost:3000/api/cron/sla every 60 seconds.');
console.log('Press Ctrl+C to stop.\n');

// Perform an immediate ping on startup
const ping = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/cron/sla');
    const data = await res.json();
    console.log(`[${new Date().toLocaleTimeString()}] Cron pinged. Status: ${res.status}`);
    console.log(`Response:`, data);
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] Cron failed. Is your Next.js server running on port 3000?`);
  }
};

ping();
setInterval(ping, 60 * 1000); // 60 seconds
