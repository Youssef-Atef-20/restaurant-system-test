# Restaurant Admin Dashboard

## Project Overview

**Application:** Restaurant Management & Admin Dashboard  
**Language:** English (LTR)  
**Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4  
**Backend:** Supabase (PostgreSQL, Row Level Security, Edge Functions)  
**Authentication:** Username + Password via `admin-auth` Edge Function  

---

## 1. Features

The Restaurant Admin Dashboard is the control panel for restaurant owners and staff to manage operations:

- **Categories**: Create, edit, reorder, and toggle visibility of menu categories.
- **Products**: Manage items, descriptions, category links, and instant availability.
- **Variants & Pricing**: Manage portion sizes, combos, and European pricing in EUR (`€`).
- **Administrators**: Create and manage staff accounts with granular role-based access control (RBAC).
- **Audit Logs**: Tamper-evident audit trail showing who changed what, with before/after diffs.
- **First-Time Setup Wizard**: Automatic initialization flow on fresh installations with no predefined credentials.

---

## 2. Security Architecture

1. **No Hardcoded Credentials**: There are no default usernames or passwords. The first owner is created through the First-Time Setup Wizard (`/setup`).
2. **Zero Service Role Exposure**: The client application never contains or imports the `service_role` key. All privileged administrative operations (admin creation, password updates, setup initialization) run server-side inside the Supabase Edge Function `admin-auth`.
3. **Session Persistence**: Sessions use standard Supabase Auth tokens with secure client-side storage and automatic refreshing.
4. **Row Level Security (RLS)**: PostgreSQL enforces restaurant scoping and permissions on all tables.

---

## 3. Environment Variables

Create a `.env` file in this directory based on `.env.example`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# Optional: Specific restaurant UUID (if empty, auto-resolved from user profile)
VITE_RESTAURANT_ID=
```

---

## 4. Development & Build Commands

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Run TypeScript typecheck
npm run typecheck

# Build for production
npm run build

# Run linter
npm run lint

# Preview production build
npm run preview
```

---

## 5. License
Commercial source code package.
