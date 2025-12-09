import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Plus, Search, Trash2, Edit2, X, Filter, Folder, Grid, FileText, CheckSquare, List, Lock, CheckCircle, DollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Card from '../components/ui/Card';
import CardMedia from '../components/ui/CardMedia';
import Button from '../components/ui/Button';
import EditItemModal from '../components/collections/EditItemModal';

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
    const [activeFilter] = useState<'all' | 'image' | 'text' | 'link'>('all'); // Deprecated but kept for compatibility if needed
    const [activeFilter] = useState<'all' | 'image' | 'text' | 'link'>('all'); // Deprecated but kept for compatibility if needed

    // New Filters
    const [dateFilter, setDateFilter] = useState<'all' | 'this_month' | 'last_month' | 'future'>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'note' | 'task' | 'credential'>('all');
    const [sortOrder, setSortOrder] = useState<'date_desc' | 'date_asc' | 'amount_desc'>('date_desc');

    // Selection & Deletion
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [initialLoadDone, setInitialLoadDone] = useState(false);
    const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);

    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [collectionForm, setCollectionForm] = useState({ name: '', description: '', icon: '📁' });

    // Item Editing
    const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
    const [itemToEdit, setItemToEdit] = useState<CollectionItem | null>(null);

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
        } catch (error) {
            console.error('Error fetching collections:', error);
        } finally {
            setIsLoadingCollections(false);
        }
    }, [user]);

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

        // Type Filter
        if (typeFilter !== 'all') {
            const itemType = item.metadata?.type || (item.metadata?.amount ? 'expense' : 'note');
            if (itemType !== typeFilter) return false;
        }

        // Date Filter
        if (dateFilter !== 'all') {
            const itemDateStr = item.metadata?.date || item.created_at;
            const itemDate = new Date(itemDateStr);
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

            if (dateFilter === 'this_month') {
                if (itemDate < startOfMonth) return false;
            } else if (dateFilter === 'last_month') {
                if (itemDate < startOfLastMonth || itemDate > endOfLastMonth) return false;
            } else if (dateFilter === 'future') {
                if (itemDate <= now) return false;
            }
        }

        return true;
    }).sort((a, b) => {
        const dateA = new Date(a.metadata?.date || a.created_at).getTime();
        const dateB = new Date(b.metadata?.date || b.created_at).getTime();
        const amountA = Number(a.metadata?.amount || 0);
        const amountB = Number(b.metadata?.amount || 0);

        if (sortOrder === 'date_asc') return dateA - dateB;
        if (sortOrder === 'amount_desc') return amountB - amountA;
        return dateB - dateA; // Default: date_desc
    });

    // Grouping Logic
    const groupedItems = filteredItems.reduce((acc, item) => {
        // Priority: Section -> Subcategory -> Geral
        const section = item.metadata?.section || item.metadata?.subcategory || 'Geral';
        if (!acc[section]) acc[section] = [];
        acc[section].push(item);
        return acc;
    }, {} as Record<string, typeof filteredItems>);

    const sortedCategories = Object.keys(groupedItems).sort((a, b) => {
        // Smart Sorting:
        // 1. "Geral" always last
        // 2. "Financeiro" (if used as section) near top? No, let's stick to alphabetical for sections unless specific.
        // Actually, let's try to detect "Semana X" and sort numerically if possible, otherwise alphabetical.

        if (a === 'Geral') return 1;
        if (b === 'Geral') return -1;

        // Try to sort "Semana 1", "Semana 2" correctly
        const weekA = a.match(/Semana (\d+)/i);
        const weekB = b.match(/Semana (\d+)/i);
        if (weekA && weekB) {
            return parseInt(weekA[1]) - parseInt(weekB[1]);
        }

        return a.localeCompare(b);
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

    const handleEditItemClick = (item: CollectionItem) => {
        setItemToEdit(item);
        setIsEditItemModalOpen(true);
    };

    const handleSaveItem = async (id: string, updates: any) => {
        try {
            const { data, error } = await supabase
                .from('collection_items')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            setItems(items.map(i => i.id === id ? { ...i, ...data } : i));
        } catch (error) {
            console.error('Error updating item:', error);
            alert('Erro ao atualizar item.');
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
                        {/* Header with Financial Widget */}
                        <div className="p-8 border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-10">
                            <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                                <div className="flex-1">
                                    <div className="flex items-center gap-4 mb-2">
                                        <div className="text-5xl filter drop-shadow-lg">{selectedCollection.icon || '📁'}</div>
                                        <div>
                                            <h2 className="text-4xl font-bold text-white tracking-tight flex items-center gap-3">
                                                {selectedCollection.name}
                                                <button
                                                    onClick={() => openEditModal(selectedCollection)}
                                                    className="text-gray-600 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <Edit2 size={20} />
                                                </button>
                                            </h2>
                                            <p className="text-gray-400 text-lg mt-1 font-light">{selectedCollection.description || 'Sem descrição'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Financial Summary Widget */}
                                {items.some(i => i.metadata?.amount || i.metadata?.value) && (
                                    <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-5 rounded-2xl border border-gray-700 shadow-xl min-w-[280px]">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">Investimento Total</span>
                                            <div className="bg-green-500/10 p-1.5 rounded-lg">
                                                <span className="text-green-400 text-xs font-bold">BRL</span>
                                            </div>
                                        </div>
                                        <div className="text-3xl font-bold text-white mb-1">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                items.reduce((acc, item) => {
                                                    const val = item.metadata?.amount || item.metadata?.value;
                                                    return acc + (Number(val) || 0);
                                                }, 0)
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                            <CheckSquare size={12} />
                                            {items.filter(i => i.metadata?.amount || i.metadata?.value).length} itens com valor
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Controls Bar */}
                            <div className="flex flex-col md:flex-row gap-4 justify-between items-center mt-8">
                                <div className="relative w-full md:w-96 group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={20} />
                                    <input
                                        type="text"
                                        placeholder="Buscar em todas as notas..."
                                        value={itemSearch}
                                        onChange={(e) => setItemSearch(e.target.value)}
                                        className="w-full bg-gray-800/50 border border-gray-700 text-white pl-12 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder-gray-600"
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <div className="bg-gray-800/50 p-1 rounded-xl border border-gray-700 flex">
                                        <button
                                            onClick={() => setViewMode('grid')}
                                            className={`p-2.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            <Grid size={20} />
                                        </button>
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`p-2.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            <List size={20} />
                                        </button>
                                    </div>
                                    <Button
                                        variant="danger"
                                        onClick={() => handleDeleteCollectionClick(selectedCollection.id)}
                                        className="h-full px-4 bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                                        icon={Trash2}
                                    >
                                        Excluir
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Items List - Masonry Layout with Subcategories */}
                        <div className="flex-1 overflow-y-auto p-8 bg-gray-950">
                            {isLoadingItems ? (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-4">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                    <p>Carregando suas memórias...</p>
                                </div>
                            ) : filteredItems.length > 0 ? (
                                <div className="space-y-12">
                                    {sortedCategories.map(category => (
                                        <div key={category} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <div className="flex items-center gap-3 mb-6 pb-2 border-b border-gray-800/50">
                                                <h3 className="text-xl font-bold text-white tracking-tight">{category}</h3>
                                                <span className="text-xs font-medium text-gray-400 bg-gray-900 px-2.5 py-1 rounded-full border border-gray-800">
                                                    {groupedItems[category].length}
                                                </span>
                                                {/* Section Total */}
                                                {groupedItems[category].some(i => i.metadata?.amount || i.metadata?.value) && (
                                                    <div className="ml-auto flex items-center gap-2 bg-green-500/10 px-3 py-1 rounded-lg border border-green-500/20">
                                                        <span className="text-xs text-green-400 font-medium uppercase">Total</span>
                                                        <span className="text-sm font-bold text-green-400">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                                groupedItems[category].reduce((acc, item) => {
                                                {sectionItems.some(i => i.metadata?.amount) && (
                                                    <span className="ml-auto text-sm font-mono text-green-500/80">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                            sectionItems.reduce((acc, i) => acc + (Number(i.metadata?.amount) || 0), 0)
                                                        )}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="bg-gray-800/40 rounded-lg border border-gray-800 overflow-hidden">
                                                {sectionItems.map((item) => {
                                                    const hasAmount = item.metadata?.amount || item.metadata?.value;
                                                    const amount = Number(item.metadata?.amount || item.metadata?.value || 0);
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className="flex items-center gap-4 p-4 border-b border-gray-800 last:border-b-0 hover:bg-gray-700/30 transition-colors cursor-pointer group"
                                                            onClick={() => {
                                                                setItemToEdit(item);
                                                                setIsEditItemModalOpen(true);
                                                            }}
                                                        >
                                                            {/* Icon */}
                                                            {item.metadata?.type === 'expense' || hasAmount ? (
                                                                <div className="bg-green-500/10 text-green-400 p-2 rounded-lg">
                                                                    <DollarSign size={16} />
                                                                </div>
                                                            ) : item.metadata?.type === 'credential' ? (
                                                                <div className="bg-purple-500/10 text-purple-400 p-2 rounded-lg">
                                                                    <Lock size={16} />
                                                                </div>
                                                            ) : item.metadata?.type === 'task' ? (
                                                                <div className="bg-orange-500/10 text-orange-400 p-2 rounded-lg">
                                                                    <CheckCircle size={16} />
                                                                </div>
                                                            ) : (
                                                                <div className="bg-blue-500/10 text-blue-400 p-2 rounded-lg">
                                                                    <FileText size={16} />
                                                                </div>
                                                            )}

                                                            <div className="flex-1">
                                                                <p className="text-gray-200 text-sm line-clamp-1 font-light">
                                                                    {item.content}
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-xs text-gray-500">{format(new Date(item.metadata?.date || item.created_at), "d MMM", { locale: ptBR })}</span>
                                                                    {item.metadata?.category && (
                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                                                                            {item.metadata.category}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {hasAmount && (
                                                                <div className="text-green-400 font-bold text-sm">
                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)}
                                                                </div>
                                                            )}
                                                            
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteItemClick(item.id);
                                                                }}
                                                                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
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
                {
                    (isCreateModalOpen || isEditModalOpen) && (
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
                    )
                }

                {/* Delete Confirmation Modals */}
                {
                    collectionToDelete && (
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
                    )
                }

                {
                    itemToDelete && (
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
                    )
                }

                {/* Edit Item Modal */}
                <EditItemModal
                    isOpen={isEditItemModalOpen}
                    onClose={() => setIsEditItemModalOpen(false)}
                    onSave={handleSaveItem}
                    item={itemToEdit}
                />
            </div>
            );
}
