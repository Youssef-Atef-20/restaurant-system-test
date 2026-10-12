import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UtensilsCrossed, Eye, EyeOff, CheckCircle2, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const setupSchema = z
  .object({
    restaurantName: z
      .string()
      .min(2, 'Restaurant name must be at least 2 characters long')
      .max(100, 'Restaurant name is too long'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters long')
      .max(30, 'Username cannot exceed 30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long'),
    confirmPassword: z
      .string()
      .min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type SetupFormData = z.infer<typeof setupSchema>;

export function SetupPage() {
  const navigate = useNavigate();
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      restaurantName: 'Demo Restaurant',
      username: '',
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    async function checkStatus() {
      try {
        const { data, error } = await supabase.functions.invoke('admin-auth', {
          body: { action: 'check_setup_status' },
        });

        if (error || !data) {
          // If edge function check fails or unavailable, assume manual setup is allowed or check via fallback
          setSetupRequired(true);
        } else {
          setSetupRequired(Boolean(data.is_setup_required));
          if (data.restaurant_name && data.restaurant_name !== 'Demo Restaurant') {
            setValue('restaurantName', data.restaurant_name);
          }
        }
      } catch {
        setSetupRequired(true);
      } finally {
        setCheckingStatus(false);
      }
    }

    checkStatus();
  }, [setValue]);

  async function onSubmit(data: SetupFormData) {
    setServerError('');
    setIsSubmitting(true);

    try {
      const { data: resData, error: invokeError } = await supabase.functions.invoke('admin-auth', {
        body: {
          action: 'setup_initial_owner',
          restaurant_name: data.restaurantName.trim(),
          username: data.username.trim(),
          password: data.password,
        },
      });

      if (invokeError || !resData?.success) {
        const message = resData?.error || 'Failed to complete setup. Please check your Supabase configuration.';
        setServerError(message);
        return;
      }

      setIsCompleted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during setup.';
      setServerError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <span className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (setupRequired === false && !isCompleted) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-8 shadow-[var(--shadow-lg)] text-center">
          <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--color-accent-bg)] text-[var(--color-accent)] flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Setup Already Completed</h2>
          <p className="text-sm text-[var(--color-text-2)] mb-6">
            The initial owner account has already been initialized for this database. Please sign in with your credentials.
          </p>
          <Button variant="primary" className="w-full" onClick={() => navigate('/login', { replace: true })}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-8 shadow-[var(--shadow-lg)] text-center">
          <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Setup Completed Successfully!</h2>
          <p className="text-sm text-[var(--color-text-2)] mb-6">
            Your restaurant and initial owner account have been created. You can now log into your dashboard.
          </p>
          <Button variant="primary" size="lg" className="w-full" onClick={() => navigate('/login', { replace: true })}>
            Proceed to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      {/* Background radial accent */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, var(--color-accent-bg) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="bg-[var(--color-border)]/30 rounded-[var(--radius-xl)] p-[1.5px] shadow-[var(--shadow-lg)]">
          <div className="bg-[var(--color-surface)] rounded-[calc(var(--radius-xl)-1.5px)] p-8">
            {/* Header */}
            <div className="flex flex-col items-center gap-3 mb-6 text-center">
              <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--color-accent)] flex items-center justify-center shadow-[var(--shadow-md)]">
                <UtensilsCrossed size={26} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[var(--color-text)]">First-Time Setup Wizard</h1>
                <p className="text-sm text-[var(--color-text-2)] mt-0.5">
                  Configure your restaurant and create the primary owner account
                </p>
              </div>
            </div>

            {/* Setup Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              <Input
                id="restaurantName"
                label="Restaurant Name"
                type="text"
                placeholder="e.g. Demo Restaurant"
                error={errors.restaurantName?.message}
                {...register('restaurantName')}
              />

              <Input
                id="username"
                label="Owner Username"
                type="text"
                autoComplete="username"
                placeholder="e.g. admin"
                error={errors.username?.message}
                {...register('username')}
              />

              <Input
                id="password"
                label="Owner Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                error={errors.password?.message}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="text-[var(--color-text-3)] hover:text-[var(--color-text)] transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
                {...register('password')}
              />

              <Input
                id="confirmPassword"
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                error={errors.confirmPassword?.message}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((s) => !s)}
                    className="text-[var(--color-text-3)] hover:text-[var(--color-text)] transition-colors"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
                {...register('confirmPassword')}
              />

              {serverError && (
                <div
                  role="alert"
                  className="px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm"
                >
                  {serverError}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isSubmitting}
                className="w-full mt-2"
              >
                Complete Setup & Create Owner
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-[var(--color-border)] text-center text-xs text-[var(--color-text-3)]">
              Already initialized?{' '}
              <Link to="/login" className="text-[var(--color-accent)] hover:underline font-medium">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
