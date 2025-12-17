import React from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    icon?: React.ElementType;
}

export default function Button({
    children,
    variant = 'primary',
    size = 'md',
    isLoading,
    icon: Icon,
    className,
    disabled,
    ...props
}: ButtonProps) {
    const baseStyles = "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white";

    const variants = {
        primary: "bg-ela-pink text-white hover:bg-rose-700 shadow-lg shadow-rose-900/20 focus:ring-ela-pink",
        secondary: "bg-ela-card text-ela-text hover:bg-gray-50 border border-ela-border focus:ring-gray-400",
        ghost: "text-ela-sub hover:text-ela-text hover:bg-gray-100 focus:ring-gray-400",
        danger: "bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 focus:ring-red-500"
    };

    const sizes = {
        sm: "px-3 py-1.5 text-sm gap-1.5",
        md: "px-4 py-2 text-sm gap-2",
        lg: "px-6 py-3 text-base gap-2.5"
    };

    return (
        <button
            className={clsx(baseStyles, variants[variant], sizes[size], className)}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <Loader2 className="animate-spin" size={size === 'lg' ? 20 : 16} />
            ) : Icon ? (
                <Icon size={size === 'lg' ? 20 : 18} />
            ) : null}
            {children}
        </button>
    );
}
