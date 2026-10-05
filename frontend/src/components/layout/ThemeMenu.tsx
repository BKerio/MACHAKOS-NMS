import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { ACCENTS, setAccent, setThemeMode, useTheme, type ThemeMode } from '@/lib/theme';

const MODES: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
];

/** Top-bar appearance menu: light / dark / system, then the accent colour. */
function ThemeMenu() {
  const { mode, accent, resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ButtonIcon = mode === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        title="Appearance"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ButtonIcon size={18} />
      </button>

      {open && (
        <div className="theme-menu" role="menu" aria-label="Appearance">
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={mode === id}
              className={`theme-menu-item${mode === id ? ' on' : ''}`}
              onClick={() => setThemeMode(id)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}

          <div className="theme-menu-sep" />
          <p className="theme-menu-label">Change accent</p>
          <div className="theme-accents" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((a) => {
              const on = accent === a.id;
              return (
                <button
                  key={a.id}
                  role="radio"
                  aria-checked={on}
                  className={`theme-accent${on ? ' on' : ''}`}
                  onClick={() => setAccent(a.id)}
                  title={a.label}
                >
                  <span className="theme-swatch" style={{ background: a.swatch }}>
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="theme-accent-name">{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ThemeMenu;
