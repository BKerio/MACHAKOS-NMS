import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, LoaderCircle, ShieldCheck, CircleAlert, ChevronLeft,
} from 'lucide-react';
import api from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { Role } from '@/types/api';
import { ROLE_ROUTES } from '@/components/dev/DevRoleSwitcher';
import Logo1 from '@/assets/logos/malteser.png';
import Logo2 from '@/assets/logos/nccg.jpg';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  passwordRaw: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  DISPATCHER: 'Dispatcher',
  WATCHER: 'Watcher',
  PARTNER: 'Partner',
  DRIVER: 'Driver',
  EMT: 'EMT',
  NURSE: 'Nurse',
};

function routeForRole(role: Role) {
  return ROLE_ROUTES[role] || '/unauthorized';
}

interface PendingRoleSelection {
  pendingToken: string;
  roles: Role[];
  name: string;
}

function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const setAuth = useAuthStore((s) => s.setAuth);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<PendingRoleSelection | null>(null);
  const [selectingRole, setSelectingRole] = useState(false);

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    try {
      const res = await api.post('/auth/login', { email: data.email, passwordRaw: data.passwordRaw });
      const result = res.data.data;

      if (result.requiresRoleSelection) {
        setPendingSelection({
          pendingToken: result.pendingToken,
          roles: result.roles,
          name: result.user.name,
        });
        return;
      }

      setAuth(result.token, result.user);
      addNotification({
        type: 'success',
        title: 'Login Successful',
        message: `Welcome back, ${result.user.name}.`,
      });
      navigate(routeForRole(result.user.role));
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      setServerError(msg || 'Invalid credentials. Please try again.');
    }
  };

  const chooseRole = async (role: Role) => {
    if (!pendingSelection || selectingRole) return;
    setSelectingRole(true);
    setServerError('');
    try {
      const res = await api.post(
        '/auth/select-role',
        { role },
        { headers: { Authorization: `Bearer ${pendingSelection.pendingToken}` } }
      );
      const result = res.data.data;
      setAuth(result.token, result.user);
      addNotification({
        type: 'success',
        title: 'Login Successful',
        message: `Welcome back, ${result.user.name}.`,
      });
      navigate(routeForRole(result.user.role));
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      setServerError(msg || 'That session expired. Please sign in again.');
      setPendingSelection(null);
    } finally {
      setSelectingRole(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card fade-up">
        {/* Co-branded header */}
        <div className="login-cobrand">
          <img src={Logo2} alt="Machakos County" draggable={false} style={{ height: 46, width: 'auto', objectFit: 'contain' }} />
          <span className="login-cobrand-div" />
          <img src={Logo1} alt="Malteser International" draggable={false} style={{ height: 38, width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Form body */}
        <div className="login-body">

          {pendingSelection ? (
            <>
              <button
                type="button"
                onClick={() => { setPendingSelection(null); setServerError(''); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8,
                  fontSize: 12.5, fontWeight: 600, color: 'var(--muted)',
                  background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
                }}
              >
                <ChevronLeft size={14} /> Back
              </button>
              <h1 className="login-title">Choose a role</h1>
              <p className="login-sub">
                Hi {pendingSelection.name.split(' ')[0]}, your account holds more than one role. Pick which one to sign in as.
              </p>

              {serverError && (
                <div className="alert-error" role="alert">
                  <CircleAlert size={16} />
                  <span>{serverError}</span>
                </div>
              )}

              <div className="col" style={{ gap: 10, marginTop: serverError ? 16 : 8 }}>
                {pendingSelection.roles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    disabled={selectingRole}
                    onClick={() => chooseRole(role)}
                    className="btn btn-block btn-lg"
                    style={{
                      justifyContent: 'space-between',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--ink)',
                    }}
                  >
                    {ROLE_LABEL[role]}
                    {selectingRole ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h1 className="login-title">Login console</h1>
              <p className="login-sub">Machakos County emergency dispatch console.</p>

              {serverError && (
                <div className="alert-error" role="alert">
                  <CircleAlert size={16} />
                  <span>{serverError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="col" style={{ gap: 16, marginTop: serverError ? 16 : 0 }}>
                <div className="field">
                  <label className="label" htmlFor="login-email">Enter your email address</label>
                  <div className="input-icon">
                    <input
                      {...register('email')}
                      id="login-email"
                      className="input"
                      type="email"
                      autoComplete="username"
                      autoFocus
                      placeholder="you@machakos.go.ke"
                      style={errors.email ? { borderColor: 'var(--red)' } : undefined}
                    />
                    <Mail size={16} />
                  </div>
                  {errors.email && (
                    <span className="field-error">{errors.email.message}</span>
                  )}
                </div>

                <div className="field">
                  <label className="label" htmlFor="login-password">Enter your password</label>
                  <div className="input-icon has-toggle">
                    <input
                      {...register('passwordRaw')}
                      id="login-password"
                      className="input"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="************"
                      style={errors.passwordRaw ? { borderColor: 'var(--red)' } : undefined}
                    />
                    <Lock size={16} />
                    <button
                      type="button"
                      className="field-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.passwordRaw && (
                    <span className="field-error">{errors.passwordRaw.message}</span>
                  )}
                </div>

                <button
                  className="btn btn-primary btn-block btn-lg login-submit"
                  disabled={isSubmitting}
                  type="submit"
                  style={{ marginTop: 4 }}
                >
                  {isSubmitting ? (
                    <><LoaderCircle size={18} className="spin" /> Signing in…</>
                  ) : (
                    <>Sign in <ArrowRight size={16} /></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="login-foot">
          <ShieldCheck size={15} />
            Authorized personnel only · All activity is logged and audited
          <p className="login-copy">© {new Date().getFullYear()} Machakos County Government · In partnership with Malteser International</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
