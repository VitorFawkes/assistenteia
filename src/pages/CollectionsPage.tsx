import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Folder, FileText, Trash2, Search, Image, Link as LinkIcon, Grid, List, CheckSquare, Square, X, Filter, Plus, Edit2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Card from '../components/ui/Card';
import CardMedia from '../components/ui/CardMedia';
import Button from '../components/ui/Button';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Collection {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    created_at: string;
    item_count?: number; // Added for dashboard
}

interface CollectionItem {
    id: string;
    content: string;
    media_url: string | null;
    metadata: any;
    created_at: string;
}

export default function CollectionsPage() {
    const { user } = useAuth();
    const [collections, setCollections] = useState<Collection[]>([]);
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [items, setItems] = useState<CollectionItem[]>([]);
    const [_isLoadingCollections, setIsLoadingCollections] = useState(true);
    const [isLoadingItems, setIsLoadingItems] = useState(false);

    // Search & Filters
    const [collectionSearch, setCollectionSearch] = useState('');
    const [itemSearch, setItemSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'image' | 'text' | 'link'>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Selection & Deletion
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [initialLoadDone, setInitialLoadDone] = useState(false);
    const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);

    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [collectionForm, setCollectionForm] = useState({ name: '', description: '', icon: '📁' });

    const fetchCollections = useCallback(async () => {
        if (!user) return;

        try {
            // Fetch collections and item counts
            const { data, error } = await supabase
                .from('collections')
                .select('*, collection_items(count)')
                .eq('user_id', user.id)
                .order('name');

            if (error) throw error;

            const collectionsWithCounts = data?.map(c => ({
                ...c,
                item_count: c.collection_items?.[0]?.count || 0
            })) || [];

            setCollections(collectionsWithCounts);

            // Only auto-select on initial load if we want to force a selection (disabled for dashboard view)
            // if (!initialLoadDone && data && data.length > 0) {
            //     setSelectedCollection(data[0]);
            //     setInitialLoadDone(true);
            // }
        } catch (error) {
            console.error('Error fetching collections:', error);
        } finally {
            setIsLoadingCollections(false);
        }
    }, [user]); // Removed initialLoadDone dependency to allow refresh

    const fetchItems = useCallback(async (collectionId: string) => {
        setIsLoadingItems(true);
        try {
            const { data, error } = await supabase
                .from('collection_items')
                .select('*')
                .eq('collection_id', collectionId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setItems(data || []);
            setSelectedItems(new Set()); // Clear selection when changing collection
        } catch (error) {
            console.error('Error fetching items:', error);
        } finally {
            setIsLoadingItems(false);
        }
    }, []);

    useEffect(() => {
        if (user && !initialLoadDone) {
            fetchCollections();
            setInitialLoadDone(true);
        }
    }, [user, fetchCollections, initialLoadDone]);

    useEffect(() => {
        if (selectedCollection) {
            fetchItems(selectedCollection.id);
        } else {
            setItems([]);
        }
    }, [selectedCollection, fetchItems]);

    // Filter Logic
    const filteredCollections = collections.filter(c =>
        c.name.toLowerCase().includes(collectionSearch.toLowerCase())
    );

    const filteredItems = items.filter(item => {
        const matchesSearch = item.content.toLowerCase().includes(itemSearch.toLowerCase()) ||
            JSON.stringify(item.metadata).toLowerCase().includes(itemSearch.toLowerCase());

        if (!matchesSearch) return false;

        if (activeFilter === 'all') return true;
        if (activeFilter === 'image') return item.media_url || item.metadata?.type === 'image';
        if (activeFilter === 'link') return item.metadata?.type === 'link' || item.content.startsWith('http');
        if (activeFilter === 'text') return !item.media_url && item.metadata?.type !== 'link';

        return true;
    });

    // Selection Logic
    const toggleSelection = (id: string) => {
        const newSelection = new Set(selectedItems);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        setSelectedItems(newSelection);
    };

    const toggleSelectAll = () => {
        if (selectedItems.size === filteredItems.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredItems.map(i => i.id)));
        }
    };

    // CRUD Logic
    const handleCreateCollection = async () => {
        if (!user || !collectionForm.name) return;

        try {
            const { data, error } = await supabase
                .from('collections')
                .insert([{
                    user_id: user.id,
                    name: collectionForm.name,
                    description: collectionForm.description,
                    icon: collectionForm.icon
                }])
                .select()
                .single();

            if (error) throw error;

            setCollections([...collections, { ...data, item_count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
            setIsCreateModalOpen(false);
            setCollectionForm({ name: '', description: '', icon: '📁' });
            setSelectedCollection(data); // Auto-select new collection
        } catch (error) {
            console.error('Error creating collection:', error);
            alert('Erro ao criar coleção.');
        }
    };

    const handleEditCollection = async () => {
        if (!selectedCollection || !collectionForm.name) return;

        try {
            const { data, error } = await supabase
                .from('collections')
                .update({
                    name: collectionForm.name,
                    description: collectionForm.description,
                    icon: collectionForm.icon
                })
                .eq('id', selectedCollection.id)
                .select()
                .single();

            if (error) throw error;

            const updatedCollections = collections.map(c =>
                c.id === selectedCollection.id ? { ...c, ...data } : c
            );
            setCollections(updatedCollections);
            setSelectedCollection({ ...selectedCollection, ...data });
            setIsEditModalOpen(false);
        } catch (error) {
            console.error('Error updating collection:', error);
            alert('Erro ao atualizar coleção.');
        }
    };

    const openEditModal = (collection: Collection) => {
        setCollectionForm({
            name: collection.name,
            description: collection.description || '',
            icon: collection.icon || '📁'
        });
        setSelectedCollection(collection); // Ensure it's selected context
        setIsEditModalOpen(true);
    };

    // Deletion Logic
    const handleDeleteCollectionClick = (id: string) => {
        setCollectionToDelete(id);
    };

    const handleDeleteItemClick = (id: string) => {
        setItemToDelete(id);
    };

    const confirmDeleteCollection = async () => {
        if (!collectionToDelete) return;
        const id = collectionToDelete;
        setCollectionToDelete(null);

        try {
            // Delete items first
            await supabase.from('collection_items').delete().eq('collection_id', id);
            // Delete collection
            const { error } = await supabase.from('collections').delete().eq('id', id);

            if (error) throw error;

            const newCollections = collections.filter(c => c.id !== id);
            setCollections(newCollections);
            if (selectedCollection?.id === id) {
                setSelectedCollection(null); // Go back to dashboard
            }
        } catch (error) {
            console.error('Error deleting collection:', error);
            alert('Erro ao excluir coleção.');
        }
    };

    const confirmDeleteItem = async () => {
        if (!itemToDelete) return;
        const id = itemToDelete;
        setItemToDelete(null);

        try {
            const { error } = await supabase.from('collection_items').delete().eq('id', id);
            if (error) throw error;
            setItems(items.filter(i => i.id !== id));

            const newSelection = new Set(selectedItems);
            newSelection.delete(id);
            setSelectedItems(newSelection);

            // Update count locally
            if (selectedCollection) {
                const updatedCollections = collections.map(c =>
                    c.id === selectedCollection.id ? { ...c, item_count: (c.item_count || 0) - 1 } : c
                );
                setCollections(updatedCollections);
            }
        } catch (error) {
            console.error('Error deleting item:', error);
        }
    };

    const deleteSelectedItems = async () => {
        if (selectedItems.size === 0) return;
        if (!confirm(`Tem certeza que deseja excluir ${selectedItems.size} itens?`)) return;

        try {
            const ids = Array.from(selectedItems);
            const { error } = await supabase.from('collection_items').delete().in('id', ids);

            if (error) throw error;

            setItems(items.filter(i => !selectedItems.has(i.id)));
            setSelectedItems(new Set());

            // Update count locally
            if (selectedCollection) {
                const updatedCollections = collections.map(c =>
                    c.id === selectedCollection.id ? { ...c, item_count: (c.item_count || 0) - ids.length } : c
                );
                setCollections(updatedCollections);
            }
        } catch (error) {
            console.error('Error deleting selected items:', error);
            alert('Erro ao excluir itens selecionados.');
        }
    };

    return (
        <div className="flex h-full">
            {/* Sidebar - Collections List */}
            <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
                <div className="p-6 border-b border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Folder className="text-blue-400" size={28} />
                            Coleções
                        </h1>
                        <button
                            onClick={() => {
                                setCollectionForm({ name: '', description: '', icon: '📁' });
                                setIsCreateModalOpen(true);
                            }}
                            className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                            title="Nova Coleção"
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar coleções..."
                            value={collectionSearch}
                            onChange={(e) => setCollectionSearch(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-9 pr-8 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {collectionSearch && (
                            <button
                                onClick={() => setCollectionSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    <div
                        className={`w-full p-3 rounded-xl transition-all flex items-center gap-3 cursor-pointer ${!selectedCollection
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'}`}
                        onClick={() => setSelectedCollection(null)}
                    >
                        <Grid size={20} />
                        <span className="font-medium">Todas as Coleções</span>
                    </div>

                    <div className="h-px bg-gray-700 my-2 mx-2"></div>

                    {filteredCollections.map(collection => (
                        <div
                            key={collection.id}
                            className={`w-full p-3 rounded-xl transition-all flex items-center justify-between group cursor-pointer ${selectedCollection?.id === collection.id
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
                                }`}
                            onClick={() => setSelectedCollection(collection)}
                        >
                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                                <span className="text-xl">{collection.icon || '📁'}</span>
                                <div className="truncate">
                                    <p className="font-medium truncate">{collection.name}</p>
                                    <p className={`text-xs truncate ${selectedCollection?.id === collection.id ? 'text-blue-200' : 'text-gray-500'}`}>
                                        {collection.item_count || 0} itens
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col bg-gray-900">
                {selectedCollection ? (
                    <>
                        {/* Header */}
                        <div className="p-8 border-b border-gray-800">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="text-5xl">{selectedCollection.icon || '📁'}</div>
                                    <div>
                                        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                                            {selectedCollection.name}
                                            <button
                                                onClick={() => openEditModal(selectedCollection)}
                                                className="text-gray-500 hover:text-blue-400 transition-colors"
                                                title="Editar Coleção"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                        </h2>
                                        <p className="text-gray-400 mt-1">{selectedCollection.description || 'Sem descrição'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 bg-gray-800 p-1 rounded-lg border border-gray-700 mr-4">
                                        <button
                                            onClick={() => setViewMode('grid')}
                                            className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                            title="Visualização em Grade"
                                        >
                                            <Grid size={20} />
                                        </button>
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                            title="Visualização em Lista"
                                        >
                                            <List size={20} />
                                        </button>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        onClick={() => handleDeleteCollectionClick(selectedCollection.id)}
                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20"
                                        icon={Trash2}
                                    >
                                        Excluir Coleção
                                    </Button>
                                </div>
                            </div>

                            {/* Controls Bar */}
                            <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                                {/* Search */}
                                <div className="relative w-full md:w-96">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Buscar itens..."
                                        value={itemSearch}
                                        onChange={(e) => setItemSearch(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 text-white pl-10 pr-8 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                    {itemSearch && (
                                        <button
                                            onClick={() => setItemSearch('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>

                                {/* Filters */}
                                <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-hide">
                                    {[
                                        { id: 'all', label: 'Todos', icon: null },
                                        { id: 'image', label: 'Imagens', icon: Image },
                                        { id: 'text', label: 'Texto', icon: FileText },
                                        { id: 'link', label: 'Links', icon: LinkIcon },
                                    ].map(filter => (
                                        <button
                                            key={filter.id}
                                            onClick={() => setActiveFilter(filter.id as any)}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${activeFilter === filter.id
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
                                                }`}
                                        >
                                            {filter.icon && <filter.icon size={14} />}
                                            {filter.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Bulk Actions Bar */}
                            {filteredItems.length > 0 && (
                                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-800">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={toggleSelectAll}
                                            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                                        >
                                            {selectedItems.size === filteredItems.length && filteredItems.length > 0 ? (
                                                <CheckSquare size={18} className="text-blue-500" />
                                            ) : (
                                                <Square size={18} />
                                            )}
                                            {selectedItems.size === filteredItems.length ? 'Desmarcar todos' : 'Selecionar todos'}
                                        </button>
                                        <span className="text-gray-600 text-sm">|</span>
                                        <span className="text-gray-400 text-sm">{filteredItems.length} itens</span>
                                    </div>

                                    {selectedItems.size > 0 && (
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={deleteSelectedItems}
                                            icon={Trash2}
                                        >
                                            Excluir ({selectedItems.size})
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Items List */}
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
                            {isLoadingItems ? (
                                <div className="text-center text-gray-500 py-10">Carregando itens...</div>
                            ) : filteredItems.length > 0 ? (
                                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
                                    {filteredItems.map(item => (
                                        <Card
                                            key={item.id}
                                            className={`group relative transition-all ${selectedItems.has(item.id)
                                                ? 'border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/50'
                                                : 'hover:border-gray-600'
                                                } ${viewMode === 'list' ? 'flex items-center gap-4 p-4' : 'p-5 flex flex-col'}`}
                                        >
                                            {/* Selection Checkbox */}
                                            <div className={`absolute top-3 left-3 z-10 ${!selectedItems.has(item.id) && 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedItems.has(item.id)}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        toggleSelection(item.id);
                                                    }}
                                                    className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900 cursor-pointer shadow-sm"
                                                />
                                            </div>

                                            {/* Delete Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteItemClick(item.id);
                                                }}
                                                className="absolute top-3 right-3 p-2 rounded-lg bg-gray-900/80 text-gray-500 hover:text-red-400 hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition-all z-10 backdrop-blur-sm"
                                            >
                                                <Trash2 size={16} />
                                            </button>

                                            {/* Content */}
                                            <div
                                                className={`flex-1 min-w-0 cursor-pointer ${viewMode === 'grid' ? 'mt-6' : ''}`}
                                                onClick={() => toggleSelection(item.id)}
                                            >
                                                {item.media_url && (
                                                    <CardMedia url={item.media_url} />
                                                )}

                                                <div className="flex items-start gap-3">
                                                    {!item.media_url && (
                                                        <div className="mt-1 shrink-0">
                                                            {item.content.startsWith('http') ? (
                                                                <LinkIcon className="text-purple-400" size={20} />
                                                            ) : (
                                                                <FileText className="text-blue-400" size={20} />
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-white leading-relaxed break-words ${viewMode === 'grid' ? 'line-clamp-4' : 'line-clamp-2'}`}>
                                                            {item.content}
                                                        </p>

                                                        {/* Metadata Display */}
                                                        {item.metadata && Object.keys(item.metadata).length > 0 && (
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                {Object.entries(item.metadata).map(([key, value]) => {
                                                                    if (key === 'type') return null; // Skip type as it's shown below

                                                                    // Format currency
                                                                    if (['amount', 'value', 'price', 'custo', 'valor'].includes(key.toLowerCase())) {
                                                                        const numValue = Number(value);
                                                                        if (!isNaN(numValue)) {
                                                                            return (
                                                                                <span key={key} className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs font-medium border border-green-500/30 flex items-center gap-1">
                                                                                    <span className="opacity-70 text-[10px] uppercase">{key}:</span>
                                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numValue)}
                                                                                </span>
                                                                            );
                                                                        }
                                                                    }

                                                                    // Format dates
                                                                    if (['date', 'data', 'prazo'].includes(key.toLowerCase())) {
                                                                        return (
                                                                            <span key={key} className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs border border-blue-500/30">
                                                                                {key}: {String(value)}
                                                                            </span>
                                                                        );
                                                                    }

                                                                    return (
                                                                        <span key={key} className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs border border-gray-700 max-w-full truncate">
                                                                            <span className="opacity-70 mr-1">{key}:</span>
                                                                            {String(value)}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        <p className="text-gray-500 text-xs mt-2 flex items-center gap-2">
                                                            <span>{format(new Date(item.created_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}</span>
                                                            {item.metadata?.type && (
                                                                <span className="bg-gray-800 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">
                                                                    {item.metadata.type}
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-20">
                                    <div className="bg-gray-800/50 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                                        <Filter className="text-gray-600" size={32} />
                                    </div>
                                    <p className="text-gray-400 font-medium">Nenhum item encontrado</p>
                                    <p className="text-gray-600 text-sm mt-1">Tente mudar os filtros ou a busca</p>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    // Collections Dashboard (All Collections View)
                    <div className="flex-1 flex flex-col bg-gray-900 p-8 overflow-y-auto">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-3xl font-bold text-white">Minhas Coleções</h2>
                                <p className="text-gray-400 mt-2">Gerencie todas as suas pastas e arquivos</p>
                            </div>
                            <Button
                                onClick={() => {
                                    setCollectionForm({ name: '', description: '', icon: '📁' });
                                    setIsCreateModalOpen(true);
                                }}
                                icon={Plus}
                            >
                                Nova Coleção
                            </Button>
                        </div>

                        {filteredCollections.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredCollections.map(collection => (
                                    <Card
                                        key={collection.id}
                                        className="p-6 hover:border-blue-500/50 hover:bg-gray-800/50 transition-all cursor-pointer group relative"
                                        onClick={() => setSelectedCollection(collection)}
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="text-4xl p-3 bg-gray-800 rounded-2xl border border-gray-700 group-hover:border-blue-500/30 transition-colors">
                                                {collection.icon || '📁'}
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openEditModal(collection);
                                                    }}
                                                    className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-blue-400 hover:bg-gray-700"
                                                    title="Editar"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteCollectionClick(collection.id);
                                                    }}
                                                    className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-red-400 hover:bg-gray-700"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        <h3 className="text-xl font-bold text-white mb-2">{collection.name}</h3>
                                        <p className="text-gray-400 text-sm line-clamp-2 mb-4 h-10">
                                            {collection.description || 'Sem descrição'}
                                        </p>

                                        <div className="flex items-center justify-between pt-4 border-t border-gray-800 text-sm text-gray-500">
                                            <span>{collection.item_count || 0} itens</span>
                                            <span>{format(new Date(collection.created_at), "d MMM, yyyy", { locale: ptBR })}</span>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                                <div className="bg-gray-800 rounded-full p-6 mb-4">
                                    <Folder size={48} className="text-gray-600" />
                                </div>
                                <p className="text-xl font-medium text-white mb-2">Nenhuma coleção encontrada</p>
                                <p className="mb-6">Crie sua primeira coleção para começar a organizar.</p>
                                <Button
                                    onClick={() => {
                                        setCollectionForm({ name: '', description: '', icon: '📁' });
                                        setIsCreateModalOpen(true);
                                    }}
                                    icon={Plus}
                                >
                                    Criar Coleção
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Create/Edit Collection Modal */}
            {(isCreateModalOpen || isEditModalOpen) && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }}>
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-white mb-6">
                            {isEditModalOpen ? 'Editar Coleção' : 'Nova Coleção'}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Nome</label>
                                <input
                                    type="text"
                                    value={collectionForm.name}
                                    onChange={(e) => setCollectionForm({ ...collectionForm, name: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Ex: Viagem para Paris"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Descrição (Opcional)</label>
                                <textarea
                                    value={collectionForm.description}
                                    onChange={(e) => setCollectionForm({ ...collectionForm, description: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                                    placeholder="Detalhes sobre esta coleção..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Ícone</label>
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    {['📁', '✈️', '💼', '🏠', '🎓', '💡', '📅', '🛒', '🎵', '📷', '🍔', '💪'].map(icon => (
                                        <button
                                            key={icon}
                                            onClick={() => setCollectionForm({ ...collectionForm, icon })}
                                            className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors ${collectionForm.icon === icon
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-900 text-gray-400 hover:bg-gray-700'
                                                }`}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end mt-8">
                            <Button
                                variant="secondary"
                                onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={isEditModalOpen ? handleEditCollection : handleCreateCollection}
                                disabled={!collectionForm.name}
                            >
                                {isEditModalOpen ? 'Salvar Alterações' : 'Criar Coleção'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modals */}
            {collectionToDelete && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setCollectionToDelete(null)}>
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-white mb-3">Excluir Coleção?</h3>
                        <p className="text-gray-300 mb-6">
                            Isso apagará a coleção e <strong>TODOS os itens</strong> nela permanentemente.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <Button variant="secondary" onClick={() => setCollectionToDelete(null)}>
                                Cancelar
                            </Button>
                            <Button variant="danger" onClick={confirmDeleteCollection}>
                                Excluir Tudo
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {itemToDelete && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setItemToDelete(null)}>
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-white mb-3">Excluir Item?</h3>
                        <p className="text-gray-300 mb-6">
                            Tem certeza que deseja excluir este item?
                        </p>
                        <div className="flex gap-3 justify-end">
                            <Button variant="secondary" onClick={() => setItemToDelete(null)}>
                                Cancelar
                            </Button>
                            <Button variant="danger" onClick={confirmDeleteItem}>
                                Excluir
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
