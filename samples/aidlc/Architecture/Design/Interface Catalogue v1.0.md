> Approved by Solution Architect (fictional) on 2026-10-12T15:00:00.000Z

# Interface Catalogue

| Interface | From | To | Pattern |
|---|---|---|---|
| Case API | Existing applicant portal | Case management platform | REST, idempotent writes |
| Payment webhook | Enterprise payment gateway | Case management platform | Webhook |
| Notification API | Case management platform | Enterprise notification service | REST |
