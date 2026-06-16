// PM2 config — cluster mode for zero-downtime `pm2 reload` on deploy.
// Two instances share port 3020; during a reload PM2 boots the replacement and
// only kills the old worker once the new one is listening, so the site never drops.
module.exports = {
  apps: [
    {
      name: "maniagroup",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3020",
      cwd: "/opt/maniagroup",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "500M",
      listen_timeout: 12000,
      kill_timeout: 6000,
      env: { NODE_ENV: "production", PORT: "3020" },
    },
  ],
};
