import type { ReactNode } from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
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
  // The size classes come from index.css so they inherit the same 44px
  // minimum touch target and line height as every other control.
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  }
  const sizes = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
  }
  return (
    <button
      className={`${variants[variant]} ${sizes[size]} ${className}`}
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
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
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
  renderOption?: (opt: T) => ReactNode
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

/**
 * Uses the shared `.input` class so every field is a 44px touch target and
 * renders at 16px on phones (13px makes iOS Safari zoom the page on focus).
 */
export function Input({ className = '', ...props }: InputProps) {
  return <input className={`input ${className}`} {...props} />
}

export interface TextareaProps extends React.ComponentPropsWithRef<'textarea'> {}

export function Textarea({ className = '', ...props }: TextareaProps) {
  return <textarea className={`input ${className}`} {...props} />
}
