import React, { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Clock, Brain, FileText, Settings, Menu, LogOut, Folder, CheckSquare, Plug, Calendar } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import MobileNav from './MobileNav';
import { supabase } from '../lib/supabase';

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

    const navItems = [
        { icon: CheckSquare, label: 'Tarefas', path: '/tasks' },
        { icon: Clock, label: 'Lembretes', path: '/reminders' },
        { icon: Calendar, label: 'Calendário', path: '/calendar' },
        { icon: Folder, label: 'Coleções', path: '/collections' },
        { icon: Brain, label: 'Cérebro', path: '/brain' },
        { icon: FileText, label: 'Documentos', path: '/documents' },
        { icon: Plug, label: 'Integrações', path: '/integrations' },
    ];

    return (
        <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
            {/* Sidebar - Desktop Only */}
            <aside
                className={clsx(
                    "hidden md:flex bg-gray-800 border-r border-gray-700 transition-all duration-300 flex-col",
                    isSidebarOpen ? "w-64" : "w-20"
                )}
            >
                <div className="p-4 flex items-center justify-between border-b border-gray-700">
                    <div className={clsx("font-bold text-xl bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent truncate", !isSidebarOpen && "hidden")}>
                        Assistente IA
                    </div>
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
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
                                    "flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group",
                                    isActive
                                        ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50"
                                        : "text-gray-400 hover:bg-gray-700 hover:text-white"
                                )
                            }
                        >
                            <item.icon size={24} />
                            <span className={clsx("font-medium whitespace-nowrap transition-opacity", !isSidebarOpen && "opacity-0 w-0 overflow-hidden")}>
                                {item.label}
                            </span>
                            {/* Tooltip for collapsed state */}
                            {!isSidebarOpen && (
                                <div className="absolute left-16 bg-gray-900 text-white px-2 py-1 rounded text-sm opacity-0 group-hover:opacity-100 pointer-events-none z-50 whitespace-nowrap border border-gray-700">
                                    {item.label}
                                </div>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-700 space-y-2">
                    <NavLink
                        to="/settings"
                        className={({ isActive }) =>
                            clsx(
                                "flex items-center gap-3 p-3 rounded-xl w-full transition-colors",
                                isActive
                                    ? "bg-gray-700 text-white"
                                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                            )
                        }
                    >
                        <Settings size={24} />
                        <span className={clsx("font-medium whitespace-nowrap", !isSidebarOpen && "hidden")}>Configurações</span>
                    </NavLink>
                    <button
                        onClick={signOut}
                        className="flex items-center gap-3 p-3 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-xl w-full transition-colors"
                    >
                        <LogOut size={24} />
                        <span className={clsx("font-medium whitespace-nowrap", !isSidebarOpen && "hidden")}>Sair</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto relative flex flex-col pb-24 md:pb-0">
                {/* Mobile Header */}
                <div className="md:hidden p-4 border-b border-gray-800 bg-gray-900/95 backdrop-blur flex items-center justify-between sticky top-0 z-20">
                    <div className="font-bold text-xl bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        Assistente IA
                    </div>
                    <button
                        onClick={signOut}
                        className="p-2 text-gray-400 hover:text-white"
                    >
                        <LogOut size={20} />
                    </button>
                </div>

                <Outlet />
            </main>

            {/* Mobile Navigation */}
            <MobileNav />
        </div>
    );
}
