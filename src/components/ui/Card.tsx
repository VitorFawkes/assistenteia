import React from 'react';
import { clsx } from 'clsx';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
    onClick?: () => void;
}

export default function Card({ children, className, hover, onClick }: CardProps) {
    return (
        <div
            onClick={onClick}
            className={clsx(
                "bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden",
                hover && "transition-all duration-200 hover:border-gray-600 hover:shadow-lg hover:shadow-black/20 cursor-pointer",
                className
            )}
        >
            {children}
        </div>
    );
}
