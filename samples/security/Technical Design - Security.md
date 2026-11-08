# Online Permit Renewal — Technical Design: Security

Status: Approved · Approved by: Priya Natarajan (Security Architect) · 2026-10-12

## 1 Identity and access

### 1.1 Sign-in and multi-factor authentication
Staff sign in through the department's identity provider (Entra ID) with multi-factor authentication enforced by conditional access. Applicants sign in with the government sign-in service; no applicant passwords are stored in the solution.

### 1.2 Roles and permissions
Permissions are granted through four roles: Applicant, Case Officer, Supervisor and Administrator. Each API checks the caller's role before it reads or changes a case. Administrators cannot approve renewals.

### 1.3 Account lifecycle
Staff accounts come from the HR joiner-mover-leaver feed. Access is requested in the service portal and approved by the supervisor. Supervisors review their team's access every quarter; leavers are disabled within one business day.

### 1.4 Remote administration
Administration is done only from privileged access workstations through the platform's bastion service. There is no direct internet access to management ports.

## 2 Logging and monitoring

### 2.1 Audit events
The solution logs sign-ins, role changes, case decisions, document downloads and configuration changes to the central log workspace.

### 2.2 Log review and alerting
The operations team reviews the security log dashboard weekly. Alerts for repeated failed sign-ins and role changes go to the service desk queue.

### 2.3 Log retention and protection
Logs are kept for two years in an immutable store. Only the security operations group can read them, and nobody can delete them before the retention period ends.

## 3 Data protection

### 3.1 Encryption in transit
All traffic uses TLS 1.2 or higher. Internal service-to-service calls use mutual TLS through the API gateway.

### 3.2 Encryption at rest
Databases and document storage are encrypted with platform-managed encryption. Backups are encrypted the same way.

### 3.3 Key management
Keys and certificates are held in the department's key vault. Certificates are renewed automatically 30 days before expiry.

## 4 Network boundary
The portal is published through the web application firewall. Back-end services sit in a private network with no public addresses; only the API gateway can reach them.

## 5 Configuration and patching

### 5.1 Configuration baseline
Servers and services are built from the platform's hardened templates. Drift from the baseline is reported monthly.

### 5.2 Patch management
Security patches are applied monthly, and critical patches within 14 days, through the platform patching service.
