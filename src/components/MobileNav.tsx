import { NavLink } from 'react-router-dom';
import { Clock, Brain, Folder, CheckSquare, Settings, Calendar, Shield } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function MobileNav() {
    const { user } = useAuth();
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        if (user) {
            // Fallback for immediate access
            if (user.email === 'vitorgambetti@gmail.com') {
                setIsAdmin(true);
            }

            supabase.from('user_settings').select('is_admin').eq('user_id', user.id).single()
                .then(({ data }) => {
                    if ((data as any)?.is_admin) setIsAdmin(true);
                });
        }
    }, [user]);

    const navItems = [
        { icon: Clock, label: 'Lembretes', path: '/' },
        { icon: CheckSquare, label: 'Tarefas', path: '/tasks' },
        { icon: Calendar, label: 'Agenda', path: '/calendar' },
        { icon: Folder, label: 'Coleções', path: '/collections' },
        { icon: Brain, label: 'Cérebro', path: '/brain' },
        { icon: Settings, label: 'Config', path: '/settings' },
    ];

    if (isAdmin) {
        navItems.push({ icon: Shield, label: 'Admin', path: '/admin' });
    }

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800/95 backdrop-blur-lg border-t border-gray-700 z-50 safe-area-bottom">
            <div className="flex justify-around items-center py-2 px-1 overflow-x-auto">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            clsx(
                                "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[64px]",
                                isActive
                                    ? "text-blue-400"
                                    : "text-gray-400 hover:text-gray-200"
                            )
                        }
                    >
                        <item.icon size={24} />
                        <span className="text-[10px] font-medium">{item.label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}
