import { forwardRef } from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        className={clsx(
          'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
          {
            // Variants
            'bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-primary': variant === 'primary',
            'bg-secondary text-secondary-foreground hover:bg-secondary-hover focus:ring-secondary': variant === 'secondary',
            'bg-accent text-accent-foreground hover:bg-accent-hover focus:ring-accent': variant === 'accent',
            'bg-success text-success-foreground hover:bg-success-hover focus:ring-success': variant === 'success',
            'bg-warning text-warning-foreground hover:bg-warning-hover focus:ring-warning': variant === 'warning',
            'bg-error text-error-foreground hover:bg-error-hover focus:ring-error': variant === 'error',
            'bg-transparent text-foreground-secondary hover:bg-card-hover hover:text-foreground focus:ring-primary': variant === 'ghost',
          },
          {
            // Sizes
            'px-3 py-2 text-sm': size === 'sm',
            'px-4 py-2 text-base': size === 'md',
            'px-6 py-3 text-lg': size === 'lg',
            'p-2': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
