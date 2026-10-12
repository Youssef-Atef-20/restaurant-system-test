import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { setRestaurantId } from '../lib/constants';
import { ALL_PERMISSION_KEYS, type AuthUser, type PermissionKey, type RestaurantUser } from '../types';

// ============================================================
// Context Shape
// ============================================================

interface AuthContextValue {
  session: Session | null;
  authUser: AuthUser | null;
  loading: boolean;
  /** Returns true if the current user has the given permission (owner always true) */
  can: (permission: PermissionKey) => boolean;
  /** Perform atomic username/password login and load profile/permissions */
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  /** Reload the restaurant_users record and permissions */
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const authUserRef = useRef<AuthUser | null>(null);
  const inFlightUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  const loadUser = useCallback(async (sess: Session | null): Promise<AuthUser | null> => {
    if (!sess?.user) {
      setAuthUser(null);
      authUserRef.current = null;
      return null;
    }

    const userId = sess.user.id;
    inFlightUserIdRef.current = userId;

    try {
      // Fetch restaurant_users record — RLS ensures this is scoped to the authed user
      const { data: ruData, error: ruError } = await supabase
        .from('restaurant_users')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (ruError || !ruData) {
        console.error('Failed to load restaurant user record:', ruError?.message);
        await supabase.auth.signOut();
        setAuthUser(null);
        authUserRef.current = null;
        return null;
      }

      const ru = ruData as RestaurantUser;
      setRestaurantId(ru.restaurant_id);

      // Check is_active
      if (!ru.is_active) {
        console.warn('Account is inactive, signing out');
        await supabase.auth.signOut();
        setAuthUser(null);
        authUserRef.current = null;
        return null;
      }

      let permissions: Set<PermissionKey> = new Set();

      if (ru.role === 'admin') {
        // 1. Primary: Direct query on admin_permissions table
        const { data: permData, error: permError } = await supabase
          .from('admin_permissions')
          .select('permission')
          .eq('restaurant_id', ru.restaurant_id)
          .eq('user_id', userId);

        if (permError) {
          console.warn('Direct admin_permissions query error:', permError.message);
        }

        if (permData && permData.length > 0) {
          permissions = new Set(permData.map((p) => p.permission as PermissionKey));
        } else {
          // 2. Fallback: If table RLS restricts direct SELECT to owner,
          // use the database SECURITY DEFINER function has_permission
          try {
            const results = await Promise.all(
              ALL_PERMISSION_KEYS.map(async (key) => {
                const { data: hasPerm } = await supabase.rpc('has_permission', {
                  p_restaurant_id: ru.restaurant_id,
                  p_permission: key,
                });
                return hasPerm ? key : null;
              })
            );
            const resolved = results.filter((k): k is PermissionKey => k !== null);
            if (resolved.length > 0) {
              permissions = new Set(resolved);
            }
          } catch (rpcErr) {
            console.warn('has_permission RPC check failed:', rpcErr);
          }
        }
      }
      // Owner has all permissions — permissions set stays empty, can() handles this

      const loadedUser: AuthUser = { restaurantUser: ru, role: ru.role, permissions };
      setAuthUser(loadedUser);
      authUserRef.current = loadedUser;
      return loadedUser;
    } finally {
      if (inFlightUserIdRef.current === userId) {
        inFlightUserIdRef.current = null;
      }
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
      setLoading(true);
      try {
        const { data: resData, error: invokeError } = await supabase.functions.invoke('admin-auth', {
          body: {
            action: 'login',
            username: username.trim(),
            password,
          },
        });

        if (invokeError || !resData?.session) {
          const message = resData?.error || 'Invalid username or password.';
          setLoading(false);
          return { success: false, error: message };
        }

        const newSession = resData.session as Session;

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: newSession.access_token,
          refresh_token: newSession.refresh_token,
        });

        if (sessionError) {
          setLoading(false);
          return { success: false, error: 'Failed to establish session.' };
        }

        setSession(newSession);

        // Fully load the user profile and permissions before completing login
        const loadedUser = await loadUser(newSession);
        if (!loadedUser) {
          setLoading(false);
          return { success: false, error: 'Could not load account profile.' };
        }

        setLoading(false);
        return { success: true };
      } catch (err: unknown) {
        setLoading(false);
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
        return { success: false, error: msg };
      }
    },
    [loadUser]
  );

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      loadUser(sess).finally(() => setLoading(false));
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, sess) => {
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setAuthUser(null);
          authUserRef.current = null;
          setLoading(false);
          return;
        }

        setSession(sess);

        // If this user is already loaded, skip duplicate redundant loading
        if (sess?.user?.id && authUserRef.current?.restaurantUser?.user_id === sess.user.id) {
          setLoading(false);
          return;
        }

        // If an in-flight load is already processing this user, skip duplicate trigger
        if (sess?.user?.id && inFlightUserIdRef.current === sess.user.id) {
          return;
        }

        if (sess?.user) {
          setLoading(true);
          await loadUser(sess);
          setLoading(false);
        } else {
          setAuthUser(null);
          authUserRef.current = null;
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadUser]);

  const can = useCallback(
    (permission: PermissionKey): boolean => {
      if (!authUser) return false;
      if (authUser.role === 'owner') return true;
      return authUser.permissions.has(permission);
    },
    [authUser]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setRestaurantId('');
    setAuthUser(null);
    authUserRef.current = null;
    setSession(null);
  }, []);

  const reload = useCallback(async () => {
    const { data: { session: sess } } = await supabase.auth.getSession();
    setSession(sess);
    setLoading(true);
    await loadUser(sess);
    setLoading(false);
  }, [loadUser]);

  return (
    <AuthContext.Provider value={{ session, authUser, loading, can, login, signOut, reload }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// Hook
// ============================================================

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
