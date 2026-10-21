export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary: 'bg-surface-2 text-content hover:bg-surface-3 border border-line',
    ghost: 'text-content hover:bg-surface-2',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-[12px]',
    md: 'px-4 py-2 text-[13px]',
    lg: 'px-6 py-3 text-[14px]',
  }
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : null}
      {children}
    </button>
  )
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div className={`rounded-xl border border-line bg-surface ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ title, action, className = '' }: { title: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${className}`}>
      <h3 className="font-semibold text-content">{title}</h3>
      {action && <div>{action}</div>}
    </div>
  )
}

export interface CreditsProps {
  value: number
  className?: string
}

export function Credits({ value, className = '' }: CreditsProps) {
  return (
    <span className={`num font-semibold ${className}`}>{value.toLocaleString('en-US')}</span>
  )
}

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  [key: string]: unknown
}

export interface SelectProps<T extends SelectOption = SelectOption> {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  options: T[]
  disabled?: boolean
  className?: string
  renderOption?: (opt: T) => React.ReactNode
}

export function Select<T extends SelectOption = SelectOption>({
  id,
  value,
  onChange,
  placeholder = 'Select…',
  options,
  disabled = false,
  className = '',
  renderOption,
}: SelectProps<T>) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`input appearance-none pr-10 ${className}`}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {renderOption ? renderOption(opt) : opt.label}
        </option>
      ))}
    </select>
  )
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-content placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${className}`}
      {...props}
    />
  )
}

export interface TextareaProps extends React.ComponentPropsWithRef<'textarea'> {}

export function Textarea({ className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={`w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-content placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${className}`}
      {...props}
    />
  )
}