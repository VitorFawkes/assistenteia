import React, { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Clock, Brain, FileText, Settings, Menu, LogOut, Folder, CheckSquare, Plug, Calendar, Shield } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import MobileNav from './MobileNav';
import { supabase } from '../lib/supabase';
import { ElaLogo } from './ElaLogo';
import { Toaster } from 'sonner';

export default function Layout() {
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
    const { user, signOut } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user) {
            checkOnboarding();
        }
    }, [user]);

    const checkOnboarding = async () => {
        const { data } = await supabase
            .from('user_settings')
            .select('onboarding_completed')
            .eq('user_id', user!.id)
            .single();

        // Cast to any to avoid TS error until types are updated
        if ((data as any)?.onboarding_completed === false) {
            navigate('/onboarding');
        }
    };

    const [isAdmin, setIsAdmin] = React.useState(false);

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
        { icon: CheckSquare, label: 'Tarefas', path: '/tasks' },
        { icon: Clock, label: 'Lembretes', path: '/reminders' },
        { icon: Calendar, label: 'Calendário', path: '/calendar' },
        { icon: Folder, label: 'Coleções', path: '/collections' },
        { icon: Brain, label: 'Cérebro', path: '/brain' },
        { icon: FileText, label: 'Documentos', path: '/documents' },
        { icon: Plug, label: 'Integrações', path: '/integrations' },
        ...(isAdmin ? [{ icon: Shield, label: 'Admin', path: '/admin' }] : []),
    ];

    return (
        <div className="flex h-screen bg-ela-bg text-ela-text overflow-hidden">
            {/* Sidebar - Desktop Only */}
            <aside
                className={clsx(
                    "hidden md:flex bg-white border-r border-ela-border transition-all duration-300 flex-col shadow-sm z-10",
                    isSidebarOpen ? "w-64" : "w-20"
                )}
            >
                <div className="p-4 flex items-center justify-between border-b border-ela-border">
                    <div className={clsx("truncate", !isSidebarOpen && "hidden")}>
                        <ElaLogo />
                    </div>
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="p-2 hover:bg-gray-50 text-ela-sub rounded-lg transition-colors"
                    >
                        <Menu size={20} />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                clsx(
                                    "flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group relative",
                                    isActive
                                        ? "bg-ela-pink-light text-ela-pink font-semibold shadow-sm"
                                        : "text-ela-sub hover:bg-gray-50 hover:text-ela-pink"
                                )
                            }
                        >
                            <item.icon size={24} />
                            <span className={clsx("font-medium whitespace-nowrap transition-opacity", !isSidebarOpen && "opacity-0 w-0 overflow-hidden")}>
                                {item.label}
                            </span>
                            {/* Tooltip for collapsed state */}
                            {!isSidebarOpen && (
                                <div className="absolute left-16 bg-white text-ela-text px-3 py-1.5 rounded-lg text-sm opacity-0 group-hover:opacity-100 pointer-events-none z-50 whitespace-nowrap border border-ela-border shadow-lg">
                                    {item.label}
                                </div>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-ela-border space-y-2">
                    <NavLink
                        to="/settings"
                        className={({ isActive }) =>
                            clsx(
                                "flex items-center gap-3 p-3 rounded-xl w-full transition-colors",
                                isActive
                                    ? "bg-ela-pink-light text-ela-pink font-semibold shadow-sm"
                                    : "text-ela-sub hover:text-ela-pink hover:bg-gray-50"
                            )
                        }
                    >
                        <Settings size={24} />
                        <span className={clsx("font-medium whitespace-nowrap", !isSidebarOpen && "hidden")}>Configurações</span>
                    </NavLink>
                    <button
                        onClick={signOut}
                        className="flex items-center gap-3 p-3 text-ela-sub hover:text-red-500 hover:bg-red-50 rounded-xl w-full transition-colors"
                    >
                        <LogOut size={24} />
                        <span className={clsx("font-medium whitespace-nowrap", !isSidebarOpen && "hidden")}>Sair</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto relative flex flex-col pb-24 md:pb-0">
                {/* Mobile Header */}
                <div className="md:hidden p-4 border-b border-ela-border bg-white/90 backdrop-blur flex items-center justify-between sticky top-0 z-20">
                    <ElaLogo />
                    <button
                        onClick={signOut}
                        className="p-2 text-ela-sub hover:text-red-500"
                    >
                        <LogOut size={20} />
                    </button>
                </div>

                <Outlet />
            </main>

            {/* Mobile Navigation */}
            <MobileNav />
            <Toaster position="top-right" richColors />
        </div>
    );
}
