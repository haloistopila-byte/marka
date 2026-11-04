import React, { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, X } from 'lucide-react';

/**
 * Marka Photobooth UI kit.
 * Ink chrome on an album-paper ground, white surfaces with a 1px edge, one near-black primary per
 * screen, pale status pairs. Cards 8px, controls 6px, status chips fully round. Only what floats
 * (menus, dialogs, sheets, toasts) casts a shadow. Tokens live in src/index.css.
 */

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export const EASE = [0.22, 1, 0.36, 1] as const;
export const SPRING = { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 } as const;

// ------------------------------------------------------------------ layout

/** The canvas of one screen: fluid, one gutter, the title row at the top. */
export const Page: React.FC<{ children: React.ReactNode; className?: string; narrow?: boolean }> = ({ children, className, narrow }) => (
  <div className={cx('min-h-full px-5 pb-24 pt-5 font-ui text-ink sm:px-6 md:pb-12 lg:px-8 lg:pt-7', className)}>
    <div className={cx('mx-auto space-y-5', narrow ? 'max-w-[1100px]' : 'max-w-[1440px]')}>{children}</div>
  </div>
);

/** Title row: a noun at 24px, one grey line about the data, actions on the right, tabs underneath. */
export const PageHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** @deprecated small labels above the title are not used */
  eyebrow?: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, description, actions, meta, children }) => (
  <header className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-8 tracking-[-0.01em] text-ink sm:text-[24px]">{title}</h1>
        {description && <p className="mt-0.5 max-w-[80ch] text-[14px] leading-5 text-ink-2">{description}</p>}
      </div>
      {(actions || meta) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {meta && <span className="text-[12px] text-ink-3">{meta}</span>}
          {actions}
        </div>
      )}
    </div>
    {children}
  </header>
);

/** @deprecated use PageHeader */
export const ModuleHeader: React.FC<{ title: string; description?: React.ReactNode; actions?: React.ReactNode }> = props => (
  <PageHeader {...props} />
);

export const Panel: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'white' | 'shell';
  className?: string;
  bodyClassName?: string;
  id?: string;
  flush?: boolean;
}> = ({ title, description, actions, children, tone = 'white', className, bodyClassName, id, flush }) => (
  <section
    id={id}
    className={cx('rounded-lg', tone === 'white' ? 'border border-line bg-white' : 'bg-shell', !flush && 'p-4 sm:p-5', className)}
  >
    {(title || actions) && (
      <div className={cx('flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between', flush ? 'px-4 pt-4 sm:px-5 sm:pt-5' : '', 'mb-4')}>
        <div className="min-w-0">
          {title && <h2 className="text-[15px] font-semibold leading-6 text-ink">{title}</h2>}
          {description && <p className="mt-0.5 max-w-[72ch] text-[13px] leading-5 text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className={bodyClassName}>{children}</div>
  </section>
);

// ------------------------------------------------------------------ buttons

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-night text-white hover:bg-night-2',
  secondary: 'border border-control bg-white text-ink hover:bg-shell',
  soft: 'bg-chip text-ink hover:bg-[#dddcd7]',
  ghost: 'bg-transparent text-ink-2 hover:bg-chip hover:text-ink',
  danger: 'border border-alert-line bg-white text-alert hover:bg-alert-bg'
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm' | 'lg';
  icon?: React.ElementType;
  iconRight?: React.ElementType;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, className, children, disabled, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-ui font-medium',
        'transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-45',
        size === 'lg' ? 'h-11 text-[14px]' : size === 'md' ? 'h-9 text-[14px]' : 'h-8 text-[13px]',
        // Icon-only buttons are square
        children ? (size === 'sm' ? 'px-3' : 'px-4') : size === 'lg' ? 'w-11' : size === 'md' ? 'w-9' : 'w-8',
        BUTTON[variant],
        className
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : (
        Icon && <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-[17px] w-[17px]'} strokeWidth={1.75} aria-hidden />
      )}
      {children}
      {IconRight && !loading && <IconRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
    </button>
  )
);
Button.displayName = 'Button';

/** Plain text action inside rows and headers ("Lihat semua"). */
export const TextButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ElementType }> = ({
  className,
  children,
  icon: Icon,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={cx('inline-flex items-center gap-1 rounded text-[13px] font-medium text-ink underline-offset-4 hover:underline disabled:opacity-45', className)}
    {...rest}
  >
    {children}
    {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
  </button>
);

// ------------------------------------------------------------------ form

export const Field: React.FC<{
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
  optional?: boolean;
}> = ({ label, htmlFor, hint, error, children, className, optional }) => (
  <div className={cx('min-w-0', className)}>
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink">
      <span>{label}</span>
      {optional && <span className="text-[12px] font-normal text-ink-3">opsional</span>}
    </label>
    {children}
    {error ? (
      <p className="mt-1.5 text-[12px] font-medium text-alert" role="alert">{error}</p>
    ) : (
      hint && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{hint}</p>
    )}
  </div>
);

export const controlCls =
  'w-full rounded-md border border-control bg-white px-3 font-ui text-[14px] text-ink placeholder:text-ink-3 ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-[#bdbcb6] focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 ' +
  'disabled:cursor-not-allowed disabled:bg-shell disabled:text-ink-2';

export const Input = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> & { prefix?: string; suffix?: string }>(
  ({ className, prefix, suffix, ...rest }, ref) => {
    if (!prefix && !suffix) return <input ref={ref} className={cx(controlCls, 'h-10', className)} {...rest} />;
    return (
      <div className={cx('relative', className)}>
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-ink-3">{prefix}</span>}
        <input ref={ref} className={cx(controlCls, 'h-10', prefix && 'pl-9', suffix && 'pr-12')} {...rest} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-ink-3">{suffix}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 3, ...rest }, ref) => (
  <textarea ref={ref} rows={rows} className={cx(controlCls, 'py-2.5 leading-relaxed', className)} {...rest} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }>(
  ({ className, wrapperClassName, children, ...rest }, ref) => (
    <div className={cx('relative min-w-0', wrapperClassName)}>
      <select ref={ref} className={cx(controlCls, 'h-10 appearance-none truncate pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" strokeWidth={1.75} aria-hidden />
    </div>
  )
);
Select.displayName = 'Select';

export const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean; size?: 'sm' | 'md' }> = ({
  checked,
  onChange,
  label,
  disabled,
  size = 'md'
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cx(
      'relative shrink-0 rounded-full transition-colors duration-200 disabled:opacity-45',
      size === 'sm' ? 'h-5 w-9' : 'h-6 w-10',
      checked ? 'bg-night' : 'bg-[#d3d2cd]'
    )}
  >
    <motion.span
      className={cx('absolute left-0.5 top-0.5 rounded-full bg-white', size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')}
      initial={false}
      animate={{ x: checked ? 16 : 0 }}
      transition={SPRING}
    />
  </button>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  description,
  disabled
}) => (
  <div className={cx('flex min-h-11 items-center justify-between gap-4', disabled && 'opacity-50')}>
    <span className="min-w-0">
      <span className="block text-[14px] font-medium text-ink">{label}</span>
      {description && <span className="block text-[12px] leading-5 text-ink-3">{description}</span>}
    </span>
    <Switch checked={checked} onChange={onChange} label={typeof label === 'string' ? label : undefined} disabled={disabled} />
  </div>
);

/** A titled group of fields inside a form; groups are separated by space, not boxes. */
export const FormSection: React.FC<{ title: React.ReactNode; description?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  description,
  aside,
  children,
  className
}) => (
  <section className={cx('space-y-4', className)}>
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{description}</p>}
      </div>
      {aside}
    </div>
    {children}
  </section>
);

/** One option in a set of cards that can each be on or off (or one of which is chosen). */
export const ChoiceCard: React.FC<{ on: boolean; title: React.ReactNode; detail?: React.ReactNode; onClick: () => void; disabled?: boolean }> = ({ on, title, detail, onClick, disabled }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={on}
    disabled={disabled}
    onClick={onClick}
    className={cx(
      'flex min-w-0 items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-[border-color,box-shadow,background-color] duration-150 disabled:cursor-default',
      on ? 'border-ink bg-white ring-1 ring-ink' : 'border-line bg-white hover:border-control',
      disabled && on && 'border-line bg-shell ring-0'
    )}
  >
    <span className={cx('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border transition-colors', on ? 'border-ink bg-ink text-white' : 'border-control bg-white')} aria-hidden>
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
    <span className="min-w-0">
      <span className="block break-words text-[13px] font-medium leading-5 text-ink">{title}</span>
      {detail && <span className="num mt-0.5 block text-[12px] leading-4 text-ink-3">{detail}</span>}
    </span>
  </button>
);

// ------------------------------------------------------------------ navigation

/**
 * Underline tabs on a full-width rule; the indicator slides between tabs. Tabs whose value lives in
 * the URL get their onChange from useRouteTab.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className
}: {
  tabs: Array<{ id: NoInfer<T>; label: React.ReactNode; count?: number; alert?: boolean }>;
  value: T;
  onChange: ((id: T) => void) | React.Dispatch<React.SetStateAction<T>>;
  label: string;
  className?: string;
}) {
  const group = useId();
  const listRef = useRef<HTMLDivElement>(null);
  // On a narrow screen the active tab may sit past the edge of the strip: bring it into view
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const left = tab.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
    if (left < list.scrollLeft || left + tab.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: Math.max(0, left - 20), behavior: 'smooth' });
    }
  }, [value]);
  return (
    <div ref={listRef} role="tablist" aria-label={label} className={cx('no-scrollbar -mx-5 flex gap-1 overflow-x-auto border-b border-line px-5 sm:mx-0 sm:px-0', className)}>
      {tabs.map(t => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => (onChange as (id: T) => void)(t.id)}
            className={cx(
              'relative flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[14px] transition-colors',
              active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink'
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={cx('num text-[12px]', t.alert ? 'font-medium text-alert' : 'text-ink-3')}>{t.count}</span>}
            {active && <motion.span layoutId={`tab-${group}`} className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-ink" transition={SPRING} />}
          </button>
        );
      })}
    </div>
  );
}

/** A segmented control as wide as its options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className
}: {
  options: Array<{ id: NoInfer<T>; label: React.ReactNode }>;
  value: T;
  onChange: ((id: T) => void) | React.Dispatch<React.SetStateAction<T>>;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const group = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex max-w-full overflow-x-auto rounded-md bg-chip p-0.5 no-scrollbar', className)}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => (onChange as (id: T) => void)(o.id)}
            className={cx(
              'relative shrink-0 whitespace-nowrap rounded-[5px] px-3 transition-colors',
              size === 'sm' ? 'h-7 text-[12px]' : 'h-8 text-[13px]',
              active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink'
            )}
          >
            {active && <motion.span layoutId={`seg-${group}`} className="absolute inset-0 rounded-[5px] bg-white ring-1 ring-black/5" transition={SPRING} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ feedback

export type Tone = 'neutral' | 'ok' | 'warn' | 'alert' | 'data' | 'outline' | 'dark' | 'soft' | 'dashed';
const BADGE: Record<Tone, string> = {
  neutral: 'bg-chip text-[#3d3d3d]',
  soft: 'bg-chip text-[#3d3d3d]',
  ok: 'bg-ok-bg text-ok-ink',
  warn: 'bg-warn-bg text-warn ring-1 ring-inset ring-warn-line',
  alert: 'bg-alert-bg text-alert-ink',
  data: 'bg-data-soft text-data',
  outline: 'bg-white text-ink ring-1 ring-inset ring-control',
  dashed: 'bg-white text-ink-2 outline-1 outline-dashed outline-control -outline-offset-1',
  dark: 'bg-night text-white'
};

export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean; title?: string }> = ({
  tone = 'neutral',
  children,
  className,
  dot,
  title
}) => (
  <span title={title} className={cx('inline-flex h-[22px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] font-medium', BADGE[tone], className)}>
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />}
    {children}
  </span>
);

export const Notice: React.FC<{ tone?: 'info' | 'alert' | 'ok' | 'warn'; children: React.ReactNode; action?: React.ReactNode; icon?: React.ElementType; className?: string }> = ({
  tone = 'info',
  children,
  action,
  icon: Icon,
  className
}) => (
  <div
    role={tone === 'alert' ? 'alert' : 'status'}
    className={cx(
      'flex flex-col gap-3 rounded-lg px-4 py-3 text-[13px] leading-5 sm:flex-row sm:items-center sm:justify-between',
      tone === 'alert' && 'border border-alert-line bg-alert-bg text-alert-ink',
      tone === 'ok' && 'border border-ok-line bg-ok-bg text-ok-ink',
      tone === 'warn' && 'border border-warn-line bg-warn-bg text-warn',
      tone === 'info' && 'border border-line bg-white text-ink-2',
      className
    )}
  >
    <div className="flex min-w-0 items-start gap-2.5">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />}
      <div className="min-w-0">{children}</div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/** An empty block keeps its frame and says one sentence, with the next step beside it. */
export const EmptyState: React.FC<{ icon?: React.ElementType; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({
  icon: Icon,
  title,
  description,
  action,
  className
}) => (
  <div className={cx('flex flex-col items-center rounded-lg border border-dashed border-control px-6 py-9 text-center', className)}>
    {Icon && <Icon className="mb-3 h-5 w-5 text-ink-3" strokeWidth={1.75} aria-hidden />}
    <p className="text-[14px] font-medium text-ink">{title}</p>
    {description && <p className="mt-1 max-w-[52ch] text-[13px] leading-5 text-ink-2">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/** @deprecated use KpiStrip; kept for screens not yet moved */
export const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; dark?: boolean }> = ({ label, value, hint }) => (
  <div className="rounded-lg border border-line bg-white p-4">
    <p className="text-[13px] text-ink-2">{label}</p>
    <p className="num mt-1 text-[24px] font-semibold leading-8">{value}</p>
    {hint && <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>}
  </div>
);

export interface KpiItem {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'alert' | 'ok' | 'muted';
  title?: string;
  /** The screen's answer figure: set larger than its siblings */
  lead?: boolean;
  onClick?: () => void;
}

/** Headline numbers in one card split by 1px dividers; label above value. */
export const KpiStrip: React.FC<{ items: KpiItem[]; className?: string }> = ({ items, className }) => {
  const cols = items.length;
  const grid =
    cols >= 6 ? 'grid-cols-2 lg:grid-cols-3'
    : cols === 5 ? 'grid-cols-2 lg:grid-cols-5'
    : cols === 4 ? 'grid-cols-2 lg:grid-cols-4'
    : cols === 3 ? 'grid-cols-1 sm:grid-cols-3'
    : cols === 2 ? 'grid-cols-2'
    : 'grid-cols-1';
  return (
    <div className={cx('grid gap-px overflow-hidden rounded-lg border border-line bg-line', grid, className)}>
      {items.map((k, i) => {
        const Tag = k.onClick ? 'button' : 'div';
        return (
          <Tag
            key={i}
            type={k.onClick ? 'button' : undefined}
            onClick={k.onClick}
            title={k.title}
            className={cx(
              'min-w-0 bg-white px-4 py-3.5 text-left sm:px-5 sm:py-4',
              k.onClick && 'transition-colors hover:bg-[#fbfbfa]',
              // An odd count leaves the last cell alone on a phone: let it span
              cols % 2 === 1 && cols > 1 && i === cols - 1 && 'col-span-2 sm:col-span-1'
            )}
          >
            <p className="truncate text-[13px] text-ink-2">{k.label}</p>
            <p
              className={cx(
                'num mt-1 break-words font-semibold leading-tight tracking-[-0.01em] sm:truncate',
                k.lead ? 'text-[22px] sm:text-[30px]' : 'text-[17px] sm:text-[22px]',
                k.tone === 'alert' ? 'text-alert' : k.tone === 'ok' ? 'text-ok' : k.tone === 'muted' ? 'text-ink-3' : 'text-ink'
              )}
            >
              {k.value}
            </p>
            {k.hint && <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink-3 sm:line-clamp-1">{k.hint}</p>}
          </Tag>
        );
      })}
    </div>
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => <span className={cx('block rounded bg-chip', className)} aria-hidden />;

/** A small initial disc for a person; the tint is identity, not data. */
const AVATAR_TINTS = ['#e8eef8', '#f1ebf6', '#eaf3ee', '#f7eee4', '#eef0f2', '#f6e9ec', '#e9f2f4', '#f3f1e3'];
export const Avatar: React.FC<{ name: string; size?: number; className?: string }> = ({ name, size = 24, className }) => {
  const clean = (name || '?').trim();
  const initials = clean.split(/\s+|&/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';
  let h = 0;
  for (let i = 0; i < clean.length; i++) h = (h * 31 + clean.charCodeAt(i)) >>> 0;
  return (
    <span
      title={clean}
      className={cx('inline-grid flex-none place-items-center rounded-full font-medium text-ink-2 ring-2 ring-white', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)), background: AVATAR_TINTS[h % AVATAR_TINTS.length] }}
    >
      {initials}
    </span>
  );
};

/** Thin progress bar at its true ratio. */
export const Progress: React.FC<{ value: number; tone?: 'ink' | 'data' | 'alert' | 'ok'; className?: string; label?: string }> = ({ value, tone = 'ink', className, label }) => {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-chip', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div
        className={cx('h-full rounded-full', tone === 'data' ? 'bg-data' : tone === 'alert' ? 'bg-alert' : tone === 'ok' ? 'bg-ok' : 'bg-ink')}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: EASE }}
      />
    </div>
  );
};

// ------------------------------------------------------------------ overlays

function useOverlayBehaviour(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Only the topmost overlay closes
      const layers = document.querySelectorAll('[data-overlay-layer]');
      if (layers[layers.length - 1] === ref.current) {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (el && !el.contains(document.activeElement)) {
        const target = el.querySelector<HTMLElement>('[data-autofocus]') || el;
        target.focus({ preventScroll: true });
      }
    }, 30);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open, ref]);
}

/** A panel that slides in from the right; full screen on a phone. */
export const Sheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  width?: number;
  label?: string;
  /** Rendered above the scroll area, under the title (tabs) */
  toolbar?: React.ReactNode;
  bodyRef?: React.Ref<HTMLDivElement>;
  /** Stacking order when a sheet opens over another overlay */
  z?: number;
}> = ({ open, onClose, title, description, children, footer, headerActions, width = 720, label, toolbar, bodyRef, z = 60 }) => {
  const ref = useRef<HTMLDivElement>(null);
  useOverlayBehaviour(open, onClose, ref);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 flex justify-end" style={{ zIndex: z }} role="presentation">
          <motion.div
            className="absolute inset-0 bg-[#0a0a0a]/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            data-overlay-layer
            role="dialog"
            aria-modal="true"
            aria-label={label || (typeof title === 'string' ? title : undefined)}
            tabIndex={-1}
            className="relative flex h-full w-full flex-col bg-canvas shadow-[0_0_0_1px_rgba(0,0,0,.04),0_24px_64px_-12px_rgba(0,0,0,.25)] outline-none sm:rounded-l-xl"
            style={{ maxWidth: width }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40, mass: 0.9 }}
          >
            {(title || headerActions) && (
              <div className="flex shrink-0 items-start justify-between gap-3 bg-white px-4 pb-3 pt-4 sm:rounded-tl-xl sm:px-6">
                <div className="min-w-0">
                  {typeof title === 'string' ? <h2 className="truncate text-[18px] font-semibold leading-7">{title}</h2> : title}
                  {description && <div className="mt-0.5 text-[13px] text-ink-2">{description}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {headerActions}
                  <Button variant="ghost" icon={X} onClick={onClose} aria-label="Tutup" />
                </div>
              </div>
            )}
            {toolbar && <div className="shrink-0 bg-white px-4 sm:px-6">{toolbar}</div>}
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            {footer && <div className="shrink-0 border-t border-line bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-bl-xl sm:px-6">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/** A centred dialog; a bottom sheet on a phone. */
export const Dialog: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  label?: string;
}> = ({ open, onClose, title, description, children, footer, width = 520, label }) => {
  const ref = useRef<HTMLDivElement>(null);
  useOverlayBehaviour(open, onClose, ref);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" role="presentation">
          <motion.div
            className="absolute inset-0 bg-[#0a0a0a]/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            data-overlay-layer
            role="dialog"
            aria-modal="true"
            aria-label={label || (typeof title === 'string' ? title : undefined)}
            tabIndex={-1}
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.05),0_24px_60px_-16px_rgba(0,0,0,.35)] outline-none sm:rounded-xl"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            {(title || description) && (
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
                <div className="min-w-0">
                  {title && <h2 className="text-[17px] font-semibold leading-6">{title}</h2>}
                  {description && <div className="mt-1 text-[13px] leading-5 text-ink-2">{description}</div>}
                </div>
                <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Tutup" />
              </div>
            )}
            {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>}
            {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ------------------------------------------------------------------ data helpers

/** Classes for a plain data table: grey sentence-case headers, row rules, no bands. */
export const table = {
  // relative: keeps sr-only labels in the last column inside the scroll box
  wrap: 'relative overflow-x-auto',
  table: 'w-full border-collapse text-left text-[14px]',
  th: 'h-10 whitespace-nowrap px-3 text-[12px] font-normal text-ink-3 first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
  thNum: 'h-10 whitespace-nowrap px-3 text-right text-[12px] font-normal text-ink-3 last:pr-4 sm:last:pr-5',
  tr: 'border-t border-rule transition-colors hover:bg-[#fafaf8]',
  td: 'h-12 px-3 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
  tdNum: 'num h-12 whitespace-nowrap px-3 text-right align-middle last:pr-4 sm:last:pr-5'
};

/** A grey dash for a value that is missing (a real zero is printed). */
export const Dash: React.FC = () => <span className="text-ink-3">—</span>;

// ------------------------------------------------------------------ number entry

const groupDigits = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('id-ID') : '');

/**
 * Rupiah entry with thousands separators while typing ("5.500.000"). Empty stays empty so a
 * placeholder can show; the value handed back is always a number.
 */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix'> & { value?: number | null | ''; onValueChange: (n: number) => void; prefix?: string; suffix?: string }
>(({ value, onValueChange, prefix = 'Rp', suffix, className, readOnly, ...rest }, ref) => {
  const shown = value === '' || value === null || value === undefined || (value === 0 && rest.placeholder) ? '' : groupDigits(Number(value));
  return (
    <div className={cx('relative', className)}>
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-ink-3">{prefix}</span>}
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={shown}
        readOnly={readOnly}
        onChange={e => {
          const digits = e.target.value.replace(/[^\d]/g, '');
          onValueChange(digits === '' ? 0 : Number(digits));
        }}
        className={cx(controlCls, 'num h-10 text-right', prefix && 'pl-10', suffix && 'pr-12', readOnly && 'bg-shell text-ink-2')}
        {...rest}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-ink-3">{suffix}</span>}
    </div>
  );
});
MoneyInput.displayName = 'MoneyInput';

/** A small count with − and + (hours, pieces, people). */
export const Stepper: React.FC<{ value: number; onChange: (n: number) => void; min?: number; max?: number; unit?: string; label: string; disabled?: boolean }> = ({
  value,
  onChange,
  min = 0,
  max = 999,
  unit,
  label,
  disabled
}) => {
  const v = Number.isFinite(value) ? value : 0;
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className={cx('inline-flex h-9 items-center rounded-md border border-control bg-white', disabled && 'opacity-50')}>
      <button type="button" disabled={disabled || v <= min} onClick={() => set(v - 1)} aria-label={`Kurangi ${label}`} className="grid h-full w-8 place-items-center text-ink-2 hover:text-ink disabled:opacity-30">
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        disabled={disabled}
        value={String(v)}
        onChange={e => set(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
        className="num h-full w-9 bg-transparent text-center text-[14px] focus:outline-none"
      />
      {unit && <span className="pr-1 text-[12px] text-ink-3">{unit}</span>}
      <button type="button" disabled={disabled || v >= max} onClick={() => set(v + 1)} aria-label={`Tambah ${label}`} className="grid h-full w-8 place-items-center text-ink-2 hover:text-ink disabled:opacity-30">
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2.5 6h7M6 2.5v7" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
    </div>
  );
};
