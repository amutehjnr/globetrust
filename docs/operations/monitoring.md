# Monitoring

## Endpoints
| URL | Use |
|-----|-----|
| `GET /health/live` | Liveness (load balancer) |
| `GET /health/ready` | Readiness (MySQL / Redis) |
| `GET /metrics` | Process stats (optional `METRICS_TOKEN`) |

## Uptime monitor example
Probe every 60s:

```
GET https://banking.example.com/health/ready
Expect: HTTP 200 and JSON status=ready
```

Alert if 2 consecutive failures.

## Metrics scrape
```
GET /metrics
Header: x-metrics-token: <METRICS_TOKEN>
```

Restrict `/metrics` to private networks at the reverse proxy.

## Heartbeat logs
Set `HEARTBEAT_MS=60000` to emit structured `event=heartbeat` logs for log-based monitors.
