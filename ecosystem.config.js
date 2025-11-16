/**
 * PM2 Ecosystem Configuration
 *
 * Production process management for InterviewLM
 * Runs both the Next.js application and BullMQ workers
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 logs
 *   pm2 restart all
 *   pm2 stop all
 */

module.exports = {
  apps: [
    {
      name: "interviewlm-app",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: "max", // Use all available CPUs
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "./logs/app-error.log",
      out_file: "./logs/app-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      max_memory_restart: "1G",
      // Auto restart on errors
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: "interviewlm-workers",
      script: "ts-node",
      args: "workers/start.ts",
      instances: 1, // Only one worker process needed
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/workers-error.log",
      out_file: "./logs/workers-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      max_memory_restart: "512M",
      // Auto restart on errors
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      // Graceful shutdown
      kill_timeout: 30000, // Give workers 30s to finish current jobs
      wait_ready: false,
    },
  ],
};
