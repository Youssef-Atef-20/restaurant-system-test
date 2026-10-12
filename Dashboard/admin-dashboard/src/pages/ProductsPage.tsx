import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, FolderOpen } from 'lucide-react';
import { productsService } from '../services/products';
import { categoriesService } from '../services/categories';
import { useAuth } from '../contexts/AuthContext';
import type { Category, Product } from '../types';
import { Button } from '../components/ui/Button';
import { Input, Textarea, Select } from '../components/ui/Input';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, Thead, Th, Tbody, Tr, Td } from '../components/ui/Table';

// ─── Schema ───────────────────────────────────────────────

const schema = z.object({
  category_id: z.string().min(1, 'Category is required'),
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  sort_order: z.preprocess(
    (v) => (v === '' ? 0 : Number(v)),
    z.number().int().min(0)
  ),
  is_available: z.boolean(),
});

type FormData = {
  category_id: string;
  name: string;
  description?: string;
  sort_order: number;
  is_available: boolean;
};

// ─── Product Form ──────────────────────────────────────────

function ProductForm({
  categories,
  defaultValues,
  onSubmit,
  loading,
  onCancel,
}: {
  categories: Category[];
  defaultValues?: Partial<FormData>;
  onSubmit: (data: FormData) => Promise<void>;
  loading: boolean;
  onCancel: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors } } = useForm<FormData, any, FormData>({
    resolver: zodResolver(schema) as never,
    defaultValues: { sort_order: 0, is_available: true, ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Select
        id="prod-cat"
        label="Category"
        placeholder="Select category"
        error={errors.category_id?.message}
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        {...register('category_id')}
      />
      <Input
        id="prod-name"
        label="Product Name"
        placeholder="e.g. Classic Beef Burger"
        error={errors.name?.message}
        {...register('name')}
      />
      <Textarea
        id="prod-desc"
        label="Description (optional)"
        placeholder="Short description of the product"
        rows={3}
        {...register('description')}
      />
      <Input
        id="prod-order"
        label="Display Order"
        type="number"
        min={0}
        {...register('sort_order')}
      />
      <div className="flex items-center gap-3">
        <input
          id="prod-available"
          type="checkbox"
          className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
          {...register('is_available')}
        />
        <label htmlFor="prod-available" className="text-sm text-[var(--color-text)] cursor-pointer">
          Available for ordering
        </label>
      </div>
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

// ─── Main Page ─────────────────────────────────────────────

export function ProductsPage() {
  const { can } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createCategoryDefault, setCreateCategoryDefault] = useState<string>('');
  const [createLoading, setCreateLoading] = useState(false);

  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError('');
    const [prodRes, catRes] = await Promise.all([
      productsService.list(),
      categoriesService.list(),
    ]);
    if (prodRes.error) setError('Failed to load products. Please try again.');
    else setProducts((prodRes.data as Product[]) ?? []);
    setCategories((catRes.data as Category[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  function handleOpenCreate(categoryId?: string) {
    setCreateCategoryDefault(categoryId || (categories[0]?.id ?? ''));
    setCreateOpen(true);
  }

  async function handleCreate(data: FormData) {
    setCreateLoading(true);
    const { data: created, error: err } = await productsService.create({
      ...data,
      description: data.description || null,
    });
    setCreateLoading(false);
    if (err) { alert('Failed to create product.'); return; }
    setCreateOpen(false);
    if (created) {
      setProducts((prev) => {
        const next = [...prev, created as Product];
        return next.sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.created_at.localeCompare(b.created_at);
        });
      });
    } else {
      refresh();
    }
  }

  async function handleEdit(data: FormData) {
    if (!editTarget) return;
    setEditLoading(true);
    const { data: updated, error: err } = await productsService.update(editTarget.id, {
      ...data,
      description: data.description || null,
    });
    setEditLoading(false);
    if (err) { alert('Failed to update product.'); return; }
    setEditTarget(null);
    if (updated) {
      setProducts((prev) =>
        prev.map((p) => (p.id === editTarget.id ? (updated as Product) : p))
      );
    } else {
      refresh();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const { error: err } = await productsService.remove(deleteTarget.id);
    setDeleteLoading(false);
    if (err) { alert('Failed to delete product.'); return; }
    const removedId = deleteTarget.id;
    setDeleteTarget(null);
    setProducts((prev) => prev.filter((p) => p.id !== removedId));
  }

  async function handleToggleAvailability(product: Product) {
    const nextAvailable = !product.is_available;
    setTogglingId(product.id);
    // Optimistic in-place update keeps position stable and gives instant feedback
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, is_available: nextAvailable } : p))
    );
    const { error: err } = await productsService.update(product.id, { is_available: nextAvailable });
    setTogglingId(null);
    if (err) {
      // Revert on error
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_available: product.is_available } : p))
      );
      alert('Failed to update availability status.');
    }
  }

  const canCreate = can('create_products');
  const canEdit = can('update_products');
  const canDelete = can('delete_products');

  // Group products by category in category database order
  const productsByCategory = categories.map((cat) => ({
    category: cat,
    products: products.filter((p) => p.category_id === cat.id),
  }));

  const categoryIds = new Set(categories.map((c) => c.id));
  const uncategorizedProducts = products.filter((p) => !categoryIds.has(p.category_id));

  return (
    <div className="max-w-5xl mx-auto space-y-6" data-aos="fade-up">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[var(--color-text)]">Products</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)]">
              {products.length} {products.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-2)] mt-0.5">
            Manage your restaurant menu items organized by category
          </p>
        </div>

        {canCreate && (
          <Button size="sm" onClick={() => handleOpenCreate()}>
            <Plus size={15} />
            Add Product
          </Button>
        )}
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
              Please create at least one category in the Categories page before adding products.
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
                    {catProducts.length} {catProducts.length === 1 ? 'item' : 'items'}
                  </span>
                  {!cat.is_active && (
                    <Badge variant="default">Inactive</Badge>
                  )}
                </div>

                {canCreate && (
                  <button
                    type="button"
                    onClick={() => handleOpenCreate(cat.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-h)] transition-colors py-1 px-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-bg)] cursor-pointer"
                    title={`Add product to ${cat.name}`}
                  >
                    <Plus size={14} />
                    <span>Add product to this category</span>
                  </button>
                )}
              </div>

              {/* Products in this category */}
              {catProducts.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <p className="text-sm text-[var(--color-text-3)]">
                    No products in this category yet.
                  </p>
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => handleOpenCreate(cat.id)}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline font-medium cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Add the first item to {cat.name}</span>
                    </button>
                  )}
                </div>
              ) : (
                <Table>
                  <Thead>
                    <tr>
                      <Th>Product</Th>
                      <Th className="w-24 text-center">Order</Th>
                      <Th className="w-36">Availability</Th>
                      {(canEdit || canDelete) && <Th className="text-right w-28">Actions</Th>}
                    </tr>
                  </Thead>
                  <Tbody>
                    {catProducts.map((product) => (
                      <Tr key={product.id}>
                        <Td>
                          <div>
                            <p className="font-medium text-[var(--color-text)]">{product.name}</p>
                            {product.description && (
                              <p className="text-xs text-[var(--color-text-3)] mt-0.5 line-clamp-1">
                                {product.description}
                              </p>
                            )}
                          </div>
                        </Td>
                        <Td className="w-24 text-center font-mono text-xs text-[var(--color-text-2)]">
                          {product.sort_order}
                        </Td>
                        <Td className="w-36">
                          {canEdit ? (
                            <button
                              onClick={() => handleToggleAvailability(product)}
                              disabled={togglingId === product.id}
                              className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-50 cursor-pointer"
                            >
                              {product.is_available ? (
                                <ToggleRight size={20} className="text-[var(--color-success)]" />
                              ) : (
                                <ToggleLeft size={20} className="text-[var(--color-text-3)]" />
                              )}
                              <span
                                className={
                                  product.is_available
                                    ? 'text-[var(--color-success)] font-medium text-xs'
                                    : 'text-[var(--color-text-3)] font-medium text-xs'
                                }
                              >
                                {product.is_available ? 'Available' : 'Unavailable'}
                              </span>
                            </button>
                          ) : (
                            <Badge variant={product.is_available ? 'success' : 'default'}>
                              {product.is_available ? 'Available' : 'Unavailable'}
                            </Badge>
                          )}
                        </Td>
                        {(canEdit || canDelete) && (
                          <Td className="w-28 text-right">
                            <div className="flex gap-1 justify-end">
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditTarget(product)}
                                  aria-label="Edit"
                                >
                                  <Pencil size={14} />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteTarget(product)}
                                  aria-label="Delete"
                                  className="text-[var(--color-danger)]"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              )}
                            </div>
                          </Td>
                        )}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
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
                    {uncategorizedProducts.length} items
                  </span>
                </div>
              </div>
              <Table>
                <Thead>
                  <tr>
                    <Th>Product</Th>
                    <Th className="w-24 text-center">Order</Th>
                    <Th className="w-36">Availability</Th>
                    {(canEdit || canDelete) && <Th className="text-right w-28">Actions</Th>}
                  </tr>
                </Thead>
                <Tbody>
                  {uncategorizedProducts.map((product) => (
                    <Tr key={product.id}>
                      <Td>
                        <div>
                          <p className="font-medium text-[var(--color-text)]">{product.name}</p>
                          {product.description && (
                            <p className="text-xs text-[var(--color-text-3)] mt-0.5 line-clamp-1">
                              {product.description}
                            </p>
                          )}
                        </div>
                      </Td>
                      <Td className="w-24 text-center font-mono text-xs text-[var(--color-text-2)]">
                        {product.sort_order}
                      </Td>
                      <Td className="w-36">
                        {canEdit ? (
                          <button
                            onClick={() => handleToggleAvailability(product)}
                            disabled={togglingId === product.id}
                            className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-50 cursor-pointer"
                          >
                            {product.is_available ? (
                              <ToggleRight size={20} className="text-[var(--color-success)]" />
                            ) : (
                              <ToggleLeft size={20} className="text-[var(--color-text-3)]" />
                            )}
                            <span
                              className={
                                product.is_available
                                  ? 'text-[var(--color-success)] font-medium text-xs'
                                  : 'text-[var(--color-text-3)] font-medium text-xs'
                              }
                            >
                              {product.is_available ? 'Available' : 'Unavailable'}
                            </span>
                          </button>
                        ) : (
                          <Badge variant={product.is_available ? 'success' : 'default'}>
                            {product.is_available ? 'Available' : 'Unavailable'}
                          </Badge>
                        )}
                      </Td>
                      {(canEdit || canDelete) && (
                        <Td className="w-28 text-right">
                          <div className="flex gap-1 justify-end">
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditTarget(product)}
                                aria-label="Edit"
                              >
                                <Pencil size={14} />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget(product)}
                                aria-label="Delete"
                                className="text-[var(--color-danger)]"
                              >
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </div>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Product" maxWidth="max-w-lg">
        <ProductForm
          key={createOpen ? createCategoryDefault || 'default' : 'closed'}
          categories={categories}
          defaultValues={{ category_id: createCategoryDefault }}
          onSubmit={handleCreate}
          loading={createLoading}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Product" maxWidth="max-w-lg">
        {editTarget && (
          <ProductForm
            key={editTarget.id}
            categories={categories}
            defaultValues={{
              category_id: editTarget.category_id,
              name: editTarget.name,
              description: editTarget.description ?? '',
              sort_order: editTarget.sort_order,
              is_available: editTarget.is_available,
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
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? All associated variants and prices will be removed.`}
        confirmLabel="Delete"
        loading={deleteLoading}
      />
    </div>
  );
}
