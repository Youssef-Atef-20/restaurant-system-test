# 🍽️ Restaurant Management System & Customer Digital Menu

A production-ready, international commercial **Restaurant Management System** and **Customer Digital Menu** built with **React 19**, **TypeScript**, **Tailwind CSS v4**, and **Supabase**.

This complete source code product includes:
1. **Admin Dashboard (`Dashboard/admin-dashboard`)**: A private management portal for restaurant owners and staff (Categories, Products, Variants & Prices, Admins & RBAC Permissions, Realtime Audit Logs).
2. **Customer Digital Menu (`Menu/restaurant-digital-menu`)**: A fast, mobile-first, customer-facing digital menu with QR code scan support, real-time availability, light/dark themes, European EUR (`€`) pricing, and responsive LTR layout.
3. **Supabase Backend (`supabase/`)**: Complete PostgreSQL schema, seed data, row-level security (RLS), and Edge Functions for secure username-based authentication and abuse-protected first-time setup.

---

## 🌟 Key Features

### 👑 Admin Dashboard
- **First-Time Setup Wizard**: Automatically initializes a brand new database with no predefined default credentials.
- **Dashboard Overview**: Key metrics (total categories, active products, availability, active staff).
- **Category Management**: Full CRUD, custom display order, active/inactive toggling.
- **Product Management**: Category-linked products, descriptions, instant availability toggle.
- **Variants & Pricing**: Multiple sizes/portions per item (e.g. Regular, Large, Combo) with European EUR (`€`) pricing.
- **RBAC & Staff Permissions**: Granular permissions (view/create/update/delete for categories, products, variants, plus admin management and audit log access).
- **Audit Logging System**: Automatic database trigger logging with before/after diffs for all data operations.
- **English-First & International**: Clean typography using modern Google Inter font.
- **Light & Dark Mode**: Seamless theme switching with persistent user preference.

### 📱 Customer Digital Menu
- **Mobile-First Experience**: Optimized for smartphones after scanning a table QR code.
- **Auto-Sync with Database**: Instantly reflects product availability and prices.
- **Smart Category Navigation**: Sticky category bar with smooth scroll-spy navigation.
- **Theme Support**: Dedicated dark and light themes.
- **Zero Login Friction**: Read-only public access protected by Supabase Row-Level Security.

---

## 🛠️ Technology Stack

| Component | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 19, TypeScript, Vite 6 |
| **Styling** | Tailwind CSS v4, Vanilla CSS Custom Properties |
| **Backend / Database** | Supabase (PostgreSQL 15+), Row Level Security (RLS) |
| **Serverless Logic** | Supabase Edge Functions (Deno / TypeScript) |
| **Icons & Animations** | Lucide React, AOS (Animate on Scroll) |
| **Form & Validation** | React Hook Form, Zod |

---

## 📁 Project Structure

```text
Restaurant-Management-System/
├── Dashboard/
│   └── admin-dashboard/          # Admin Dashboard (Vite React + TypeScript)
│       ├── src/
│       │   ├── components/       # UI, layout, auth & permission components
│       │   ├── contexts/         # AuthContext & ThemeContext
│       │   ├── pages/            # SetupPage, LoginPage, Dashboard, Categories, Products, Admins, Audit Logs
│       │   ├── services/         # Supabase data services
│       │   └── types/            # TypeScript type definitions
│       ├── .env.example          # Environment variables template
│       └── package.json
│
├── Menu/
│   └── restaurant-digital-menu/  # Customer Digital Menu (Vite React + TypeScript)
│       ├── src/
│       │   ├── components/       # MenuHeader, CategoryNav, ProductCard, VariantList, etc.
│       │   ├── hooks/            # useMenu (dynamic data fetching), useTheme
│       │   └── pages/            # MenuPage
│       ├── .env.example          # Environment variables template
│       └── package.json
│
├── supabase/                     # Supabase Backend Configuration
│   ├── schema.sql                # Complete 1-click database schema & RLS policies
│   ├── seed.sql                  # Generic demo seed data (Burgers, Pizza, Drinks, Desserts)
│   ├── migrations/               # Versioned migration files
│   ├── functions/                # Edge Functions
│   │   └── admin-auth/           # Privileged auth, first-time setup & admin management
│   └── config.toml               # Local Supabase configuration
│
└── README.md                     # Main documentation
```

---

## 🚀 Installation & Setup Guide

### Step 1: Create a Supabase Project

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard) and create a new project.
2. Under **Project Settings -> API**, copy:
   - **Project URL**
   - **anon / public key**
   - **service_role key** (keep secret; needed for Edge Functions)

---

### Step 2: Initialize Database Schema & Seed Data

Open your Supabase Dashboard and navigate to the **SQL Editor**:

1. **Run `schema.sql`**:
   - Open `supabase/schema.sql` from this repository.
   - Paste the complete script into the Supabase SQL Editor and click **Run**.
   - This creates all required tables (`restaurants`, `categories`, `products`, `product_variants`, `restaurant_users`, `admin_permissions`, `audit_logs`), helper functions, triggers, and Row Level Security (RLS) policies.

2. **Run `seed.sql` (Optional Demo Data)**:
   - Open `supabase/seed.sql`.
   - Paste into the SQL Editor and click **Run**.
   - This populates a demo restaurant ("Demo Restaurant") with categories (Burgers, Pizza, Drinks, Desserts), products, and variants with EUR (`€`) pricing.

> [!IMPORTANT]
> **No Predefined Administrator Credentials Exist!**
> You do **not** need to manually insert a user or password into the database. The initial Owner account is created safely using the **First-Time Setup Wizard** in Step 5.

---

### Step 3: Deploy the Supabase Edge Function

The `admin-auth` Edge Function securely handles username-based authentication, first-time setup, and staff account creation without exposing privileged credentials to the browser.

Using the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
# Link to your Supabase project (replace with your project reference ID)
npx supabase link --project-ref your-project-ref

# Deploy the admin-auth Edge Function
npx supabase functions deploy admin-auth --no-verify-jwt
```

Ensure the following default secrets are active in your Supabase project (set automatically in Supabase Cloud):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

### Step 4: Configure Environment Variables

#### 1. Admin Dashboard (`Dashboard/admin-dashboard/.env`)
Create a `.env` file inside `Dashboard/admin-dashboard/`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# Optional: Specific restaurant ID. If omitted, the dashboard automatically resolves the user's restaurant membership.
VITE_RESTAURANT_ID=
```

#### 2. Digital Menu (`Menu/restaurant-digital-menu/.env`)
Create a `.env` file inside `Menu/restaurant-digital-menu/`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# Optional: Specific restaurant ID. If omitted, the menu automatically displays the active restaurant.
VITE_RESTAURANT_ID=
```

---

### Step 5: Start the Dashboard & Run the First-Time Setup Wizard

1. Start the Admin Dashboard:
   ```bash
   cd Dashboard/admin-dashboard
   npm install
   npm run dev
   ```

2. Open the Dashboard in your browser (`http://localhost:5173`).
3. Because the database is brand new and has no registered owner, the application automatically detects this and redirects to the **First-Time Setup Wizard** (`/setup`).
4. Enter:
   - **Restaurant Name** (e.g. *Demo Restaurant* or your restaurant's name)
   - **Owner Username** (e.g. *admin*)
   - **Owner Password** (minimum 8 characters)
   - **Confirm Password**
5. Click **Complete Setup & Create Owner**.
6. The backend server verifies that no owner exists, creates the Supabase Auth credentials securely, links the profile in `restaurant_users`, assigns the `owner` role, and locks the setup endpoint against future abuse.
7. Redirect to `/login` and sign in using your newly created credentials.

---

### Step 6: Start the Customer Digital Menu

In a second terminal window:

```bash
cd Menu/restaurant-digital-menu
npm install
npm run dev
```

Open `http://localhost:5174` (or port specified in terminal) to preview the customer-facing menu.

---

## 🔒 Security & Architecture Details

1. **Client-Side Safety**:
   - The React frontend bundle contains **ONLY** the public publishable anon key (`VITE_SUPABASE_PUBLISHABLE_KEY`).
   - The `service_role` key is **NEVER** imported or referenced in frontend code.
2. **Server-Side Authorization**:
   - Privileged operations (initial setup, staff admin creation, password reset) run in the serverless `admin-auth` Edge Function.
   - The setup action checks whether an owner already exists before executing, preventing duplicate setup abuse.
3. **Database Row Level Security (RLS)**:
   - Public users can only read active categories, products, and variants for active restaurants.
   - Administrative mutations require an authenticated session and verified membership in `restaurant_users`.
   - Admin operations are checked against assigned `admin_permissions` via PostgreSQL `has_permission()` database functions.

---

## 🚢 Production Deployment

### Deploying Frontend Apps (Vercel, Netlify, Cloudflare Pages)

Both `Dashboard/admin-dashboard` and `Menu/restaurant-digital-menu` are standard static Single Page Applications (SPAs).

#### Dashboard
- **Root Directory**: `Dashboard/admin-dashboard`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_SUPABASE_URL`: Your Supabase Project URL
  - `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase Anon Key

#### Digital Menu
- **Root Directory**: `Menu/restaurant-digital-menu`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_SUPABASE_URL`: Your Supabase Project URL
  - `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase Anon Key

---

## 🛠️ Verification & Build Commands

To verify TypeScript and production builds locally:

```bash
# Dashboard
cd Dashboard/admin-dashboard
npm run build

# Menu
cd Menu/restaurant-digital-menu
npm run build
```

---

## 📄 License & Commercial Terms
This product is sold as a commercial source code package. Buyers receive full source code access to customize, rebrand, and deploy for their clients or commercial operations.
#   r e s t a u r a n t - s y s t e m - t e s t  
 