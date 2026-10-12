import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { categoriesService } from '../services/categories';
import { useAuth } from '../contexts/AuthContext';
import type { Category } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, Thead, Th, Tbody, Tr, Td } from '../components/ui/Table';

// ─── Schema ───────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Category name is required'),
  sort_order: z.preprocess(
    (v) => (v === '' ? 0 : Number(v)),
    z.number().int().min(0, 'Must be a non-negative number')
  ),
  is_active: z.boolean(),
});

type FormData = {
  name: string;
  sort_order: number;
  is_active: boolean;
};

// ─── Category Form ─────────────────────────────────────────

function CategoryForm({
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
    defaultValues: { sort_order: 0, is_active: true, ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Input
        id="cat-name"
        label="Category Name"
        placeholder="e.g. Burgers, Pizza, Desserts..."
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        id="cat-order"
        label="Display Order"
        type="number"
        min={0}
        error={typeof errors.sort_order?.message === 'string' ? errors.sort_order.message : undefined}
        {...register('sort_order')}
      />
      <div className="flex items-center gap-3">
        <input
          id="cat-active"
          type="checkbox"
          className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
          {...register('is_active')}
        />
        <label htmlFor="cat-active" className="text-sm text-[var(--color-text)] cursor-pointer">
          Active
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

export function CategoriesPage() {
  const { can } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    const { data, error: err } = await categoriesService.list();
    if (err) setError('Failed to load categories. Please try again.');
    else setCategories((data as Category[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate(data: FormData) {
    setCreateLoading(true);
    const { error: err } = await categoriesService.create(data);
    setCreateLoading(false);
    if (err) { alert('Failed to create category.'); return; }
    setCreateOpen(false);
    refresh();
  }

  async function handleEdit(data: FormData) {
    if (!editTarget) return;
    setEditLoading(true);
    const { error: err } = await categoriesService.update(editTarget.id, data);
    setEditLoading(false);
    if (err) { alert('Failed to update category.'); return; }
    setEditTarget(null);
    refresh();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const { error: err } = await categoriesService.remove(deleteTarget.id);
    setDeleteLoading(false);
    if (err) { alert('Failed to delete category. It may have associated products.'); return; }
    setDeleteTarget(null);
    refresh();
  }

  const canCreate = can('create_categories');
  const canEdit = can('update_categories');
  const canDelete = can('delete_categories');

  return (
    <div className="max-w-4xl mx-auto space-y-5" data-aos="fade-up">
      <Card padding={false}>
        <div className="p-5">
          <CardHeader
            title="Categories"
            description="Manage your restaurant menu categories"
            action={
              canCreate ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus size={15} />
                  Add Category
                </Button>
              ) : undefined
            }
          />
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <span className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <p className="text-center py-8 text-sm text-[var(--color-danger)]">{error}</p>
        )}

        {!loading && !error && categories.length === 0 && (
          <p className="text-center py-12 text-sm text-[var(--color-text-3)]">
            No categories found yet. Add your first category.
          </p>
        )}

        {!loading && !error && categories.length > 0 && (
          <Table>
            <Thead>
              <tr>
                <Th>Category Name</Th>
                <Th>Order</Th>
                <Th>Status</Th>
                {(canEdit || canDelete) && <Th className="text-right">Actions</Th>}
              </tr>
            </Thead>
            <Tbody>
              {categories.map((cat) => (
                <Tr key={cat.id}>
                  <Td className="font-medium">{cat.name}</Td>
                  <Td>{cat.sort_order}</Td>
                  <Td>
                    <Badge variant={cat.is_active ? 'success' : 'default'}>
                      {cat.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  {(canEdit || canDelete) && (
                    <Td className="text-right">
                      <div className="flex gap-1 justify-end">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditTarget(cat)}
                            aria-label="Edit"
                          >
                            <Pencil size={14} />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(cat)}
                            aria-label="Delete"
                            className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
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

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add New Category">
        <CategoryForm
          onSubmit={handleCreate}
          loading={createLoading}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Category"
      >
        {editTarget && (
          <CategoryForm
            defaultValues={{
              name: editTarget.name,
              sort_order: editTarget.sort_order,
              is_active: editTarget.is_active,
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
        title="Delete Category"
        message={`Are you sure you want to delete category "${deleteTarget?.name}"? All associated products will be deleted.`}
        confirmLabel="Delete"
        loading={deleteLoading}
      />
    </div>
  );
}
