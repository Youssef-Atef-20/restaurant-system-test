import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { variantsService } from '../services/variants';
import { productsService } from '../services/products';
import { categoriesService } from '../services/categories';
import { useAuth } from '../contexts/AuthContext';
import { getRestaurantId } from '../lib/constants';
import type { Category, Product, ProductVariant } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

// ─── Schema ───────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Variant name is required'),
  price: z.preprocess(
    (v) => (v === '' ? 0 : Number(v)),
    z.number().min(0, 'Price must be 0 or greater')
  ),
  sort_order: z.preprocess(
    (v) => (v === '' ? 0 : Number(v)),
    z.number().int().min(0)
  ),
});

type FormData = {
  name: string;
  price: number;
  sort_order: number;
};

// ─── Variant Form ──────────────────────────────────────────

function VariantForm({
  defaultValues,
  onSubmit,
  loading,
  onCancel,
}: {
  defaultValues?: Partial<FormData>;
  onSubmit: (data: FormData) => Promise<void>;
  loading: boolean;
  onCancel: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors } } = useForm<FormData, any, FormData>({
    resolver: zodResolver(schema) as never,
    defaultValues: { sort_order: 0, ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Input
        id="var-name"
        label="Variant Name"
        placeholder="e.g. Regular, Large, Double..."
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        id="var-price"
        label="Price (€)"
        type="number"
        min={0}
        step="0.01"
        placeholder="0.00"
        error={typeof errors.price?.message === 'string' ? errors.price.message : undefined}
        {...register('price')}
      />
      <Input
        id="var-order"
        label="Display Order"
        type="number"
        min={0}
        {...register('sort_order')}
      />
      <div className="flex gap-2 justify-end mt-2">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" loading={loading}>
          Save
        </Button>
      </div>
    </form>
  );
}

// ─── Product Row (collapsible) ─────────────────────────────

function ProductVariantRow({
  product,
  variants,
  isOpen,
  onToggle,
  canCreate,
  canEdit,
  canDelete,
  onCreateVariant,
  onEditVariant,
  onDeleteVariant,
}: {
  product: Product;
  variants: ProductVariant[];
  isOpen: boolean;
  onToggle: () => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onCreateVariant: (product: Product) => void;
  onEditVariant: (variant: ProductVariant) => void;
  onDeleteVariant: (variant: ProductVariant) => void;
}) {
  return (
    <div className="transition-colors">
      {/* Product header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="
          w-full flex items-center justify-between px-5 py-3.5
          bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)]/50
          transition-colors duration-150 text-left cursor-pointer select-none
        "
      >
        <div className="flex items-center gap-3">
          <span className="text-[var(--color-text-3)] transition-transform">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{product.name}</span>
          <span className="text-xs text-[var(--color-text-3)] bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2.5 py-0.5 rounded-full font-medium">
            {variants.length} {variants.length === 1 ? 'variant' : 'variants'}
          </span>
          {!product.is_available && (
            <span className="text-[10px] text-[var(--color-text-3)] bg-[var(--color-surface-2)] px-2 py-0.5 rounded-full font-medium">
              Unavailable
            </span>
          )}
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateVariant(product);
            }}
            className="
              inline-flex items-center gap-1.5 text-xs font-medium
              text-[var(--color-accent)] hover:text-[var(--color-accent-h)]
              py-1 px-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-bg)]
              transition-colors cursor-pointer
            "
            title={`Add variant to ${product.name}`}
          >
            <Plus size={14} />
            <span>Add Variant</span>
          </button>
        )}
      </div>

      {/* Variants list */}
      {isOpen && (
        <div className="bg-[var(--color-surface-2)]/30 border-t border-[var(--color-border)]">
          {variants.length === 0 ? (
            <div className="py-6 px-4 text-center">
              <p className="text-xs text-[var(--color-text-3)]">
                No variants for this product yet.
              </p>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => onCreateVariant(product)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline font-medium cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add the first variant to {product.name}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]/60">
              {variants.map((variant) => (
                <div
                  key={variant.id}
                  className="flex items-center justify-between px-6 sm:px-8 py-2.5 hover:bg-[var(--color-surface-2)]/60 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-[var(--color-text)]">{variant.name}</span>
                    <span className="text-sm font-semibold text-[var(--color-accent)] font-mono">
                      €{Number(variant.price).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditVariant(variant)}
                        aria-label="Edit"
                      >
                        <Pencil size={13} />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteVariant(variant)}
                        aria-label="Delete"
                        className="text-[var(--color-danger)]"
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────

export function VariantsPage() {
  const { can } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, ProductVariant[]>>({});
  const [openProductIds, setOpenProductIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [createTarget, setCreateTarget] = useState<Product | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [editTarget, setEditTarget] = useState<ProductVariant | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProductVariant | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    setError('');
    const [prodRes, varRes, catRes] = await Promise.all([
      productsService.list(),
      variantsService.listAll(getRestaurantId()),
      categoriesService.list(),
    ]);

    if (prodRes.error || catRes.error) {
      setError('Failed to load pricing data. Please try again.');
    } else {
      const prods = (prodRes.data as Product[]) ?? [];
      const cats = (catRes.data as Category[]) ?? [];
      setProducts(prods);
      setCategories(cats);

      // Group variants by product_id
      const grouped: Record<string, ProductVariant[]> = {};
      prods.forEach((p) => { grouped[p.id] = []; });
      ((varRes.data as ProductVariant[]) ?? []).forEach((v) => {
        if (grouped[v.product_id]) grouped[v.product_id].push(v);
      });
      setVariantsByProduct(grouped);
    }
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  function toggleProduct(productId: string) {
    setOpenProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  async function handleCreate(data: FormData) {
    if (!createTarget) return;
    setCreateLoading(true);
    const { error: err } = await variantsService.create({ ...data, product_id: createTarget.id });
    setCreateLoading(false);
    if (err) {
      alert('Failed to create variant.');
      return;
    }
    const targetId = createTarget.id;
    setCreateTarget(null);
    setOpenProductIds((prev) => new Set(prev).add(targetId));
    refresh(true);
  }

  async function handleEdit(data: FormData) {
    if (!editTarget) return;
    setEditLoading(true);
    const { error: err } = await variantsService.update(editTarget.id, data);
    setEditLoading(false);
    if (err) {
      alert('Failed to update variant.');
      return;
    }
    setEditTarget(null);
    refresh(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const { error: err } = await variantsService.remove(deleteTarget.id);
    setDeleteLoading(false);
    if (err) {
      alert('Failed to delete variant.');
      return;
    }
    setDeleteTarget(null);
    refresh(true);
  }

  const canCreate = can('create_variants');
  const canEdit = can('update_variants');
  const canDelete = can('delete_variants');

  // Group products by category in category database order
  const productsByCategory = categories.map((cat) => ({
    category: cat,
    products: products.filter((p) => p.category_id === cat.id),
  }));

  const categoryIds = new Set(categories.map((c) => c.id));
  const uncategorizedProducts = products.filter((p) => !categoryIds.has(p.category_id));

  const totalVariants = Object.values(variantsByProduct).reduce((acc, v) => acc + v.length, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6" data-aos="fade-up">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[var(--color-text)]">Variants & Pricing</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)]">
              {products.length} {products.length === 1 ? 'product' : 'products'}
            </span>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-2)] border border-[var(--color-border)]">
              {totalVariants} {totalVariants === 1 ? 'variant' : 'variants'}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-2)] mt-0.5">
            Manage portion sizes, options, and pricing for each menu item
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <span className="w-7 h-7 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <Card>
          <p className="text-center py-8 text-sm text-[var(--color-danger)]">{error}</p>
        </Card>
      )}

      {!loading && !error && categories.length === 0 && (
        <Card>
          <div className="py-12 text-center">
            <FolderOpen size={36} className="mx-auto text-[var(--color-text-3)] mb-2" />
            <p className="text-base font-medium text-[var(--color-text)]">No categories found yet</p>
            <p className="text-sm text-[var(--color-text-3)] mt-1">
              Please create categories and products first before configuring variants and prices.
            </p>
          </div>
        </Card>
      )}

      {/* Grouped Category Sections */}
      {!loading && !error && categories.length > 0 && (
        <div className="space-y-6">
          {productsByCategory.map(({ category: cat, products: catProducts }) => (
            <Card key={cat.id} padding={false} className="overflow-hidden border border-[var(--color-border)]">
              {/* Category Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-[var(--color-surface-2)]/60 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                  <h2 className="text-base font-bold text-[var(--color-text)]">
                    {cat.name}
                  </h2>
                  <span className="text-xs text-[var(--color-text-3)] bg-[var(--color-surface)] border border-[var(--color-border)] px-2.5 py-0.5 rounded-full font-medium">
                    {catProducts.length} {catProducts.length === 1 ? 'product' : 'products'}
                  </span>
                  {!cat.is_active && (
                    <Badge variant="default">Inactive</Badge>
                  )}
                </div>
              </div>

              {/* Products in this category */}
              {catProducts.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <p className="text-sm text-[var(--color-text-3)]">
                    No products in this category yet.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {catProducts.map((product) => (
                    <ProductVariantRow
                      key={product.id}
                      product={product}
                      variants={variantsByProduct[product.id] ?? []}
                      isOpen={openProductIds.has(product.id)}
                      onToggle={() => toggleProduct(product.id)}
                      canCreate={canCreate}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onCreateVariant={setCreateTarget}
                      onEditVariant={setEditTarget}
                      onDeleteVariant={setDeleteTarget}
                    />
                  ))}
                </div>
              )}
            </Card>
          ))}

          {/* Fallback for products without a valid category */}
          {uncategorizedProducts.length > 0 && (
            <Card padding={false} className="overflow-hidden border border-[var(--color-border)]">
              <div className="flex items-center justify-between px-5 py-4 bg-[var(--color-surface-2)]/60 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-warning)] shrink-0" />
                  <h2 className="text-base font-bold text-[var(--color-text)]">
                    Uncategorized Items
                  </h2>
                  <span className="text-xs text-[var(--color-text-3)] bg-[var(--color-surface)] border border-[var(--color-border)] px-2.5 py-0.5 rounded-full font-medium">
                    {uncategorizedProducts.length} {uncategorizedProducts.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {uncategorizedProducts.map((product) => (
                  <ProductVariantRow
                    key={product.id}
                    product={product}
                    variants={variantsByProduct[product.id] ?? []}
                    isOpen={openProductIds.has(product.id)}
                    onToggle={() => toggleProduct(product.id)}
                    canCreate={canCreate}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onCreateVariant={setCreateTarget}
                    onEditVariant={setEditTarget}
                    onDeleteVariant={setDeleteTarget}
                  />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={!!createTarget}
        onClose={() => setCreateTarget(null)}
        title={`Add Variant — ${createTarget?.name}`}
      >
        <VariantForm
          onSubmit={handleCreate}
          loading={createLoading}
          onCancel={() => setCreateTarget(null)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Variant"
      >
        {editTarget && (
          <VariantForm
            defaultValues={{
              name: editTarget.name,
              price: editTarget.price,
              sort_order: editTarget.sort_order,
            }}
            onSubmit={handleEdit}
            loading={editLoading}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Variant"
        message={`Are you sure you want to delete variant "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        loading={deleteLoading}
      />
    </div>
  );
}
