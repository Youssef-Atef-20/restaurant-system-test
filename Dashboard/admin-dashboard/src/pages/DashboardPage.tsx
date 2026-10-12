import { useEffect, useState } from 'react';
import { Tags, ShoppingBag, CheckCircle2, XCircle, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getRestaurantId } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';

interface Stats {
  categories: number;
  products: number;
  productsAvailable: number;
  productsUnavailable: number;
  activeAdmins: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Tags;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <Card className="flex items-center gap-4">
      <div
        className="w-11 h-11 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0"
        style={{ background: `var(--color-${color}-bg)`, color: `var(--color-${color})` }}
      >
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--color-text)]">{value}</p>
        <p className="text-sm text-[var(--color-text-2)]">{label}</p>
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { authUser } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const restaurantId = authUser?.restaurantUser.restaurant_id || getRestaurantId();
      try {
        const [catRes, prodRes, adminsRes] = await Promise.all([
          supabase
            .from('categories')
            .select('id', { count: 'exact', head: true })
            .eq('restaurant_id', restaurantId),
          supabase
            .from('products')
            .select('id, is_available')
            .eq('restaurant_id', restaurantId),
          authUser?.role === 'owner'
            ? supabase
                .from('restaurant_users')
                .select('user_id', { count: 'exact', head: true })
                .eq('restaurant_id', restaurantId)
                .eq('role', 'admin')
                .eq('is_active', true)
            : Promise.resolve({ count: null, error: null }),
        ]);

        const products = prodRes.data ?? [];
        setStats({
          categories: catRes.count ?? 0,
          products: products.length,
          productsAvailable: products.filter((p) => p.is_available).length,
          productsUnavailable: products.filter((p) => !p.is_available).length,
          activeAdmins: adminsRes.count ?? 0,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authUser]);

  const isOwner = authUser?.role === 'owner';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <span className="w-7 h-7 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Welcome */}
      <div data-aos="fade-down">
        <h2 className="text-2xl font-bold text-[var(--color-text)]">
          Welcome, {authUser?.restaurantUser.username} 👋
        </h2>
        <p className="text-sm text-[var(--color-text-2)] mt-1">
          Here is an overview of your restaurant data and performance
        </p>
      </div>

      {/* Stats grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        data-aos="fade-up"
        data-aos-delay="50"
      >
        <StatCard
          icon={Tags}
          label="Categories"
          value={stats?.categories ?? 0}
          color="accent"
        />
        <StatCard
          icon={ShoppingBag}
          label="Total Products"
          value={stats?.products ?? 0}
          color="accent"
        />
        <StatCard
          icon={CheckCircle2}
          label="Available Items"
          value={stats?.productsAvailable ?? 0}
          color="success"
        />
        <StatCard
          icon={XCircle}
          label="Unavailable Items"
          value={stats?.productsUnavailable ?? 0}
          color="danger"
        />
      </div>

      {isOwner && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-aos="fade-up" data-aos-delay="100">
          <StatCard
            icon={Users}
            label="Active Administrators"
            value={stats?.activeAdmins ?? 0}
            color="accent"
          />
        </div>
      )}
    </div>
  );
}
