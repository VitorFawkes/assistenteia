import type { ReactNode } from 'react';

interface CardProps {
    children: ReactNode;
    className?: string;
    hover?: boolean;
    onClick?: () => void;
}

export default function Card({ children, className, hover, onClick }: CardProps) {
    return (
        <div onClick={onClick} className={`bg-ela-card rounded-2xl border border-ela-border shadow-sm ${hover ? 'hover:shadow-md hover:border-ela-pink/30 transition-all duration-300' : ''} ${className}`}>
            {children}
        </div>
    );
}
