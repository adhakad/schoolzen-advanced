# Attendance — run notes

**Sync Now needs TWO running processes**: the API (enqueues the sync job) and the worker (consumes it).
If only the API runs, `POST /api/v2/attendance/sync` answers `SYNC_WORKER_DOWN`.

Start them as separate PM2 processes, from `backend/`:

```
pm2 start app.js --name schoolzen-api
pm2 start worker.js --name schoolzen-worker
```

Both read the same `backend/.env` (`DB_URL`, `REDIS_URL`, …). Check with `pm2 ls`; logs with `pm2 logs schoolzen-worker`.
After a deploy restart both: `pm2 restart schoolzen-api schoolzen-worker`.

Speed check: every API response carries `Server-Timing: total;dur=…, db;desc="<round trips>"`
(`backend/modules/middleware/server-timing.js`) — compare it with the browser time to split server time from network latency.
