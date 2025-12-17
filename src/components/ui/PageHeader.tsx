import React from 'react';
import { clsx } from 'clsx';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: React.ElementType;
    iconColor?: string; // e.g. "text-blue-400"
    action?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, icon: Icon, iconColor = "text-gray-400", action }: PageHeaderProps) {
    return (
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
                {Icon && (
                    <div className={clsx("p-3 rounded-xl bg-gray-50 border border-gray-100", iconColor)}>
                        <Icon size={32} />
                    </div>
                )}
                <div>
                    <h1 className="text-3xl font-bold text-ela-text tracking-tight">{title}</h1>
                    {subtitle && <p className="text-ela-sub mt-1">{subtitle}</p>}
                </div>
            </div>
            {action && (
                <div>
                    {action}
                </div>
            )}
        </div>
    );
}
