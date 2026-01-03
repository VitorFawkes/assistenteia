
import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { FileText, Image as ImageIcon, File, Upload, Trash2, Download, Loader2, FolderOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/EmptyState';
import AlertDialog from '../components/ui/AlertDialog';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Document {
    id: string;
    filename: string;
    file_path: string;
    file_type: string | null;
    size_bytes: number | null;
    created_at: string;
}

export default function DocumentsPage() {
    const { user } = useAuth();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user) {
            fetchDocuments();
        }
    }, [user]);

    const fetchDocuments = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('documents')
                .select('*')
                .eq('user_id', user?.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setDocuments(data || []);
        } catch (error) {
            console.error('Error fetching documents:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user) return;

        setIsUploading(true);
        try {
            // 1. Upload to Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Insert into Database
            const { error: dbError } = await supabase
                .from('documents')
                .insert({
                    user_id: user.id,
                    filename: file.name,
                    file_path: filePath,
                    file_type: file.type,
                    size_bytes: file.size
                });

            if (dbError) throw dbError;

            fetchDocuments();
        } catch (error: any) {
            console.error('Error uploading file:', error);
            alert('Erro ao fazer upload: ' + (error.message || 'Erro desconhecido'));
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDeleteClick = (doc: Document) => {
        setDocumentToDelete(doc);
    };

    const confirmDeleteDocument = async () => {
        if (!documentToDelete) return;
        const doc = documentToDelete;
        setDocumentToDelete(null);

        try {
            // 1. Delete from Storage
            const { error: storageError } = await supabase.storage
                .from('documents')
                .remove([doc.file_path]);

            if (storageError) console.error('Error deleting from storage:', storageError);

            // 2. Delete from Database
            const { error: dbError } = await supabase
                .from('documents')
                .delete()
                .eq('id', doc.id);

            if (dbError) throw dbError;

            setDocuments(documents.filter(d => d.id !== doc.id));
        } catch (error) {
            console.error('Error deleting document:', error);
            alert('Erro ao excluir documento.');
        }
    };

    const handleDownload = async (doc: Document) => {
        try {
            const { data, error } = await supabase.storage
                .from('documents')
                .createSignedUrl(doc.file_path, 60); // 60 seconds valid URL

            if (error) throw error;
            if (data?.signedUrl) {
                window.open(data.signedUrl, '_blank');
            }
        } catch (error) {
            console.error('Error downloading document:', error);
            alert('Erro ao baixar documento.');
        }
    };

    const getFileIcon = (type: string | null) => {
        if (!type) return <File size={24} className="text-gray-400" />;
        if (type.startsWith('image/')) return <ImageIcon size={24} className="text-purple-400" />;
        if (type.includes('pdf')) return <FileText size={24} className="text-red-400" />;
        return <File size={24} className="text-blue-400" />;
    };

    const formatSize = (bytes: number | null) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [sortOption, setSortOption] = useState<'date_desc' | 'date_asc' | 'name_asc' | 'size_desc'>('date_desc');

    const sortedDocuments = [...documents].sort((a, b) => {
        if (sortOption === 'date_desc') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sortOption === 'date_asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (sortOption === 'name_asc') return a.filename.localeCompare(b.filename);
        if (sortOption === 'size_desc') return (b.size_bytes || 0) - (a.size_bytes || 0);
        return 0;
    });

    // ... (fetchDocuments, handleFileUpload, etc. remain the same)

    return (
        <div className="flex flex-col h-full bg-ela-bg p-6 overflow-auto">
            <div className="max-w-5xl mx-auto w-full">
                <PageHeader
                    title="Documentos"
                    subtitle="Gerencie seus arquivos e documentos importantes"
                    icon={FolderOpen}
                    iconColor="text-ela-pink"
                    action={
                        <div className="flex items-center gap-3">
                            <select
                                value={sortOption}
                                onChange={(e) => setSortOption(e.target.value as any)}
                                className="bg-white border border-ela-border rounded-xl px-3 py-2 text-sm text-ela-text focus:outline-none focus:ring-2 focus:ring-ela-pink transition-all appearance-none cursor-pointer shadow-sm"
                            >
                                <option value="date_desc">📅 Recentes</option>
                                <option value="date_asc">📅 Antigos</option>
                                <option value="name_asc">🔤 Nome (A-Z)</option>
                                <option value="size_desc">💾 Tamanho</option>
                            </select>

                            <div className="bg-white p-1 rounded-xl border border-ela-border flex shadow-sm">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-ela-pink text-white shadow-sm' : 'text-ela-sub hover:text-ela-text hover:bg-gray-100'}`}
                                >
                                    <div className="grid grid-cols-2 gap-0.5 w-4 h-4">
                                        <div className="bg-current rounded-[1px]"></div>
                                        <div className="bg-current rounded-[1px]"></div>
                                        <div className="bg-current rounded-[1px]"></div>
                                        <div className="bg-current rounded-[1px]"></div>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-ela-pink text-white shadow-sm' : 'text-ela-sub hover:text-ela-text hover:bg-gray-100'}`}
                                >
                                    <div className="flex flex-col gap-0.5 w-4 h-4 justify-center">
                                        <div className="bg-current h-[2px] w-full rounded-full"></div>
                                        <div className="bg-current h-[2px] w-full rounded-full"></div>
                                        <div className="bg-current h-[2px] w-full rounded-full"></div>
                                    </div>
                                </button>
                            </div>

                            <div className="h-6 w-px bg-gray-200"></div>

                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <Button
                                onClick={() => fileInputRef.current?.click()}
                                isLoading={isUploading}
                                icon={Upload}
                                className="bg-ela-pink hover:bg-pink-600 shadow-lg shadow-pink-900/20 text-white"
                            >
                                Upload
                            </Button>
                        </div>
                    }
                />

                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 size={40} className="animate-spin text-ela-pink" />
                    </div>
                ) : documents.length > 0 ? (
                    viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sortedDocuments.map(doc => (
                                <Card key={doc.id} className="p-4 flex flex-col gap-3 group relative overflow-hidden bg-white border border-ela-border" hover>
                                    <div className="flex items-start justify-between">
                                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                            {getFileIcon(doc.file_type)}
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                            <button
                                                onClick={() => handleDownload(doc)}
                                                className="p-2 text-gray-400 hover:text-ela-pink hover:bg-gray-100 rounded-lg transition-colors"
                                                title="Baixar"
                                            >
                                                <Download size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(doc)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-lg transition-colors"
                                                title="Excluir"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-ela-text truncate text-lg" title={doc.filename}>
                                            {doc.filename}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1 text-xs text-ela-sub">
                                            <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-500 border border-gray-200">{formatSize(doc.size_bytes)}</span>
                                            <span>•</span>
                                            <span>{format(new Date(doc.created_at), "d MMM, HH:mm", { locale: ptBR })}</span>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white border border-ela-border rounded-2xl overflow-hidden shadow-sm">
                            <table className="w-full text-left text-sm text-ela-sub">
                                <thead className="bg-gray-50 text-ela-sub uppercase text-xs font-medium border-b border-ela-border">
                                    <tr>
                                        <th className="px-6 py-4">Nome</th>
                                        <th className="px-6 py-4">Tamanho</th>
                                        <th className="px-6 py-4">Data</th>
                                        <th className="px-6 py-4 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {sortedDocuments.map(doc => (
                                        <tr key={doc.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-6 py-4 font-medium text-ela-text flex items-center gap-3">
                                                {getFileIcon(doc.file_type)}
                                                {doc.filename}
                                            </td>
                                            <td className="px-6 py-4">{formatSize(doc.size_bytes)}</td>
                                            <td className="px-6 py-4">{format(new Date(doc.created_at), "d MMM, HH:mm", { locale: ptBR })}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleDownload(doc)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-ela-pink"><Download size={16} /></button>
                                                    <button onClick={() => handleDeleteClick(doc)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : (
                    <EmptyState
                        icon={Upload}
                        title="Seus documentos, organizados"
                        description="Faça upload de contratos, recibos ou anotações. A IA poderá ler e usar essas informações para te ajudar."
                        exampleCommand="Resuma este contrato em 3 pontos principais"
                        actionLabel="Fazer Upload Agora"
                        onAction={() => fileInputRef.current?.click()}
                    />
                )}
            </div>

            <AlertDialog
                isOpen={!!documentToDelete}
                onClose={() => setDocumentToDelete(null)}
                onConfirm={confirmDeleteDocument}
                title="Excluir Documento?"
                description={documentToDelete ? `Tem certeza que deseja excluir "${documentToDelete.filename}"?` : ''}
                confirmText="Excluir"
                variant="danger"
            />
        </div >
    );
}
