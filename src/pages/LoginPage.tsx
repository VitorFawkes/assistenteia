import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { ElaLogo } from '../components/ElaLogo';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error } = await signIn(email, password);

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            navigate('/');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-ela-bg p-4">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-xl p-8 border border-ela-border">
                    <div className="text-center mb-8 flex flex-col items-center">
                        <div className="mb-6 transform scale-150">
                            <ElaLogo />
                        </div>
                        <p className="text-ela-sub">Entre para continuar</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6">
                            <p className="text-red-600 text-sm">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-ela-sub mb-2 ml-1">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-3 bg-gray-50/50 border border-ela-border rounded-xl text-ela-text placeholder-ela-sub/50 focus:outline-none focus:ring-2 focus:ring-ela-pink focus:border-transparent transition-all"
                                placeholder="seu@email.com"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-ela-sub mb-2 ml-1">
                                Senha
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full px-4 py-3 bg-gray-50/50 border border-ela-border rounded-xl text-ela-text placeholder-ela-sub/50 focus:outline-none focus:ring-2 focus:ring-ela-pink focus:border-transparent transition-all"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-ela-pink text-white rounded-xl font-medium hover:bg-pink-600 transition-all shadow-lg shadow-pink-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Entrando...
                                </>
                            ) : (
                                'Entrar'
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-ela-sub text-sm">
                            Não tem uma conta?{' '}
                            <Link to="/signup" className="text-ela-pink hover:text-pink-600 font-semibold transition-colors">
                                Cadastre-se
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
