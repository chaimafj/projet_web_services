# Urban Traffic Platform - Web Services + GraphQL Gateway

## Overview
Distributed application for smart urban traffic management based on microservices and a GraphQL API Gateway.

## Architecture
- `auth-service` (port 4001): register, login, JWT, roles `ADMIN` and `OPERATOR`.
- `vehicle-service` (port 4002): vehicles CRUD-lite and GPS position history.
- `traffic-service` (port 4003): traffic zones, density measurement, congestion detection.
- `incident-service` (port 4004): incident declaration, listing, status updates.
- `notification-service` (port 4005): notifications and mark-as-read + Socket.IO real-time events.
- `graphql-gateway` (port 4000): unified GraphQL API that orchestrates all services.

## Tech Stack
- Node.js + Express
- GraphQL (Apollo Server)
- PostgreSQL + Prisma ORM
- JWT authentication
- Zod validation
- Jest tests (basic scaffold)
- Docker Compose for local PostgreSQL instances
- GitHub Actions CI (install + test)

## Prerequisites
- Node.js 20+
- npm 10+
- Docker + Docker Compose

## Setup
1. Install dependencies
```bash
npm install
```

2. Copy env templates
```bash
copy .env.example .env
copy gateway\.env.example gateway\.env
copy services\auth-service\.env.example services\auth-service\.env
copy services\vehicle-service\.env.example services\vehicle-service\.env
copy services\traffic-service\.env.example services\traffic-service\.env
copy services\incident-service\.env.example services\incident-service\.env
copy services\notification-service\.env.example services\notification-service\.env
```

3. Start PostgreSQL containers
```bash
docker compose up -d
```

4. Generate Prisma clients
```bash
npm run prisma:generate
```

5. Apply database schema (from each service)
```bash
cd services\auth-service && npx prisma db push
cd ..\vehicle-service && npx prisma db push
cd ..\traffic-service && npx prisma db push
cd ..\incident-service && npx prisma db push
cd ..\notification-service && npx prisma db push
cd ..\..
```

6. Start all services
```bash
npm run dev
```

## Quick Validation
- End-to-end smoke test (GraphQL register/login/business flow):
```bash
npm run smoke:e2e
```
- Stop all local Node services on ports `4000-4005`:
```bash
npm run stop
```

## GraphQL Endpoint
- URL: `http://localhost:4000/graphql`
- See test operations in `graphql/test-queries.graphql`

## JWT Usage
1. Run `register` and `login` GraphQL mutations.
2. Copy returned token.
3. Send GraphQL requests with HTTP header:
```text
Authorization: Bearer <token>
```

## REST Endpoints by Service
### auth-service
- `POST /auth/register`
- `POST /auth/login`

### vehicle-service
- `POST /vehicles`
- `GET /vehicles`
- `GET /vehicles/:id`
- `POST /vehicles/:id/positions`
- `GET /vehicles/:id/positions`

### traffic-service
- `POST /traffic/zones`
- `POST /traffic/zones/:id/measure`
- `GET /traffic/zones`
- `GET /traffic/congested`

### incident-service
- `POST /incidents`
- `GET /incidents`
- `PATCH /incidents/:id/status`

### notification-service
- `POST /notifications`
- `GET /notifications`
- `PATCH /notifications/:id/read`

## Real-time Notifications (Bonus)
Socket.IO events emitted by notification service:
- `notification:new`
- `notification:read`

## Required Deliverables Mapping
- Source code: this repository
- Database: PostgreSQL schemas in each `services/*/prisma/schema.prisma`
- README: this file
- UML: placeholders in `docs/uml`
- Postman: `postman/UrbanTrafficPlatform.postman_collection.json`
- GraphQL tests: `graphql/test-queries.graphql`
- Presentation: create slides from architecture + demos

## Suggested Git Workflow
- `main` protected branch
- feature branches per service
- pull request + CI verification
