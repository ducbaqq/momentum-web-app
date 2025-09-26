import { forwardRef } from 'react';
import { clsx } from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        className={clsx(
          'flex h-10 w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm',
          'placeholder:text-foreground-muted',
          'focus:border-input-focus focus:outline-none focus:ring-2 focus:ring-input-focus/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
