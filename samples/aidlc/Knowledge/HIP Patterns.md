# Hybrid Integration Platform (HIP) patterns

Contoso Licensing Agency · Integration Architecture (fictional) · Synthetic summary for the sample

Every interface control document (ICD) names the pattern it uses. The two approved patterns for Release 1 are:

## ARO P4: synchronous request/response through the API gateway
- REST over HTTPS through the HIP API gateway; OAuth 2.0 client credentials; mutual TLS between zones.
- For reads and short writes that need an immediate answer (under 2 seconds at p95).
- Errors are returned as the `Problem` model; the caller retries 5xx with the same correlation ID, up to 3 times.

## ARO P5: asynchronous events through the HIP message broker
- Publish/subscribe topics; at-least-once delivery; consumers must be idempotent.
- For notifications, status changes and anything that can wait (minutes).
- Failed messages go to a dead-letter queue after 5 attempts and raise an alert to the integration support team.

## Choosing
| Need | Pattern |
|---|---|
| An answer is needed now (eligibility, start a renewal) | ARO P4 |
| Fire and forget, or fan-out to several systems (notifications) | ARO P5 |
