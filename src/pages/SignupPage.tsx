import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight } from 'lucide-react';
import Button from '../components/ui/Button';
import { ElaLogo } from '../components/ElaLogo';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { signUp } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error } = await signUp(email, password, fullName);

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            // Redirect to app (user will be auto-logged in)
            navigate('/');
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-ela-bg p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-center mb-6">
                        <ElaLogo className="scale-150" />
                    </div>
                    <h1 className="text-3xl font-bold text-ela-text mb-2">Criar Conta</h1>
                    <p className="text-ela-sub">Comece a usar seu assistente pessoal</p>
                </div>

                <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 p-8 border border-ela-border animate-in fade-in zoom-in duration-500 delay-100">
                    {error && (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6 flex items-start gap-3">
                            <div className="w-1 h-full bg-red-500 rounded-full"></div>
                            <p className="text-red-600 text-sm font-medium">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="fullName" className="block text-sm font-medium text-ela-text mb-1.5">
                                Nome Completo
                            </label>
                            <input
                                id="fullName"
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                                className="w-full px-4 py-3 bg-gray-50 border border-ela-border rounded-xl text-ela-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-ela-pink focus:bg-white transition-all"
                                placeholder="Seu nome"
                            />
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-ela-text mb-1.5">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-3 bg-gray-50 border border-ela-border rounded-xl text-ela-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-ela-pink focus:bg-white transition-all"
                                placeholder="seu@email.com"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-ela-text mb-1.5">
                                Senha
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full px-4 py-3 bg-gray-50 border border-ela-border rounded-xl text-ela-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-ela-pink focus:bg-white transition-all"
                                placeholder="••••••••"
                            />
                            <p className="text-gray-400 text-xs mt-1.5 ml-1">Mínimo 6 caracteres</p>
                        </div>

                        <Button
                            type="submit"
                            isLoading={loading}
                            className="w-full py-3 text-lg bg-ela-pink hover:bg-pink-600 shadow-lg shadow-pink-900/20 text-white mt-2"
                            icon={ArrowRight}
                        >
                            Criar Conta
                        </Button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                        <p className="text-ela-sub text-sm">
                            Já tem uma conta?{' '}
                            <Link to="/login" className="text-ela-pink hover:text-pink-700 font-semibold transition-colors">
                                Entrar
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
