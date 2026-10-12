# 🍽️ Customer Digital Menu

A modern, responsive, customer-facing digital menu application built with **React**, **TypeScript**, **Tailwind CSS v4**, and **Supabase**.

Customers scan the restaurant's QR code and browse the available menu, organized by categories, with products, descriptions, variants, and prices loaded directly from Supabase in real time.

---

## ✨ Features

- 📱 Responsive mobile-first design (optimized for smartphone screens)
- 🌐 International English-first UI with modern typography
- 🗂️ Menu organized by categories with sticky category navigation
- 🍔 Products with descriptions and availability states
- 💰 Product variants and multi-portion pricing in EUR (€)
- ⚡ Live data loaded dynamically from Supabase
- 🎨 Design tokens matching the Admin Dashboard
- 🌙 Light/Dark theme support
- ✨ Smooth animations using AOS (Animate on Scroll)
- 🔄 Loading, error, and empty states
- 🚫 Automatically filters out unavailable categories, products, and variants

---

## 🛠️ Tech Stack

- React 19
- TypeScript
- Tailwind CSS v4
- Supabase Client
- AOS
- Lucide React
- Vite 6

---

## 📁 Project Structure

```text
restaurant-digital-menu/
├── public/
├── src/
│   ├── components/
│   │   ├── menu/         # CategoryNav, CategorySection, MenuHeader, ProductCard, VariantList
│   │   └── ui/           # EmptyState, ErrorState, LoadingState, Price
│   ├── hooks/            # useMenu (dynamic data fetching), useTheme
│   ├── lib/              # supabase client
│   ├── pages/            # MenuPage
│   ├── types/            # TypeScript interfaces
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🔐 Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# Optional: Specific restaurant UUID (if empty, auto-resolves active restaurant)
VITE_RESTAURANT_ID=
```

### ⚠️ Security
The digital menu application is public and read-only. Never expose any of the following to the frontend:
- Supabase Service Role Key
- Database passwords
- Admin credentials

The customer-facing website uses only the public Supabase Publishable / Anon Key with strict RLS policies.

---

## 🚀 Installation & Local Development

Install dependencies:
```bash
npm install
```

Start the development server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

---

## 📄 License
Commercial source code product.
