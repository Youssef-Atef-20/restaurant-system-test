# Restaurant Admin Dashboard

## Project Overview & Guide

**Application:** Restaurant Management & Admin Dashboard  
**Language:** English (LTR)  
**Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4  
**Backend:** Supabase (PostgreSQL, Row Level Security, Edge Functions)  
**Authentication:** Username + Password via `admin-auth` Edge Function  

---

## 1. Overview

The Restaurant Admin Dashboard is the management portal for the restaurant management system. The owner and authorized staff use this panel to manage:

- **Categories**: Create, edit, order, and toggle menu categories.
- **Products**: Manage items, descriptions, availability, and category assignments.
- **Variants & Pricing**: Manage portion sizes, options, and pricing in EUR (€).
- **Administrators**: Create and manage staff accounts with granular role-based access control (RBAC).
- **Audit Logs**: Full, tamper-evident audit history of all changes made across the system.
- **First-Time Setup Wizard**: Automatic initialization flow on fresh installations with no predefined credentials.

---

## 2. Security Architecture

1. **No Hardcoded Credentials**: There are no default usernames or passwords. The first owner is created through the First-Time Setup Wizard (`/setup`).
2. **Zero Service Role Exposure**: The client application never contains or imports the `service_role` key. All privileged administrative operations (admin creation, password updates, setup initialization) run server-side inside the Supabase Edge Function `admin-auth`.
3. **Session Persistence**: Sessions use standard Supabase Auth tokens with secure client-side storage and automatic refreshing.
4. **Row Level Security (RLS)**: PostgreSQL enforces restaurant scoping and permissions on all tables.

---

## 3. Directory Structure

```text
admin-dashboard/
├── public/
├── src/
│   ├── components/
│   │   ├── auth/           # ProtectedRoute
│   │   ├── layout/         # Sidebar, Topbar
│   │   ├── permissions/    # PermissionsChecker
│   │   └── ui/             # Button, Input, Modal, Card, Table, Badge
│   ├── contexts/           # AuthContext, ThemeContext
│   ├── layouts/            # DashboardLayout
│   ├── lib/                # supabase client, constants
│   ├── pages/              # SetupPage, LoginPage, DashboardPage, CategoriesPage,
│   │                       # ProductsPage, VariantsPage, AdminsPage, AuditLogsPage
│   ├── services/           # categories, products, variants, admins API services
│   ├── types/              # TypeScript definitions
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 4. Setup & Environment Variables

Copy `.env.example` to `.env` in `admin-dashboard/`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# Optional: Specific restaurant UUID (if empty, resolves from active session)
VITE_RESTAURANT_ID=
```

---

## 5. Development & Build Commands

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Run TypeScript check
npm run typecheck # or npx tsc -b

# Build for production
npm run build

# Preview build
npm run preview
```

---

## 6. License
Commercial source code product.