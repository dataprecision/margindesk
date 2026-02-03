# MarginDesk - Local Development Setup

**Last Updated**: 2025-10-23
**Target**: Local development environment on macOS/Windows/Linux

---

## Prerequisites

### Required Software

| Software | Version | Purpose | Install Command |
|----------|---------|---------|----------------|
| **Node.js** | 20.x LTS | Runtime | `brew install node@20` (macOS) |
| **pnpm** | 8.x+ | Package manager | `npm install -g pnpm` |
| **PostgreSQL** | 14.x+ | Database (local) | `brew install postgresql@14` (macOS) |
| **Git** | Latest | Version control | Pre-installed on macOS |
| **VS Code** | Latest | IDE (recommended) | Download from code.visualstudio.com |

### Recommended VS Code Extensions

```json
{
  "recommendations": [
    "prisma.prisma",
    "bradlc.vscode-tailwindcss",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

---

## Step 1: Clone Repository & Install Dependencies

```bash
# Navigate to project directory
cd /Users/ketav/Documents/DWAOProjects/MarginDesk

# Install dependencies
pnpm install

# Verify installation
pnpm --version  # Should show 8.x+
node --version  # Should show v20.x
```

---

## Step 2: Local PostgreSQL Setup

### Option A: Use Local PostgreSQL (Recommended for Dev)

```bash
# Start PostgreSQL service (macOS with Homebrew)
brew services start postgresql@14

# Create database
createdb margindesk_dev

# Verify connection
psql margindesk_dev
# Type \q to exit
```

### Option B: Use Docker PostgreSQL

```bash
# Create docker-compose.yml (if not exists)
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: margindesk-postgres
    environment:
      POSTGRES_USER: margindesk
      POSTGRES_PASSWORD: dev_password_123
      POSTGRES_DB: margindesk_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
EOF

# Start PostgreSQL container
docker-compose up -d

# Verify container is running
docker ps | grep margindesk-postgres
```

---

## Step 3: Environment Variables Setup

```bash
# Copy example environment file
cp .env.example .env

# Open .env and fill in values
code .env
```

### `.env` File Contents

```bash
# ============================================================================
# DATABASE
# ============================================================================
# Local PostgreSQL
DATABASE_URL="postgresql://margindesk:dev_password_123@localhost:5432/margindesk_dev?schema=public"

# Or if using existing EC2 PostgreSQL (for testing production data locally)
# DATABASE_URL="postgresql://user:pass@your-ec2-ip:5432/margindesk?schema=public"

# ============================================================================
# NEXTAUTH (Authentication)
# ============================================================================
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="local-dev-secret-change-in-production"

# Microsoft Azure AD (for authentication)
AZURE_AD_CLIENT_ID="your-azure-app-client-id"
AZURE_AD_CLIENT_SECRET="your-azure-app-client-secret"
AZURE_AD_TENANT_ID="your-azure-tenant-id"

# ============================================================================
# MICROSOFT GRAPH API (User Sync)
# ============================================================================
AZURE_TENANT_ID="${AZURE_AD_TENANT_ID}"
AZURE_CLIENT_ID="${AZURE_AD_CLIENT_ID}"
AZURE_CLIENT_SECRET="${AZURE_AD_CLIENT_SECRET}"

# ============================================================================
# ZOHO BOOKS
# ============================================================================
ZOHO_CLIENT_ID="your-zoho-client-id"
ZOHO_CLIENT_SECRET="your-zoho-client-secret"
ZOHO_REDIRECT_URI="http://localhost:3000/api/auth/zoho/callback"
ZOHO_REGION="com" # or "in" for India, "eu" for Europe

# ============================================================================
# AWS S3 (Document Storage)
# ============================================================================
# For local dev, you can use MinIO or real AWS S3
AWS_REGION="ap-south-1"
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
S3_BUCKET_NAME="margindesk-documents-dev"

# OR use MinIO for local development (see Step 7)
# S3_ENDPOINT="http://localhost:9000"
# S3_FORCE_PATH_STYLE="true"

# ============================================================================
# FEATURE FLAGS (optional for dev)
# ============================================================================
ENABLE_MICROSOFT_SYNC="true"
ENABLE_ZOHO_SYNC="true"
ENABLE_ON_DEMAND_SYNC="true" # Enable manual sync triggers

# ============================================================================
# DEVELOPMENT
# ============================================================================
NODE_ENV="development"
LOG_LEVEL="debug"
```

### `.env.example` Template

Create this file for team members:

```bash
# Copy this to .env and fill in your values

DATABASE_URL="postgresql://margindesk:dev_password_123@localhost:5432/margindesk_dev?schema=public"

NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-random-secret-here"

AZURE_AD_CLIENT_ID=""
AZURE_AD_CLIENT_SECRET=""
AZURE_AD_TENANT_ID=""

ZOHO_CLIENT_ID=""
ZOHO_CLIENT_SECRET=""
ZOHO_REDIRECT_URI="http://localhost:3000/api/auth/zoho/callback"

AWS_REGION="ap-south-1"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
S3_BUCKET_NAME="margindesk-documents-dev"
```

---

## Step 4: Initialize Prisma & Database

```bash
# Generate Prisma Client
pnpm prisma generate

# Run database migrations (creates tables)
pnpm prisma migrate dev --name init

# Open Prisma Studio to view database (optional)
pnpm prisma studio
# Opens at http://localhost:5555
```

### Verify Database Schema

```bash
# Connect to PostgreSQL
psql margindesk_dev

# List all tables
\dt

# Should see: Client, Project, Person, PO, Allocation, etc.

# Exit
\q
```

---

## Step 5: Seed Initial Data (Optional but Recommended)

```bash
# Run seed script to create test data
pnpm prisma db seed

# This creates:
# - 1 admin user (you)
# - 2 test clients
# - 3 test projects
# - 5 test people (employees)
# - Sample allocations for current month
```

### Manual Seed (if script doesn't exist yet)

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      name: 'Admin User',
      role: 'owner'
    }
  });
  console.log('✅ Created admin user:', admin.email);

  // Create test clients
  const client1 = await prisma.client.create({
    data: {
      name: 'Acme Corporation',
      billing_currency: 'INR',
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      tags: ['enterprise', 'priority']
    }
  });

  const client2 = await prisma.client.create({
    data: {
      name: 'TechStart Inc',
      billing_currency: 'USD',
      tags: ['startup']
    }
  });
  console.log('✅ Created 2 test clients');

  // Create test projects
  const project1 = await prisma.project.create({
    data: {
      client_id: client1.id,
      name: 'ERP Implementation',
      pricing_model: 'TnM',
      start_date: new Date('2025-01-01'),
      status: 'active'
    }
  });

  const project2 = await prisma.project.create({
    data: {
      client_id: client1.id,
      name: 'Mobile App Development',
      pricing_model: 'Retainer',
      start_date: new Date('2025-03-01'),
      status: 'active'
    }
  });

  const project3 = await prisma.project.create({
    data: {
      client_id: client2.id,
      name: 'Website Redesign',
      pricing_model: 'Milestone',
      start_date: new Date('2025-06-01'),
      status: 'active'
    }
  });
  console.log('✅ Created 3 test projects');

  // Create test people (employees)
  const people = await prisma.$transaction([
    prisma.person.create({
      data: {
        email: 'john.doe@company.com',
        name: 'John Doe',
        role: 'Engineer',
        department: 'Engineering',
        billable: true,
        ctc_monthly: 150000,
        utilization_target: 0.85,
        start_date: new Date('2024-01-01')
      }
    }),
    prisma.person.create({
      data: {
        email: 'jane.smith@company.com',
        name: 'Jane Smith',
        role: 'Manager',
        department: 'Engineering',
        billable: true,
        ctc_monthly: 250000,
        utilization_target: 0.70,
        start_date: new Date('2023-06-01')
      }
    }),
    prisma.person.create({
      data: {
        email: 'bob.analyst@company.com',
        name: 'Bob Johnson',
        role: 'Analyst',
        department: 'Consulting',
        billable: true,
        ctc_monthly: 120000,
        utilization_target: 0.90,
        start_date: new Date('2024-03-01')
      }
    }),
    prisma.person.create({
      data: {
        email: 'alice.dev@company.com',
        name: 'Alice Chen',
        role: 'Engineer',
        department: 'Engineering',
        billable: true,
        ctc_monthly: 140000,
        utilization_target: 0.85,
        start_date: new Date('2024-05-01')
      }
    }),
    prisma.person.create({
      data: {
        email: 'hr.admin@company.com',
        name: 'HR Admin',
        role: 'HR Manager',
        department: 'Human Resources',
        billable: false,
        ctc_monthly: 100000,
        utilization_target: 0.00,
        start_date: new Date('2022-01-01')
      }
    })
  ]);
  console.log('✅ Created 5 test people');

  // Create billing plans
  await prisma.billingPlan.create({
    data: {
      project_id: project1.id,
      rule_json: {
        model: 'TnM',
        roles: {
          Analyst: { rate_per_hour: 1200 },
          Engineer: { rate_per_hour: 1800 },
          Manager: { rate_per_hour: 2500 }
        },
        currency: 'INR'
      }
    }
  });

  await prisma.billingPlan.create({
    data: {
      project_id: project2.id,
      rule_json: {
        model: 'Retainer',
        monthly_amount: 500000,
        currency: 'INR'
      }
    }
  });
  console.log('✅ Created billing plans');

  // Create current month allocations
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  await prisma.allocation.createMany({
    data: [
      {
        person_id: people[0].id, // John Doe
        project_id: project1.id,
        period_month: currentMonth,
        hours_billable: 136,
        hours_nonbillable: 0,
        pct_effort: 0.85
      },
      {
        person_id: people[1].id, // Jane Smith (Manager)
        project_id: project1.id,
        period_month: currentMonth,
        hours_billable: 80,
        hours_nonbillable: 32,
        pct_effort: 0.70
      },
      {
        person_id: people[2].id, // Bob Johnson
        project_id: project2.id,
        period_month: currentMonth,
        hours_billable: 144,
        hours_nonbillable: 0,
        pct_effort: 0.90
      },
      {
        person_id: people[3].id, // Alice Chen
        project_id: project3.id,
        period_month: currentMonth,
        hours_billable: 120,
        hours_nonbillable: 16,
        pct_effort: 0.85
      }
    ]
  });
  console.log('✅ Created allocations for current month');

  // Create POs
  await prisma.pO.create({
    data: {
      project_id: project1.id,
      po_number: 'PO-2025-001',
      currency: 'INR',
      amount_total: 5000000,
      valid_from: new Date('2025-01-01'),
      valid_to: new Date('2025-12-31'),
      status: 'active',
      amount_billed_to_date: 1200000,
      amount_remaining: 3800000
    }
  });

  await prisma.pO.create({
    data: {
      project_id: project2.id,
      po_number: 'PO-2025-002',
      currency: 'INR',
      amount_total: 6000000,
      valid_from: new Date('2025-03-01'),
      valid_to: new Date('2026-02-28'),
      status: 'active',
      amount_billed_to_date: 500000,
      amount_remaining: 5500000
    }
  });
  console.log('✅ Created POs');

  // Create overhead pool for current month
  await prisma.overheadPool.create({
    data: {
      period_month: currentMonth,
      hr: 150000,
      it: 200000,
      admin: 100000,
      rent: 300000,
      mgmt: 250000,
      misc: 50000,
      notes: 'Monthly overhead for ' + currentMonth.toISOString().slice(0, 7)
    }
  });

  // Create overhead policy
  await prisma.overheadPolicy.create({
    data: {
      period_month: currentMonth,
      method: 'per_head',
      params_json: {
        include_per_head_overhead_in_ehc: false
      },
      approved_by: admin.id,
      approved_at: new Date()
    }
  });
  console.log('✅ Created overhead pool and policy');

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Add to package.json

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "devDependencies": {
    "tsx": "^4.7.0"
  }
}
```

---

## Step 6: Start Development Server

```bash
# Start Next.js dev server
pnpm dev

# Server should start at http://localhost:3000
```

### Verify Setup

Open browser and navigate to:

1. **Main App**: http://localhost:3000
2. **API Health Check**: http://localhost:3000/api/health
3. **Prisma Studio**: http://localhost:5555 (run `pnpm prisma studio`)

---

## Step 7: Optional - Local S3 (MinIO)

For local document storage without AWS, use MinIO:

```bash
# Add to docker-compose.yml
cat >> docker-compose.yml << 'EOF'

  minio:
    image: minio/minio
    container_name: margindesk-minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  minio_data:
EOF

# Start MinIO
docker-compose up -d minio

# Access MinIO Console at http://localhost:9001
# Login: minioadmin / minioadmin123

# Create bucket "margindesk-documents-dev" via UI
```

Update `.env`:
```bash
S3_ENDPOINT="http://localhost:9000"
S3_FORCE_PATH_STYLE="true"
AWS_ACCESS_KEY_ID="minioadmin"
AWS_SECRET_ACCESS_KEY="minioadmin123"
S3_BUCKET_NAME="margindesk-documents-dev"
```

---

## Step 8: Development Workflow

### Daily Development

```bash
# 1. Start services
docker-compose up -d  # If using Docker Postgres/MinIO
brew services start postgresql@14  # If using local Postgres

# 2. Start Next.js
pnpm dev

# 3. Open in browser
open http://localhost:3000

# 4. View database (optional)
pnpm prisma studio
```

### Run Database Migrations

```bash
# After modifying prisma/schema.prisma

# Create migration
pnpm prisma migrate dev --name add_new_field

# Apply migration to database
pnpm prisma migrate deploy

# Regenerate Prisma Client
pnpm prisma generate
```

### Reset Database (Fresh Start)

```bash
# WARNING: This deletes all data!
pnpm prisma migrate reset

# This will:
# 1. Drop database
# 2. Create database
# 3. Run all migrations
# 4. Run seed script
```

### Run Type Checking

```bash
# Check TypeScript errors
pnpm tsc --noEmit

# Run linting
pnpm lint

# Format code
pnpm format
```

---

## Step 9: Test API Endpoints

### Health Check
```bash
curl http://localhost:3000/api/health
# Expected: {"status": "ok", "timestamp": "..."}
```

### Create a Client
```bash
curl -X POST http://localhost:3000/api/clients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Client",
    "billing_currency": "INR",
    "gstin": "29XXXXX1234F1Z5"
  }'
```

### Get All Projects
```bash
curl http://localhost:3000/api/projects
```

---

## Step 10: Trigger On-Demand Syncs (Manual)

### Microsoft User Sync
```bash
curl -X POST http://localhost:3000/api/sync/microsoft-users \
  -H "Content-Type: application/json"
```

### Zoho Books Sync
```bash
curl -X POST http://localhost:3000/api/sync/zoho \
  -H "Content-Type: application/json"
```

---

## Common Issues & Troubleshooting

### Issue: `pnpm install` fails

**Solution**:
```bash
# Clear pnpm cache
pnpm store prune

# Delete node_modules and lock file
rm -rf node_modules pnpm-lock.yaml

# Reinstall
pnpm install
```

### Issue: Database connection error

**Solution**:
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Restart PostgreSQL
brew services restart postgresql@14

# Verify connection manually
psql -d margindesk_dev -c "SELECT version();"
```

### Issue: Prisma Client not found

**Solution**:
```bash
# Regenerate Prisma Client
pnpm prisma generate

# If still failing, clear cache
rm -rf node_modules/.prisma
pnpm install
```

### Issue: Port 3000 already in use

**Solution**:
```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill -9 $(lsof -ti:3000)

# Or use different port
PORT=3001 pnpm dev
```

### Issue: Cannot connect to MinIO

**Solution**:
```bash
# Check if MinIO container is running
docker ps | grep minio

# Restart MinIO
docker-compose restart minio

# Check logs
docker logs margindesk-minio
```

---

## VS Code Recommended Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "[prisma]": {
    "editor.defaultFormatter": "Prisma.prisma"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

---

## Next Steps After Local Setup

1. ✅ **Verify all services running**: Dev server, Postgres, MinIO
2. ✅ **Login with Microsoft**: Test Azure AD authentication
3. ✅ **Create test project**: Via UI or API
4. ✅ **Add allocations**: Test allocation grid editor
5. ✅ **Trigger Zoho sync**: Test on-demand sync endpoint
6. ✅ **Upload document**: Test S3/MinIO document upload
7. ✅ **Run month-end close**: Test freeze/unfreeze workflow

---

## Useful Commands Reference

```bash
# Development
pnpm dev                    # Start dev server
pnpm build                  # Build for production
pnpm start                  # Start production server

# Database
pnpm prisma studio          # Open database GUI
pnpm prisma migrate dev     # Create & apply migration
pnpm prisma db seed         # Run seed script
pnpm prisma migrate reset   # Reset database (WARNING: deletes data)

# Code Quality
pnpm lint                   # Run ESLint
pnpm format                 # Format with Prettier
pnpm type-check             # TypeScript type checking

# Testing
pnpm test                   # Run unit tests
pnpm test:e2e               # Run E2E tests

# Docker
docker-compose up -d        # Start all services
docker-compose down         # Stop all services
docker-compose logs -f      # View logs
```

---

**End of Local Dev Setup**

You're now ready to start development! 🚀

Next, ask me to:
- Generate the initial project structure
- Create specific API endpoints
- Build frontend components
- Set up Microsoft Graph integration
- Configure Zoho Books sync
