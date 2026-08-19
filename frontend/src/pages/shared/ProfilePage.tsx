import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User as UserIcon,
  Phone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LoaderCircle,
  KeyRound,
  Check,
  Building2 as Buildings,
} from 'lucide-react';
import { getMyProfile, updateMyProfile, getErrorMessage } from '@/api/responder';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match",
    path: ['confirmPassword'],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

const fieldCls =
  'w-full border rounded-lg pl-10 pr-3 py-2.5 text-sm font-semibold outline-none transition-colors';
const fieldStyle = {
  background: 'var(--surface)',
  borderColor: 'var(--border)',
  color: 'var(--ink)',
};
const labelCls = 'block text-[10px] font-black tracking-widest mb-1.5';

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Self-service account page. Every signed-in role lands here via the "My Profile" nav link. */
function ProfilePage() {
  const authUser = useAuthStore((s) => s.user);
  const updateAuthUser = useAuthStore((s) => s.updateUser);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['account', 'my-profile'],
    queryFn: getMyProfile,
    initialData: authUser ?? undefined,
  });

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    watch: watchProfile,
    formState: { errors: profileErrors, isDirty: profileDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: profile ? { name: profile.name, phone: profile.phone ?? '' } : undefined,
  });

  const watchedName = watchProfile('name');

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const profileMutation = useMutation({
    mutationFn: (data: ProfileForm) => updateMyProfile({ name: data.name, phone: data.phone || undefined }),
    onSuccess: (user) => {
      updateAuthUser(user);
      queryClient.setQueryData(['account', 'my-profile'], user);
      addNotification({ type: 'success', title: 'Profile updated', message: 'Your details have been saved.' });
    },
    onError: (err) => addNotification({ type: 'error', title: 'Update failed', message: getErrorMessage(err) }),
  });

  const passwordMutation = useMutation({
    mutationFn: (data: PasswordForm) =>
      updateMyProfile({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
    onSuccess: () => {
      resetPassword();
      setShowPasswordForm(false);
      addNotification({ type: 'success', title: 'Password changed', message: 'Use your new password next time you sign in.' });
    },
    onError: (err) => addNotification({ type: 'error', title: 'Password change failed', message: getErrorMessage(err) }),
  });

  const displayName = (watchedName?.trim() || profile?.name || '').trim();
  const initials = displayName
    ? displayName.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div className="col" style={{ gap: 20, maxWidth: 560 }}>
      {/* Header */}
      <div
        className="rounded-xl border shadow-sm overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="h-1 w-full bg-brand-green" />
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-5 bg-brand-green rounded-full" />
            <p className="font-sans text-[11px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
              Account
            </p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
            My Profile
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Update your contact details and password
          </p>
        </div>
      </div>

      {/* Identity + details */}
      <div
        className="rounded-xl border shadow-sm overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div
          className="px-5 py-4 flex items-center gap-4"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black"
            style={{ background: 'var(--ink)', color: 'var(--surface)' }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-base truncate" style={{ color: 'var(--ink)' }}>
              {displayName || 'Your name'}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {profile?.role && (
                <span
                  className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                >
                  {roleLabel(profile.role)}
                </span>
              )}
              {profile?.agency?.name && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium truncate" style={{ color: 'var(--muted)' }}>
                  <Buildings size={12} />
                  {profile.agency.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="skel" style={{ height: 160 }} />
          ) : (
            <form
              className="flex flex-col gap-3.5"
              onSubmit={handleProfileSubmit((data) => profileMutation.mutate(data))}
            >
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }} htmlFor="profile-name">
                  Full name
                </label>
                <div className="relative">
                  <UserIcon
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--muted)' }}
                  />
                  <input
                    {...registerProfile('name')}
                    id="profile-name"
                    className={fieldCls}
                    style={{
                      ...fieldStyle,
                      ...(profileErrors.name ? { borderColor: 'var(--red)' } : {}),
                    }}
                    type="text"
                    placeholder="Your full name"
                  />
                </div>
                {profileErrors.name && (
                  <span className="text-xs mt-1 block" style={{ color: 'var(--red)' }}>
                    {profileErrors.name.message}
                  </span>
                )}
              </div>

              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }} htmlFor="profile-phone">
                  Phone number
                </label>
                <div className="relative">
                  <Phone
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--muted)' }}
                  />
                  <input
                    {...registerProfile('phone')}
                    id="profile-phone"
                    className={fieldCls}
                    style={fieldStyle}
                    type="tel"
                    placeholder="+254..."
                  />
                </div>
              </div>

              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }} htmlFor="profile-email">
                  Email address
                </label>
                <div className="relative">
                  <Mail
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--muted)' }}
                  />
                  <input
                    id="profile-email"
                    className={fieldCls}
                    style={{ ...fieldStyle, background: 'var(--surface-2)', color: 'var(--muted)' }}
                    type="email"
                    value={profile?.email ?? ''}
                    disabled
                  />
                </div>
                <p className="text-[10px] mt-1.5" style={{ color: 'var(--muted)' }}>
                  Contact an admin to change your email.
                </p>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full flex items-center justify-center gap-2 mt-1 py-2.5 text-sm disabled:opacity-40"
                style={{ background: 'var(--ink)', boxShadow: 'none' }}
                disabled={profileMutation.isPending || !profileDirty}
              >
                {profileMutation.isPending ? (
                  <>
                    <LoaderCircle size={15} className="spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={15} strokeWidth={3} />
                    Save changes
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Password */}
      <div
        className="rounded-xl border shadow-sm overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}
            >
              <KeyRound size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                Password
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                Change your sign-in password
              </p>
            </div>
          </div>
          {!showPasswordForm && (
            <button
              type="button"
              className="px-3 py-2 text-xs font-black tracking-wide rounded-lg border transition-colors flex-shrink-0"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface-2)' }}
              onClick={() => setShowPasswordForm(true)}
            >
              Change
            </button>
          )}
        </div>

        {showPasswordForm && (
          <form
            className="px-5 pb-5 flex flex-col gap-3.5"
            style={{ borderTop: '1px solid var(--border)' }}
            onSubmit={handlePasswordSubmit((data) => passwordMutation.mutate(data))}
          >
            <div className="pt-4">
              <label className={labelCls} style={{ color: 'var(--muted)' }} htmlFor="current-password">
                Current password
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--muted)' }}
                />
                <input
                  {...registerPassword('currentPassword')}
                  id="current-password"
                  className={fieldCls + ' pr-10'}
                  style={{
                    ...fieldStyle,
                    ...(passwordErrors.currentPassword ? { borderColor: 'var(--red)' } : {}),
                  }}
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--muted)' }}
                  onClick={() => setShowCurrent((v) => !v)}
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {passwordErrors.currentPassword && (
                <span className="text-xs mt-1 block" style={{ color: 'var(--red)' }}>
                  {passwordErrors.currentPassword.message}
                </span>
              )}
            </div>

            <div>
              <label className={labelCls} style={{ color: 'var(--muted)' }} htmlFor="new-password">
                New password
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--muted)' }}
                />
                <input
                  {...registerPassword('newPassword')}
                  id="new-password"
                  className={fieldCls + ' pr-10'}
                  style={{
                    ...fieldStyle,
                    ...(passwordErrors.newPassword ? { borderColor: 'var(--red)' } : {}),
                  }}
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--muted)' }}
                  onClick={() => setShowNew((v) => !v)}
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {passwordErrors.newPassword && (
                <span className="text-xs mt-1 block" style={{ color: 'var(--red)' }}>
                  {passwordErrors.newPassword.message}
                </span>
              )}
            </div>

            <div>
              <label className={labelCls} style={{ color: 'var(--muted)' }} htmlFor="confirm-password">
                Confirm new password
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--muted)' }}
                />
                <input
                  {...registerPassword('confirmPassword')}
                  id="confirm-password"
                  className={fieldCls}
                  style={{
                    ...fieldStyle,
                    ...(passwordErrors.confirmPassword ? { borderColor: 'var(--red)' } : {}),
                  }}
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                />
              </div>
              {passwordErrors.confirmPassword && (
                <span className="text-xs mt-1 block" style={{ color: 'var(--red)' }}>
                  {passwordErrors.confirmPassword.message}
                </span>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
                onClick={() => {
                  setShowPasswordForm(false);
                  resetPassword();
                }}
                disabled={passwordMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary flex-1 flex items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-40"
                style={{ background: 'var(--ink)', boxShadow: 'none' }}
                disabled={passwordMutation.isPending}
              >
                {passwordMutation.isPending ? (
                  <>
                    <LoaderCircle size={15} className="spin" />
                    Updating...
                  </>
                ) : (
                  'Update password'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;
