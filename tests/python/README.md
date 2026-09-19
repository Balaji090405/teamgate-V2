# TeamGate Python Automated Security & API Test Suite

## Overview
As requested by team leadership, Python is incorporated into TeamGate for **Automated API & Security Testing**.

> [!NOTE]
> The backend server stack remains **Node.js 22 + TypeScript** deployed on AWS Lambda as specified by the project assignment requirements. Python is utilized as a external test harness to execute real HTTP request-based validation against AWS API Gateway endpoints.

---

## Test Coverage

The Python test suite (`test_security_api.py`) verifies the following security controls:

### 1. Account Authentication
Authenticates against AWS Cognito User Pool using the `USER_PASSWORD_AUTH` flow to acquire valid JWT ID tokens for:
- `ADMIN`: Configured via `ADMIN_EMAIL` (default: `teamgate@gmail.com`)
- `MANAGER`: Configured via `MANAGER_EMAIL`
- `EMPLOYEE`: Configured via `EMPLOYEE_EMAIL`

### 2. Authorization & HTTP Status Codes

| Endpoint | Action | ADMIN | MANAGER | EMPLOYEE | Unauthenticated |
|---|---|---|---|---|---|
| `/me` | GET | 200 OK | 200 OK | 200 OK | 401 Unauthorized |
| `/projects` | GET | 200 OK | 200 OK | 200 OK | 401 Unauthorized |
| `/projects` | POST | 201 Created | 201 Created | **403 Forbidden** | 401 Unauthorized |
| `/projects/{id}` | PUT | 200 OK | 200 OK | **403 Forbidden** | 401 Unauthorized |
| `/projects/{id}` | DELETE | 200 OK | **403 Forbidden** | **403 Forbidden** | 401 Unauthorized |
| `/team/{id}/role` | PUT | 200 OK | **403 Forbidden** | **403 Forbidden** | 401 Unauthorized |

---

## Execution Instructions

### Prerequisites
Python 3.8+ installed (uses standard library `urllib.request`, no pip dependencies required).

### Command
```bash
python tests/python/test_security_api.py
```

### Optional Environment Overrides
```bash
export API_URL="https://zodir33jv0.execute-api.ap-south-1.amazonaws.com"
export COGNITO_CLIENT_ID="i2v5g1cputpqod4fj2bp7ivah"
export ADMIN_PASSWORD="YourPassword"
python tests/python/test_security_api.py
```
