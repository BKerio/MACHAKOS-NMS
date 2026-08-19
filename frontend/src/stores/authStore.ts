import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Role } from '@/types/api';

interface AuthStore {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  setRole: (role: Role) => void;
  setToken: (token: string) => void;
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,

      setAuth: (token, user) =>
        set({
          token,
          user: {
            ...user,
            roles: user.roles?.length ? user.roles : [user.role],
            activeRole: user.activeRole || user.role,
          },
        }),

      setRole: (role) =>
        set((state) => ({
          user: state.user
            ? {
                ...state.user,
                role,
                activeRole: role,
              }
            : null,
        })),

      setToken: (token) => set({ token }),

      updateUser: (patch) =>
        set((state) => (state.user ? { user: { ...state.user, ...patch } } : state)),

      logout: () => set({ token: null, user: null }),
    }),
    { name: 'nms-auth' }
  )
);
