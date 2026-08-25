import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, LoaderCircle, ShieldCheck, CircleAlert, ChevronLeft,
  Phone, KeyRound, RefreshCw,
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

const OTP_RESEND_SECONDS = 60;

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

type LoginMode = 'staff' | 'field';

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

  const [mode, setMode] = useState<LoginMode>('staff');

  // Field crew (Driver/EMT/Nurse) phone + OTP login
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const finishLogin = (result: any) => {
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
  };

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    try {
      const res = await api.post('/auth/login', { email: data.email, passwordRaw: data.passwordRaw });
      finishLogin(res.data.data);
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
      finishLogin(res.data.data);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      setServerError(msg || 'That session expired. Please sign in again.');
      setPendingSelection(null);
    } finally {
      setSelectingRole(false);
    }
  };

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (otpSubmitting) return;
    setServerError('');
    setOtpSubmitting(true);
    try {
      await api.post('/auth/otp/request', { phone });
      setOtpStep('code');
      setCode('');
      setResendIn(OTP_RESEND_SECONDS);
      addNotification({
        type: 'success',
        title: 'Code sent',
        message: `A 6-digit code was sent to ${phone}.`,
      });
      setTimeout(() => codeInputRef.current?.focus(), 50);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      setServerError(msg || 'Could not send a code to that number. Please try again.');
    } finally {
      setOtpSubmitting(false);
    }
  };

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || otpSubmitting) return;
    setServerError('');
    setOtpSubmitting(true);
    try {
      const res = await api.post('/auth/otp/verify', { phone, code });
      finishLogin(res.data.data);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      setServerError(msg || 'Incorrect or expired code. Please try again.');
    } finally {
      setOtpSubmitting(false);
    }
  };

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setServerError('');
    setPendingSelection(null);
    setOtpStep('phone');
    setCode('');
    setResendIn(0);
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

              {/* Staff vs field crew tabs */}
              <div
                role="tablist"
                aria-label="Login method"
                className="row"
                style={{
                  gap: 4, marginTop: 14, marginBottom: 4, padding: 4,
                  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
                }}
              >
                {(['staff', 'field'] as LoginMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => switchMode(m)}
                    className="btn"
                    style={{
                      flex: 1, justifyContent: 'center', fontSize: 13, padding: '8px 10px',
                      background: mode === m ? 'var(--surface)' : 'transparent',
                      border: mode === m ? '1px solid var(--border)' : '1px solid transparent',
                      color: mode === m ? 'var(--ink)' : 'var(--muted)',
                      fontWeight: mode === m ? 700 : 600,
                    }}
                  >
                    {m === 'staff' ? 'Staff Login' : 'Field Crew Login'}
                  </button>
                ))}
              </div>

              {serverError && (
                <div className="alert-error" role="alert">
                  <CircleAlert size={16} />
                  <span>{serverError}</span>
                </div>
              )}

              {mode === 'staff' ? (
                <form onSubmit={handleSubmit(onSubmit)} className="col" style={{ gap: 16, marginTop: serverError ? 16 : 12 }}>
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
              ) : otpStep === 'phone' ? (
                <form onSubmit={requestCode} className="col" style={{ gap: 16, marginTop: serverError ? 16 : 12 }}>
                  <p className="login-sub" style={{ margin: 0 }}>
                    For Drivers, EMTs, and Nurses. We&apos;ll text a 6-digit code to your registered phone number.
                  </p>
                  <div className="field">
                    <label className="label" htmlFor="login-phone">Phone number</label>
                    <div className="input-icon">
                      <input
                        id="login-phone"
                        className="input"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        autoFocus
                        placeholder="07XX XXX XXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                      <Phone size={16} />
                    </div>
                  </div>

                  <button
                    className="btn btn-primary btn-block btn-lg login-submit"
                    disabled={otpSubmitting || phone.trim().length < 9}
                    type="submit"
                    style={{ marginTop: 4 }}
                  >
                    {otpSubmitting ? (
                      <><LoaderCircle size={18} className="spin" /> Sending code…</>
                    ) : (
                      <>Send code <ArrowRight size={16} /></>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={verifyCode} className="col" style={{ gap: 16, marginTop: serverError ? 16 : 12 }}>
                  <button
                    type="button"
                    onClick={() => { setOtpStep('phone'); setServerError(''); setResendIn(0); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 12.5, fontWeight: 600, color: 'var(--muted)',
                      background: 'transparent', border: 0, padding: 0, cursor: 'pointer', width: 'fit-content',
                    }}
                  >
                    <ChevronLeft size={14} /> Change number
                  </button>

                  <div className="field">
                    <label className="label" htmlFor="login-code">Enter the 6-digit code sent to {phone}</label>
                    <div className="input-icon">
                      <input
                        ref={codeInputRef}
                        id="login-code"
                        className="input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="000000"
                        style={{ letterSpacing: 4, fontWeight: 700 }}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      />
                      <KeyRound size={16} />
                    </div>
                  </div>

                  <button
                    className="btn btn-primary btn-block btn-lg login-submit"
                    disabled={otpSubmitting || code.length !== 6}
                    type="submit"
                  >
                    {otpSubmitting ? (
                      <><LoaderCircle size={18} className="spin" /> Verifying…</>
                    ) : (
                      <>Verify &amp; sign in <ArrowRight size={16} /></>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => requestCode()}
                    disabled={resendIn > 0 || otpSubmitting}
                    className="btn btn-block"
                    style={{
                      justifyContent: 'center', fontSize: 13, background: 'transparent',
                      border: '1px solid var(--border)', color: resendIn > 0 ? 'var(--muted)' : 'var(--ink)',
                    }}
                  >
                    <RefreshCw size={14} />
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                  </button>
                </form>
              )}
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
