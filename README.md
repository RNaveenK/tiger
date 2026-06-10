# Retail Pricing Feed

A web application for uploading, persisting, searching, and managing pricing data across 3000+ retail stores in multiple countries.

**Stack:** React 18 (Vite) · Node.js / Express · PostgreSQL · Redis · TypeScript

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Running the Backend](#running-the-backend)
- [Running the Frontend](#running-the-frontend)
- [Running Both Together](#running-both-together)
- [Running Tests](#running-tests)
- [Database Setup](#database-setup)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Architecture Overview](#architecture-overview)
- [Design Decisions](#design-decisions)
- [Non-Functional Requirements](#non-functional-requirements)
- [Assumptions](#assumptions)

---

## Prerequisites

Make sure you have the following installed on your machine:

| Tool | Version | Check Command |
|------|---------|---------------|
| Node.js | >= 20.0.0 | `node --version` |
| npm | >= 9.0.0 | `npm --version` |
| PostgreSQL | >= 14 | `psql --version` |
| Redis | >= 7.0 | `redis-cli --version` |

> **Note:** PostgreSQL and Redis are only required for full integration testing. The backend runs with in-memory stores for local development without external databases.

---

## Project Structure

```
retail-pricing-feed/
├── backend/                    # Node.js API server
│   ├── src/
│   │   ├── db/migrations/     # SQL migration scripts
│   │   ├── middleware/        # Auth & RBAC middleware
│   │   ├── services/          # Business logic services
│   │   ├── types/             # Shared TypeScript interfaces
│   │   ├── utils/             # Utility modules (currency codes, etc.)
│   │   └── index.ts           # Express server entry point
│   ├── tests/
│   │   ├── unit/              # Unit tests
│   │   ├── property/          # Property-based tests (fast-check)
│   │   ├── integration/       # Integration tests
│   │   └── helpers/           # Test utilities & generators
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── App.tsx            # Main application component
│   │   └── main.tsx           # Vite entry point
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── package.json                # Root workspace config
├── tsconfig.base.json          # Shared TypeScript config
├── .eslintrc.json              # ESLint config
├── .prettierrc                 # Prettier config
└── .gitignore
```

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd retail-pricing-feed
```

### 2. Install dependencies

From the root directory, run:

```bash
npm install
```

This installs dependencies for both `backend/` and `frontend/` workspaces via npm workspaces.

### 3. Verify installation

```bash
npm run test
```

This runs tests in both workspaces. All tests should pass with the in-memory stores (no external database required).

---

## Running the Backend

The backend is a Node.js/Express API server running on **port 3000** by default.

### Development mode (with hot reload)

```bash
# From root directory
npm run dev:backend

# OR from backend directory
cd backend
npm run dev
```

This starts the server with `tsx watch` which auto-reloads on file changes.

### Production build

```bash
cd backend
npm run build
npm start
```

### Verify the backend is running

Open your browser or use curl:

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-06-10T12:00:00.000Z"
}
```

---

## Running the Frontend

The frontend is a React SPA built with Vite, running on **port 5173** by default.

### Development mode (with hot reload)

```bash
# From root directory
npm run dev:frontend

# OR from frontend directory
cd frontend
npm run dev
```

### Production build

```bash
cd frontend
npm run build
npm run preview    # Preview production build locally
```

### Access the frontend

Open your browser at: **http://localhost:5173**

> The Vite dev server proxies all `/api/*` requests to `http://localhost:3000`, so the backend must be running for API calls to work.

---

## Running Both Together

You need **two terminal windows** (or use a tool like `concurrently`):

### Terminal 1 — Backend

```bash
npm run dev:backend
```

### Terminal 2 — Frontend

```bash
npm run dev:frontend
```

Then open **http://localhost:5173** in your browser.

### Alternative: Using concurrently (optional)

If you want a single-command solution, install `concurrently`:

```bash
npm install -D concurrently
```

Then add this to the root `package.json` scripts:

```json
"dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\""
```

And run:

```bash
npm run dev
```

---

## Running Tests

### All tests (both workspaces)

```bash
npm run test
```

### Backend only

```bash
cd backend
npm run test              # Single run
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
```

### Frontend only

```bash
cd frontend
npm run test              # Single run
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
```

### Test types

| Type | Location | Description |
|------|----------|-------------|
| Unit | `backend/tests/unit/` | Individual service/module tests |
| Property | `backend/tests/property/` | Property-based tests using fast-check (100 iterations per property) |
| Integration | `backend/tests/integration/` | End-to-end flow tests (requires DB) |

---

## Database Setup

> **For local development without a database:** The application runs with in-memory stores by default. Skip this section if you just want to run and test locally.

### Setting up PostgreSQL

1. Create a database:

```sql
CREATE DATABASE retail_pricing_feed;
```

2. Run migrations in order:

```bash
psql -d retail_pricing_feed -f backend/src/db/migrations/001_create_users.sql
psql -d retail_pricing_feed -f backend/src/db/migrations/002_create_pricing_records.sql
psql -d retail_pricing_feed -f backend/src/db/migrations/003_create_audit_log.sql
psql -d retail_pricing_feed -f backend/src/db/migrations/004_create_uploads.sql
psql -d retail_pricing_feed -f backend/src/db/migrations/005_create_security_audit_log.sql
```

3. Set the connection string environment variable (see [Environment Variables](#environment-variables)).

### Setting up Redis

Start a Redis instance on the default port (6379):

```bash
redis-server
```

Or using Docker:

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/retail_pricing_feed

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production

# File Upload
MAX_FILE_SIZE_MB=50
MAX_ROW_COUNT=200000
```

> **Important:** Never commit `.env` files to version control. The `.gitignore` already excludes them.

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | Public | Authenticate user, returns JWT |
| `POST` | `/api/auth/logout` | Authenticated | Invalidate session |
| `POST` | `/api/uploads` | Store Operator | Upload CSV pricing file |
| `GET` | `/api/uploads/:id/status` | Store Operator | Check upload processing status |
| `POST` | `/api/pricing-records/search` | Authenticated | Search with criteria |
| `GET` | `/api/pricing-records/:id` | Authenticated | Get single record |
| `PUT` | `/api/pricing-records/:id` | Operations Team | Edit record |
| `GET` | `/api/health` | Public | Health check |

### CSV Upload Format

The CSV file must contain these columns:

```csv
StoreID,SKU,Product Name,Price,Date
STORE-001,SKU-12345,Premium Widget,29.99,2024-03-15
STORE-001,SKU-67890,Basic Gadget,9.99,2024-03-15
```

- **StoreID**: Non-empty store identifier
- **SKU**: Non-empty product SKU
- **Product Name**: Product name (UTF-8, up to 500 chars)
- **Price**: Numeric value between 0.01 and 999,999.99
- **Date**: ISO 8601 date format (YYYY-MM-DD)

---

## Architecture Overview

### Context Diagram

The C4 Context Diagram shows how the system fits into the broader ecosystem and who interacts with it.

```mermaid
C4Context
    title Retail Pricing Feed – System Context

    Person(storeOp, "Store Operator", "Uploads CSV pricing feeds from individual stores")
    Person(opsTeam, "Operations Team", "Searches, reviews, and edits pricing records")
    Person(admin, "System Administrator", "Monitors system health and manages users")

    System(pricingFeed, "Pricing Feed System", "React SPA + Node.js API + PostgreSQL")

    System_Ext(idp, "Identity Provider", "Authenticates users and issues tokens")
    System_Ext(smtp, "Notification Service", "Sends alert notifications to admins")
    System_Ext(monitoring, "Monitoring Platform", "Collects metrics, logs, alerts")

    Rel(storeOp, pricingFeed, "Uploads CSV files")
    Rel(opsTeam, pricingFeed, "Searches and edits records")
    Rel(admin, pricingFeed, "Manages and monitors")
    Rel(pricingFeed, idp, "Validates credentials")
    Rel(pricingFeed, smtp, "Sends alert emails")
    Rel(pricingFeed, monitoring, "Exports metrics/logs")
```

### Solution Architecture

```mermaid
graph TB
    subgraph Client["Browser (React SPA)"]
        UI[React UI Layer]
        AuthClient[Auth Module]
        SearchUI[Search & Results]
        UploadUI[Upload Widget]
        EditorUI[Record Editor]
    end

    subgraph API["Node.js API Layer"]
        Gateway[API Gateway / Router]
        AuthMiddleware[Auth & RBAC Middleware]
        UploadSvc[Upload Service]
        SearchSvc[Search Service]
        EditSvc[Edit Service]
        AuditSvc[Audit Service]
        HealthSvc[Health Check Service]
    end

    subgraph Workers["Background Workers"]
        CSVParser[CSV Parser Worker]
        QueueProcessor[Upload Queue Processor]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL)]
        Redis[(Redis Cache)]
        Queue[(Message Queue)]
    end

    subgraph Infra["Infrastructure"]
        LB[Load Balancer / TLS Termination]
        Metrics[Metrics Collector]
        LogAgg[Log Aggregator]
    end

    UI --> LB
    LB --> Gateway
    Gateway --> AuthMiddleware
    AuthMiddleware --> UploadSvc
    AuthMiddleware --> SearchSvc
    AuthMiddleware --> EditSvc
    UploadSvc --> CSVParser
    UploadSvc --> Queue
    Queue --> QueueProcessor
    QueueProcessor --> PG
    SearchSvc --> PG
    SearchSvc --> Redis
    EditSvc --> PG
    EditSvc --> AuditSvc
    AuditSvc --> PG
    HealthSvc --> PG
    HealthSvc --> Redis
    Gateway --> Metrics
    Gateway --> LogAgg
```

### Component Summary

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React SPA)                     │
│  ┌─────────┐ ┌───────────┐ ┌──────────┐ ┌────────────┐ │
│  │Auth Form│ │Upload File│ │Search Bar│ │Record Edit │ │
│  └─────────┘ └───────────┘ └──────────┘ └────────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / REST
                         ▼
┌─────────────────────────────────────────────────────────┐
│                 Node.js API Layer                         │
│  ┌──────────┐ ┌───────────┐ ┌────────┐ ┌────────────┐  │
│  │Auth + JWT│ │Upload Svc │ │Search  │ │Edit + Audit│  │
│  │+ RBAC   │ │+ CSV Parse│ │Service │ │Service     │  │
│  └──────────┘ └───────────┘ └────────┘ └────────────┘  │
└────────┬───────────────┬────────────┬───────────────────┘
         │               │            │
         ▼               ▼            ▼
┌────────────┐  ┌────────────┐  ┌──────────┐
│ PostgreSQL │  │   Redis    │  │  Queue   │
│  (Data)    │  │  (Cache)   │  │(Uploads) │
└────────────┘  └────────────┘  └──────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| AuthService | JWT issuance, bcrypt password hashing, 30-min session timeout |
| LockoutService | 5 failed attempts → 15-min account lock, admin notifications |
| UploadService | File validation (50MB / 200K rows), currency code validation |
| CSV Parser | Streaming row-by-row parsing with backpressure |
| SearchService | Dynamic query builder, parameterized SQL, pagination (max 200/page) |
| EditService | Field validation, optimistic locking (version column) |
| CacheService | Redis-backed query caching with 60s TTL |
| SecurityAuditService | Logs all user actions for compliance |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **PostgreSQL** | ACID transactions, pg_trgm for substring search, table partitioning for 50M+ records |
| **Streaming CSV parsing** | Processes row-by-row to avoid OOM on 200K-row files |
| **Optimistic locking** | Low contention expected; avoids blocking reads with pessimistic locks |
| **JWT + HttpOnly cookie** | Stateless auth; HttpOnly prevents XSS token theft |
| **Redis caching** | Sub-2s search at 50M records; TTL-based invalidation |
| **Message queue for uploads** | Resilience during DB downtime; buffers up to 10K requests |
| **pg_trgm extension** | Case-insensitive substring matching at scale without Elasticsearch |
| **Parameterized queries** | Prevents SQL injection by design |

---

## Non-Functional Requirements

| Requirement | Target | How Addressed |
|-------------|--------|---------------|
| **Performance** | Search < 2s at P95, 100 concurrent users | Composite indexes, Redis cache, connection pooling |
| **Scalability** | 50M pricing records, 3000 stores | Table partitioning (monthly), horizontal backend scaling |
| **Availability** | 99.9% uptime | Multi-instance deployment, upload queue, automated backups |
| **Security** | TLS 1.2+, AES-256 at rest | Helmet headers, parameterized queries, bcrypt, account lockout |
| **Internationalization** | Multi-currency, UTF-8, locale dates | ISO 4217 validation, UTF-8 storage (500 chars), locale formatting |
| **Observability** | Health checks, structured logs, metrics | Pino JSON logging, /api/health, Prometheus metrics |
| **Recovery** | RTO 15 min, RPO 5 min | WAL replication, automated daily backups (90-day retention) |

---

## Assumptions

1. PostgreSQL is the approved relational database
2. A managed Redis-compatible cache service is available
3. User account provisioning (creating accounts, assigning roles) is handled by system admins
4. The system does not perform currency conversion — prices are stored as-uploaded with their stated currency
5. The dataset grows at approximately 200K records/day (1 upload per store per day)
6. Product Name substring search with pg_trgm is sufficient (full-text linguistic search not required)
7. The frontend is served as static assets from a CDN in production; the API is deployed separately

---

## Linting & Formatting

```bash
# Lint all files
npm run lint

# Format all files
npm run format

# Check formatting without writing
npm run format:check
```

---

## Troubleshooting

### "Cannot find module" errors after clone

```bash
npm install
```

### Port already in use

- Backend default: `3000` — change via `PORT` env var
- Frontend default: `5173` — change in `frontend/vite.config.ts`

### Tests failing with timeout

Increase the timeout in `backend/vitest.config.ts`:

```ts
test: {
  testTimeout: 60000, // 60 seconds
}
```

### Redis connection refused

If Redis isn't installed or running, the application falls back to in-memory caching for local development. For production testing, ensure Redis is running on port 6379.

---

## License

Private — Internal use only.
