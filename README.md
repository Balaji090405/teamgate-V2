# TeamGate: AWS Role-Based Project Tracker

TeamGate is a serverless, role-based project tracker built for managing project workflows securely across organizations. It enforces standard Role-Based Access Control (RBAC) across **ADMIN**, **MANAGER**, and **EMPLOYEE** roles following the principle: **"The UI hides, the server denies."**

---

## Live Links & Repository

- **Live Application**: [https://teamgate.vercel.app/](https://teamgate.vercel.app/)
- **API Base URL**: `https://zodir33jv0.execute-api.ap-south-1.amazonaws.com`
- **GitHub Repository**: [https://github.com/Balaji090405/teamgate](https://github.com/Balaji090405/teamgate)
- **AWS Region**: `ap-south-1`

---

## High-Level Architecture

```
                                  +-----------------------+
                                  |    Next.js 15 UI      |
                                  |   (Vercel Hosted)     |
                                  +-----------+-----------+
                                              |
                                              | 1. Authenticate / Issue JWT
                                              v
                                  +-----------------------+
                                  |   AWS Cognito Pool    |
                                  | (ap-south-1_7I0PAJ4Om)|
                                  +-----------+-----------+
                                              |
                                              | 2. Bearer <JWT Token>
                                              v
                                  +-----------------------+
                                  | API Gateway HTTP API  |
                                  | (HttpJwtAuthorizer)   |
                                  +-----------+-----------+
                                              |
                                              | 3. Verified Claims / Event
                                              v
                                  +-----------------------+
                                  |  AWS Lambda Handler   |
                                  | (Node.js 22 + TS)     |
                                  +-----------+-----------+
                                              |
                                              | 4. Workspace & RBAC Queries
                                              v
                                  +-----------------------+
                                  |   Amazon DynamoDB     |
                                  | (Single-Table Design) |
                                  +-----------------------+

                                  +-----------------------+
                                  |  Python Test Suite    |
                                  | (tests/python/...)    |
                                  +-----------+-----------+
                                              |
                                              | Direct HTTP Authorization Testing
                                              +-----------------------------------> API Gateway
```

---

## AWS Infrastructure & Stack

- **Authentication**: AWS Cognito User Pool (`ap-south-1_7I0PAJ4Om`) with `Admin`, `Manager`, and `Employee` groups issuing JWT tokens.
- **API Gateway**: HTTP API with `HttpJwtAuthorizer` validating Cognito JWTs and routing endpoints to Lambda.
- **Backend Function**: AWS Lambda running Node.js 22 with TypeScript (`infra/lambda/handler.ts`), handling effective role resolution, RBAC validation, project management, and user management.
- **Database**: Single-Table Amazon DynamoDB (`TeamGateStack-TeamGateTable312B575D-G7BPEQMX9Y2S`) with Pay-Per-Request billing, PK/SK primary keys, and GSI1 secondary index.
- **Infrastructure as Code**: AWS CDK (TypeScript) in `infra/`.
- **Frontend**: Next.js 15 App Router with Tailwind CSS hosted on Vercel.
- **Automated Security Testing**: Python 3 test harness executing real HTTP requests to verify backend 403 Forbidden enforcement.

> [!IMPORTANT]
> **Free-Tier Cost Compliance**:
> The architecture is completely serverless. It strictly avoids always-on, high-cost resources:
> - **NO** NAT Gateway
> - **NO** EC2 Instances
> - **NO** RDS Databases

---

## Role & Permission Matrix

Permissions are enforced strictly on the backend. Any unauthorized call directly to API Gateway returns `HTTP 403 Forbidden`.

| Action | API Route | ADMIN | MANAGER | EMPLOYEE |
|---|---|:---:|:---:|:---:|
| Read User Profile | `GET /me` | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| View Dashboard Stats | `GET /dashboard` | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| View Workspace Projects | `GET /projects` | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| Create Workspace Project | `POST /projects` | ✅ Allowed | ✅ Allowed | ❌ **403 Forbidden** |
| Edit Workspace Project | `PUT /projects/{id}` | ✅ Allowed | ✅ Allowed | ❌ **403 Forbidden** |
| Delete Project | `DELETE /projects/{id}` | ✅ Allowed | ❌ **403 Forbidden** | ❌ **403 Forbidden** |
| List Team Members | `GET /team` | ✅ Allowed | ✅ Allowed | ❌ **403 Forbidden** |
| Change Member Role | `PUT /team/{id}/role` | ✅ Allowed | ❌ **403 Forbidden** | ❌ **403 Forbidden** |
| View Activity Log | `GET /activity` | ✅ Allowed | ✅ Allowed | ✅ Allowed |

---

## Project Visibility Model

- Projects are **workspace-level resources**.
- When an Admin or Manager creates a project (`POST /projects`), it is associated with `WORKSPACE#<workspaceId>`.
- All users belonging to the same workspace (`ADMIN`, `MANAGER`, `EMPLOYEE`) can view the complete list of shared workspace projects.
- Projects are never restricted to only the individual creator.

---

## DynamoDB Single-Table Design

The single table uses `PK` (Partition Key) and `SK` (Sort Key), alongside Global Secondary Index `GSI1` (`GSI1PK`, `GSI1SK`).

### Primary Patterns

| Entity | PK | SK | GSI1PK | GSI1SK | Description |
|---|---|---|---|---|---|
| **Workspace Metadata** | `WORKSPACE#<wsId>` | `METADATA` | `WORKSPACE#LIST` | `METADATA` | Workspace creation info & owner details |
| **Workspace Member** | `WORKSPACE#<wsId>` | `MEMBER#<userId>` | `USER#<userId>` | `WORKSPACE#<wsId>` | Links user to workspace & records member role |
| **Project** | `WORKSPACE#<wsId>` | `PROJECT#<projId>` | - | - | Project details, status, timestamps |
| **Activity Log** | `WORKSPACE#<wsId>` | `ACTIVITY#<timestamp>#<id>` | - | - | Audit trail of project and role changes |

---

## Authentication & Authorization Flow

1. User authenticates on the Next.js frontend with AWS Cognito using SRP or `USER_PASSWORD_AUTH`.
2. Cognito validates credentials and issues an `IdToken` (JWT) containing user claims (`sub`, `email`, `cognito:groups`).
3. Frontend includes the JWT token in request headers: `Authorization: Bearer <IdToken>`.
4. API Gateway's `HttpJwtAuthorizer` validates the token's cryptographic signature, expiration, and audience.
5. Lambda extracts caller claims from `event.requestContext.authorizer.jwt.claims`.
6. Lambda evaluates caller role:
   - If user is the registered workspace owner (`isOwner: true`), role resolves to `ADMIN`.
   - Otherwise, caller role resolves directly from verified Cognito group claims (`Admin` -> `ADMIN`, `Manager` -> `MANAGER`, `Employee` -> `EMPLOYEE`).
7. Backend validates requested method & endpoint against role permissions. If unauthorized, returns `HTTP 403 Forbidden` with a JSON payload.

---

## Automated Security & API Testing (Python)

Per team guidelines, Python is incorporated for automated API security and authorization testing against live API Gateway endpoints.

### Location
All test scripts and documentation are in:
```
tests/python/
├── test_security_api.py
└── README.md
```

### Running the Python Tests
```bash
python tests/python/test_security_api.py
```

### Verified Test Cases
1. **ADMIN**: GET projects (200), POST project (201), PUT project (200), DELETE project (200).
2. **MANAGER**: GET projects (200), POST project (201), PUT project (200), DELETE project (**403 Forbidden**), Role Change (**403 Forbidden**).
3. **EMPLOYEE**: GET projects (200), POST project (**403 Forbidden**), PUT project (**403 Forbidden**), DELETE project (**403 Forbidden**), Role Change (**403 Forbidden**).
4. **UNAUTHENTICATED**: GET projects without token (**401 Unauthorized**).

---

## Local Development & Setup

### Prerequisites
- Node.js 22+
- Python 3.8+
- AWS CLI configured with `ap-south-1` region
- AWS CDK (`npm install -g aws-cdk`)

### Infrastructure Deployment
```bash
cd infra
npm install
npx cdk synth
npx cdk deploy
```

### Frontend Setup
Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=https://zodir33jv0.execute-api.ap-south-1.amazonaws.com
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-south-1_7I0PAJ4Om
NEXT_PUBLIC_COGNITO_CLIENT_ID=i2v5g1cputpqod4fj2bp7ivah
NEXT_PUBLIC_AWS_REGION=ap-south-1
```

Run frontend locally:
```bash
cd frontend
npm install
npm run dev
```

Build production bundle:
```bash
cd frontend
npm run build
```