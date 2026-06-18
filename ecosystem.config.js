// PM2 config — cluster mode for zero-downtime `pm2 reload` on deploy.
// Two instances share port 3010; during a reload PM2 boots the replacement and
// only kills the old worker once the new one is listening, so the site never drops.
// NOTE: port 3010 is Mania's own. Port 3020 belongs to EPRIS Admin (a separate
// app/domain on this VPS) — do not reuse it here or the two sites collide.
module.exports = {
  apps: [
    {
      name: "maniagroup",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3010",
      cwd: "/opt/maniagroup",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "500M",
      listen_timeout: 12000,
      kill_timeout: 6000,
      env: { NODE_ENV: "production", PORT: "3010" },
    },
  ],
};
