
import { NavLink } from 'react-router-dom';
import { MessageSquare, Clock, Brain, Folder, CheckSquare } from 'lucide-react';
import { clsx } from 'clsx';

export default function MobileNav() {
    const navItems = [
        { icon: MessageSquare, label: 'Chat', path: '/' },
        { icon: CheckSquare, label: 'Tarefas', path: '/tasks' },
        { icon: Clock, label: 'Lembretes', path: '/reminders' },
        { icon: Folder, label: 'Coleções', path: '/collections' },
        { icon: Brain, label: 'Cérebro', path: '/brain' },
    ];

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800/95 backdrop-blur-lg border-t border-gray-700 z-50 safe-area-bottom">
            <div className="flex justify-around items-center py-2 px-1">
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
