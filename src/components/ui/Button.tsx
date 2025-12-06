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
    const baseStyles = "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900";

    const variants = {
        primary: "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/30 focus:ring-blue-500",
        secondary: "bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700 focus:ring-gray-500",
        ghost: "text-gray-400 hover:text-white hover:bg-gray-800 focus:ring-gray-500",
        danger: "bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 focus:ring-red-500"
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
