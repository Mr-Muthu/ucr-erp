# UCR ERP System — Car Rental Company ERP

A full-stack ERP framework for a car rental business, covering fleet management,
bookings & reservations, driver/staff management, and billing/invoicing —
built on a scalable architecture so more modules (GPS tracking, multi-branch,
customer self-service portal, payroll, reporting) can be added later.

## Architecture

```
UCR ERP System/
├── server/                 # Node.js + Express REST API
│   ├── prisma/
│   │   └── schema.prisma   # Full data model (Postgres)
│   ├── src/
│   │   ├── config/         # DB client, env config
│   │   ├── middleware/     # auth (JWT), RBAC, error handler
│   │   ├── modules/        # one folder per domain module
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── vehicles/
│   │   │   ├── maintenance/
│   │   │   ├── customers/
│   │   │   ├── drivers/
│   │   │   ├── bookings/
│   │   │   ├── invoices/
│   │   │   ├── payments/
│   │   │   ├── expenses/
│   │   │   └── dashboard/
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   └── package.json
├── client/                 # React + Vite + Tailwind SPA
│   └── src/
│       ├── api/            # axios client + per-module API calls
│       ├── auth/           # auth context, protected routes
│       ├── components/     # layout, generic CrudTable/CrudForm, ui bits
│       ├── pages/           # Dashboard, Vehicles, Bookings, Drivers, Invoices, ...
│       └── App.jsx
└── package.json             # npm workspaces root
```

Each backend module follows the same pattern: `routes.js` → `controller.js` →
Prisma queries, so adding a new module (e.g. GPS Tracking, Payroll) means
copying the pattern rather than inventing a new one.

## Tech stack

| Layer      | Choice                                             |
|------------|-----------------------------------------------------|
| Backend    | Node.js, Express, Prisma ORM, PostgreSQL             |
| Auth       | JWT (access token) + bcrypt password hashing, RBAC   |
| Frontend   | React 18, Vite, React Router, TailwindCSS, React Query, axios |
| Dev DB     | PostgreSQL (via Docker or local install)             |

## Data model (core entities)

- **User** (login identity) — role: `ADMIN | MANAGER | STAFF | ACCOUNTANT | DRIVER`
- **Vehicle**, **VehicleDocument** (RC/Insurance/Permit/PUC/Fitness), **MaintenanceRecord**
- **Customer**
- **Driver**
- **Booking**, **TripAssignment**
- **Invoice**, **InvoiceItem**, **Payment**
- **Expense**

See [`server/prisma/schema.prisma`](server/prisma/schema.prisma) for full field-level detail
and relations.

## Modules in this initial framework

1. **Fleet management** — vehicle registry, document expiry tracking, maintenance/service history.
2. **Booking & reservations** — customer bookings, vehicle availability check, pickup/drop, status workflow (`PENDING → CONFIRMED → ONGOING → COMPLETED / CANCELLED`).
3. **Driver & staff management** — driver profiles, license tracking, trip assignment.
4. **Billing, invoicing & payments** — generate invoices from completed bookings, record payments, track expenses.
5. **Dashboard** — fleet utilization, active bookings, revenue, overdue invoices, expiring documents.

## Roadmap (not yet built, but the architecture supports it)

- GPS/live tracking integration
- Multi-branch / multi-tenant support
- Customer self-service booking portal
- Payroll & HR beyond basic driver records
- SMS/email notifications (booking confirmation, document expiry alerts)
- Reporting & analytics module (charts, exports)
- Mobile app for drivers (trip start/end, odometer capture)

## Getting started

### 1. Prerequisites
- Node.js 18+
- PostgreSQL running locally (or via Docker — see `docker-compose.yml`)

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp server/.env.example server/.env
# edit server/.env with your DATABASE_URL and JWT_SECRET
```

### 4. Set up the database
```bash
npm run prisma:migrate
npm run seed
```
The seed script creates an admin login:
- email: `admin@ucr-erp.local`
- password: `Admin@123`

### 5. Run the app
```bash
npm run dev:server   # API on http://localhost:4000
npm run dev:client   # App on http://localhost:5173
```

## Optional: Postgres via Docker
```bash
docker compose up -d
```
