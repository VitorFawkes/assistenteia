import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { Trash2, Plus, Search, Filter, Calendar, X, CheckSquare, CheckSquare as CheckSquareIcon, Square, Check, ChevronDown, Edit2, Folder, ArrowUpDown, Grid, ArrowLeft, DollarSign, Lock, CheckCircle, FileText, Copy, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EditItemModal from '../components/collections/EditItemModal';
import SwipeableItem from '../components/ui/SwipeableItem';
import AlertDialog from '../components/ui/AlertDialog';

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
    const location = useLocation();
    const [collections, setCollections] = useState<Collection[]>([]);
    const [items, setItems] = useState<CollectionItem[]>([]);
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);

    const [isLoadingItems, setIsLoadingItems] = useState(false);
    // Search & Filters
    const [collectionSearch, setCollectionSearch] = useState('');
    const [itemSearch, setItemSearch] = useState('');

    // Collection Filters
    const [collectionSort, setCollectionSort] = useState<'name' | 'count' | 'date'>('name');
    const [collectionTypeFilter] = useState<'all' | 'financial' | 'notes'>('all');

    // Item Filters
    const [itemSort, setItemSort] = useState<'date_desc' | 'date_asc' | 'amount_desc'>('date_desc');
    const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'expense' | 'note' | 'task' | 'credential'>('all');
    const [itemDateFilter, setItemDateFilter] = useState<'all' | 'this_month' | 'last_month' | 'future' | 'custom'>('all');
    const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

    // UI State
    const [revealedItems, setRevealedItems] = useState<Set<string>>(new Set());
    // Selection & Deletion

    // Selection & Deletion
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [initialLoadDone, setInitialLoadDone] = useState(false);
    const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [isBulkDeleteAlertOpen, setIsBulkDeleteAlertOpen] = useState(false);

    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [collectionForm, setCollectionForm] = useState({ name: '', description: '', icon: '📁' });

    // Item Editing
    const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
    const [itemToEdit, setItemToEdit] = useState<CollectionItem | null>(null);

    // Helper to parse date safely, handling YYYY-MM-DD as local date (avoiding timezone shift)
    const parseDate = (dateStr: string | undefined | null) => {
        if (!dateStr) return new Date();
        // If it's a simple date string YYYY-MM-DD, append time to force it to be treated as local/noon to avoid timezone shifts
        if (dateStr.length === 10 && dateStr.includes('-')) {
            return new Date(dateStr + 'T12:00:00');
        }
        return new Date(dateStr);
    };

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
            setItems(data || []);
            setSelectedItems(new Set()); // Clear selection when changing collection
            setIsSelectionMode(false);
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
    const filteredCollections = collections.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(collectionSearch.toLowerCase());
        if (!matchesSearch) return false;

        if (collectionTypeFilter === 'financial') {
            // Check if collection has financial items (this is an approximation as we only have count, 
            // but ideally we'd need metadata on the collection or a better query. 
            // For now, let's assume all collections can have financial items, 
            // or we could check if it has 'Finanças' in name/icon. 
            // BETTER: Let's filter by icon or description if possible, or just keep it simple for now.
            // Actually, let's skip this complex filter for now or implement it if we fetch more data.
            // Let's filter by "Has Items" vs "Empty" maybe? 
            // User asked for "Type of thing". Let's stick to Search + Sort for Collections for now, 
            // and maybe "Has Items".
            return true;
        }
        return true;
    }).sort((a, b) => {
        if (collectionSort === 'name') return a.name.localeCompare(b.name);
        if (collectionSort === 'count') return (b.item_count || 0) - (a.item_count || 0);
        if (collectionSort === 'date') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return 0;
    });

    const filteredItems = items.filter(item => {
        const matchesSearch = item.content.toLowerCase().includes(itemSearch.toLowerCase()) ||
            JSON.stringify(item.metadata).toLowerCase().includes(itemSearch.toLowerCase());

        if (!matchesSearch) return false;

        // Type Filter
        if (itemTypeFilter !== 'all') {
            const itemType = item.metadata?.type || (item.metadata?.amount ? 'expense' : 'note');
            if (itemType !== itemTypeFilter) return false;
        }

        // Date Filter
        if (itemDateFilter !== 'all') {
            const itemDateStr = item.metadata?.date || item.created_at;
            const itemDate = parseDate(itemDateStr);
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

            if (itemDateFilter === 'this_month') {
                if (itemDate < startOfMonth) return false;
            } else if (itemDateFilter === 'last_month') {
                if (itemDate < startOfLastMonth || itemDate > endOfLastMonth) return false;
            } else if (itemDateFilter === 'future') {
                if (itemDate <= now) return false;
            } else if (itemDateFilter === 'custom' && customDateRange.start && customDateRange.end) {
                const startDate = parseDate(customDateRange.start);
                const endDate = parseDate(customDateRange.end);
                // Adjust end date to end of day
                endDate.setHours(23, 59, 59, 999);
                if (itemDate < startDate || itemDate > endDate) return false;
            }
        }
        return true;
    }).sort((a, b) => {
        const dateA = parseDate(a.metadata?.date || a.created_at).getTime();
        const dateB = parseDate(b.metadata?.date || b.created_at).getTime();
        const amountA = Number(a.metadata?.amount || 0);
        const amountB = Number(b.metadata?.amount || 0);

        if (itemSort === 'date_asc') return dateA - dateB;
        if (itemSort === 'amount_desc') return amountB - amountA;
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

    const handleBulkDelete = async () => {
        if (selectedItems.size === 0) return;
        setIsBulkDeleteAlertOpen(true);
    };

    const confirmBulkDelete = async () => {
        if (selectedItems.size === 0) return;
        setIsBulkDeleteAlertOpen(false);

        try {
            const ids = Array.from(selectedItems);
            const { error } = await supabase.from('collection_items').delete().in('id', ids);

            if (error) throw error;

            setItems(items.filter(i => !selectedItems.has(i.id)));

            // Update count
            if (selectedCollection) {
                const updatedCollections = collections.map(c =>
                    c.id === selectedCollection.id ? { ...c, item_count: (c.item_count || 0) - selectedItems.size } : c
                );
                setCollections(updatedCollections);
            }

            setSelectedItems(new Set());
            setIsSelectionMode(false);
        } catch (error) {
            console.error('Error bulk deleting:', error);
            alert('Erro ao apagar itens selecionados.');
        }
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

    const handleToggleCheck = async (item: CollectionItem, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const newChecked = !item.metadata?.checked;
        const newMetadata = { ...item.metadata, checked: newChecked };

        // Optimistic update
        setItems(items.map(i => i.id === item.id ? { ...i, metadata: newMetadata } : i));

        try {
            const { error } = await supabase
                .from('collection_items')
                .update({ metadata: newMetadata })
                .eq('id', item.id);

            if (error) throw error;
        } catch (error) {
            console.error('Error toggling check:', error);
            // Revert on error
            setItems(items.map(i => i.id === item.id ? { ...i, metadata: item.metadata } : i));
        }
    };

    // Reset selectedCollection when navigating to /collections via bottom nav
    useEffect(() => {
        // When location changes and we're on /collections, reset selection
        if (location.pathname === '/collections') {
            setSelectedCollection(null);
        }
    }, [location.key]); // location.key changes on each navigation

    return (
        <div className="flex h-full overflow-hidden">
            {/* Sidebar - Collections List - Full width on mobile when no collection selected */}
            <div className={`${selectedCollection ? 'hidden md:flex' : 'flex'} w-full md:w-80 bg-gray-50 md:border-r border-gray-200 flex-col shrink-0 h-full`}>
                <div className="p-6 border-b border-gray-200 shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Folder className="text-rose-600" size={28} />
                            Coleções
                        </h1>
                        <button
                            onClick={() => {
                                setCollectionForm({ name: '', description: '', icon: '📁' });
                                setIsCreateModalOpen(true);
                            }}
                            className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors"
                            title="Nova Coleção"
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                value={collectionSearch}
                                onChange={(e) => setCollectionSearch(e.target.value)}
                                className="w-full bg-gray-50 border border-ela-border rounded-lg pl-9 pr-8 py-2 text-sm text-ela-text focus:outline-none focus:ring-2 focus:ring-ela-pink focus:bg-white"
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

                        <div className="relative group">
                            <button className="h-full px-2 bg-white border border-ela-border rounded-lg text-ela-sub hover:text-ela-pink hover:border-ela-pink transition-all flex items-center justify-center">
                                <ArrowUpDown size={16} />
                            </button>
                            <div className="absolute right-0 pt-2 w-40 z-20 hidden group-hover:block">
                                <div className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                                    <button onClick={() => setCollectionSort('name')} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 hover:text-rose-600 ${collectionSort === 'name' ? 'text-rose-600' : 'text-gray-600'}`}>Nome (A-Z)</button>
                                    <button onClick={() => setCollectionSort('count')} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 hover:text-rose-600 ${collectionSort === 'count' ? 'text-rose-600' : 'text-gray-600'}`}>Qtd. Itens</button>
                                    <button onClick={() => setCollectionSort('date')} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 hover:text-rose-600 ${collectionSort === 'date' ? 'text-rose-600' : 'text-gray-600'}`}>Mais Recentes</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    <div
                        className={`w-full p-3 rounded-xl transition-all flex items-center gap-3 cursor-pointer ${!selectedCollection
                            ? 'bg-ela-pink text-white shadow-lg shadow-rose-900/20'
                            : 'bg-white text-ela-sub hover:bg-gray-50 hover:text-ela-pink border border-ela-border'}`}
                        onClick={() => setSelectedCollection(null)}
                    >
                        <Grid size={20} />
                        <span className="font-medium">Todas as Coleções</span>
                    </div>

                    <div className="h-px bg-gray-200 my-2 mx-2"></div>

                    {filteredCollections.map(collection => (
                        <div
                            key={collection.id}
                            className={`w-full p-3 rounded-xl transition-all flex items-center justify-between group cursor-pointer ${selectedCollection?.id === collection.id
                                ? 'bg-ela-pink text-white shadow-lg shadow-rose-900/20'
                                : 'bg-white text-ela-sub hover:bg-gray-50 hover:text-ela-pink border border-ela-border'
                                }`}
                            onClick={() => setSelectedCollection(collection)}
                        >
                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                                <span className="text-xl">{collection.icon || '📁'}</span>
                                <div className="truncate">
                                    <p className="font-medium truncate">{collection.name}</p>
                                    <p className={`text-xs truncate ${selectedCollection?.id === collection.id ? 'text-rose-100' : 'text-gray-400'}`}>
                                        {collection.item_count || 0} itens
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content Area - Hidden on mobile when no collection selected */}
            <div className={`${selectedCollection ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-white min-w-0`}>
                {selectedCollection ? (
                    <>
                        {/* Mobile Back Button */}
                        <button
                            onClick={() => setSelectedCollection(null)}
                            className="md:hidden flex items-center gap-2 px-4 py-3 text-gray-500 hover:text-rose-600 bg-white border-b border-gray-200 transition-colors"
                        >
                            <ArrowLeft size={20} />
                            <span className="font-medium">Voltar às Coleções</span>
                        </button>

                        {/* Header with Financial Widget - Compact on mobile */}
                        <div className="p-3 md:p-8 border-b border-gray-200 bg-white/80 backdrop-blur-xl sticky top-0 z-10">
                            <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 md:gap-6">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 md:gap-4 mb-1 md:mb-2">
                                        <div className="text-2xl md:text-5xl filter drop-shadow-sm shrink-0">{selectedCollection.icon || '📁'}</div>
                                        <div className="min-w-0">
                                            <h2 className="text-xl md:text-4xl font-bold text-gray-900 tracking-tight flex items-center gap-2 md:gap-3 truncate">
                                                <span className="truncate">{selectedCollection.name}</span>
                                                <button
                                                    onClick={() => openEditModal(selectedCollection)}
                                                    className="text-gray-400 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <Edit2 size={20} />
                                                </button>
                                            </h2>
                                            <p className="text-gray-500 text-sm md:text-lg mt-0.5 font-light line-clamp-1">{selectedCollection.description || 'Sem descrição'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Financial Summary Widget - Hidden on mobile for more scroll space */}
                                {items.some(i => i.metadata?.amount || i.metadata?.value) && (
                                    <div className="hidden md:block bg-gradient-to-br from-white to-gray-50 p-5 rounded-2xl border border-gray-200 shadow-lg min-w-[280px]">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-gray-500 text-sm font-medium uppercase tracking-wider">Investimento Total</span>
                                            <div className="bg-green-100 p-1.5 rounded-lg">
                                                <span className="text-green-600 text-xs font-bold">BRL</span>
                                            </div>
                                        </div>
                                        <div className="text-3xl font-bold text-gray-900 mb-1">
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
                            <div className="flex flex-col gap-2 mt-3 md:mt-8">
                                <div className="relative w-full group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-rose-600 transition-colors" size={18} />
                                    <input
                                        type="text"
                                        value={itemSearch}
                                        onChange={(e) => setItemSearch(e.target.value)}
                                        className="w-full bg-gray-50 border border-ela-border text-ela-text pl-11 pr-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-ela-pink focus:border-ela-pink focus:bg-white transition-all placeholder-gray-400 text-sm"
                                    />
                                </div>

                                <div className="flex flex-wrap gap-2 mt-3 md:mt-8">
                                    {/* Type Filter */}
                                    <div className="relative group z-30">
                                        <button className="h-full px-3 bg-white text-gray-500 rounded-xl border border-gray-200 hover:text-rose-600 hover:border-rose-600 transition-all flex items-center gap-2">
                                            <Filter size={18} />
                                            <span className="text-sm">
                                                {itemTypeFilter === 'all' ? 'Todos' :
                                                    itemTypeFilter === 'expense' ? 'Gastos' :
                                                        itemTypeFilter === 'note' ? 'Notas' :
                                                            itemTypeFilter === 'credential' ? 'Senhas' : 'Tarefas'}
                                            </span>
                                        </button>
                                        <div className="absolute right-0 pt-2 w-40 hidden group-hover:block">
                                            <div className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                                                <button onClick={() => setItemTypeFilter('all')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600">Todos</button>
                                                <button onClick={() => setItemTypeFilter('expense')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600">Gastos</button>
                                                <button onClick={() => setItemTypeFilter('note')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600">Notas</button>
                                                <button onClick={() => setItemTypeFilter('credential')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600">Senhas</button>
                                                <button onClick={() => setItemTypeFilter('task')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600">Tarefas</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Date Filter */}
                                    <div className="relative group z-20">
                                        <button className="h-full px-3 bg-white text-gray-500 rounded-xl border border-gray-200 hover:text-rose-600 hover:border-rose-600 transition-all flex items-center gap-2">
                                            <Calendar size={18} />
                                            <span className="text-sm">
                                                {itemDateFilter === 'all' ? 'Qualquer Data' :
                                                    itemDateFilter === 'this_month' ? 'Este Mês' :
                                                        itemDateFilter === 'last_month' ? 'Mês Passado' : 'Futuro'}
                                            </span>
                                        </button>
                                        <div className="absolute right-0 pt-2 w-64 hidden group-hover:block">
                                            <div className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden p-2">
                                                <button onClick={() => setItemDateFilter('all')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600 rounded-lg">Qualquer Data</button>
                                                <button onClick={() => setItemDateFilter('this_month')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600 rounded-lg">Este Mês</button>
                                                <button onClick={() => setItemDateFilter('last_month')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600 rounded-lg">Mês Passado</button>
                                                <button onClick={() => setItemDateFilter('future')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600 rounded-lg">Futuro</button>
                                                <div className="border-t border-gray-200 my-1"></div>
                                                <div className="px-2 py-1">
                                                    <span className="text-xs text-gray-500 block mb-1">Personalizado</span>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="date"
                                                            value={customDateRange.start}
                                                            onChange={(e) => {
                                                                setCustomDateRange(prev => ({ ...prev, start: e.target.value }));
                                                                setItemDateFilter('custom');
                                                            }}
                                                            className="w-full bg-white border border-gray-200 text-gray-900 text-xs rounded px-2 py-1 focus:outline-none focus:border-rose-600"
                                                        />
                                                        <input
                                                            type="date"
                                                            value={customDateRange.end}
                                                            onChange={(e) => {
                                                                setCustomDateRange(prev => ({ ...prev, end: e.target.value }));
                                                                setItemDateFilter('custom');
                                                            }}
                                                            className="w-full bg-white border border-gray-200 text-gray-900 text-xs rounded px-2 py-1 focus:outline-none focus:border-rose-600"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sort */}
                                    <div className="relative group z-10">
                                        <button className="h-full px-3 bg-white text-gray-500 rounded-xl border border-gray-200 hover:text-rose-600 hover:border-rose-600 transition-all flex items-center gap-2">
                                            <ArrowUpDown size={18} />
                                        </button>
                                        <div className="absolute right-0 pt-2 w-40 hidden group-hover:block">
                                            <div className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                                                <button onClick={() => setItemSort('date_desc')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600">Mais Recentes</button>
                                                <button onClick={() => setItemSort('date_asc')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600">Mais Antigos</button>
                                                <button onClick={() => setItemSort('amount_desc')} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-rose-600">Maior Valor</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-px bg-gray-200 mx-1 hidden md:block"></div>

                                    <Button
                                        variant="danger"
                                        onClick={() => handleDeleteCollectionClick(selectedCollection.id)}
                                        className="h-full px-4 bg-red-50 text-red-600 border-red-200 hover:bg-red-100 ml-auto md:ml-0"
                                        icon={Trash2}
                                    >
                                        Excluir
                                    </Button>

                                    <div className="w-px bg-gray-200 mx-1 hidden md:block"></div>

                                    <button
                                        onClick={() => {
                                            setIsSelectionMode(!isSelectionMode);
                                            setSelectedItems(new Set());
                                        }}
                                        className={`h-full px-4 rounded-xl border transition-all flex items-center gap-2 ${isSelectionMode
                                            ? 'bg-rose-600 text-white border-rose-600'
                                            : 'bg-white text-gray-500 border-gray-200 hover:text-rose-600 hover:border-rose-600'
                                            }`}
                                    >
                                        <CheckSquareIcon size={18} />
                                        <span className="text-sm hidden md:inline">{isSelectionMode ? 'Cancelar Seleção' : 'Selecionar'}</span>
                                    </button>

                                    {selectedItems.size > 0 && (
                                        <Button
                                            variant="danger"
                                            onClick={handleBulkDelete}
                                            className="h-full px-4 bg-red-600 text-white border-red-500 hover:bg-red-500 animate-in fade-in slide-in-from-right-4"
                                            icon={Trash2}
                                        >
                                            Apagar ({selectedItems.size})
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Items List - Masonry Layout with Subcategories */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 md:pb-8 bg-white">
                            {isLoadingItems ? (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-4">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                    <p>Carregando suas memórias...</p>
                                </div>
                            ) : filteredItems.length > 0 ? (
                                <div className="space-y-12">
                                    {sortedCategories.map(category => (
                                        <div key={category} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <div className="flex items-center gap-3 mb-6 pb-2 border-b border-gray-100">
                                                <h3 className="text-xl font-bold text-gray-800 tracking-tight">{category}</h3>
                                                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
                                                    {groupedItems[category].length}
                                                </span>
                                                {/* Section Total */}
                                                {groupedItems[category].some(i => i.metadata?.amount || i.metadata?.value) && (
                                                    <div className="ml-auto flex items-center gap-2 bg-green-50/50 px-3 py-1 rounded-lg border border-green-100">
                                                        <span className="text-xs text-green-600 font-medium uppercase">Total</span>
                                                        <span className="text-sm font-bold text-green-600">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                                groupedItems[category].reduce((acc, item) => {
                                                                    const val = item.metadata?.amount || item.metadata?.value;
                                                                    return acc + (Number(val) || 0);
                                                                }, 0)
                                                            )}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="">
                                                {groupedItems[category].map((item) => {
                                                    const hasAmount = item.metadata?.amount || item.metadata?.value;
                                                    const amount = Number(item.metadata?.amount || item.metadata?.value || 0);
                                                    const isCredential = item.metadata?.type === 'credential';
                                                    const isRevealed = revealedItems.has(item.id);

                                                    const toggleReveal = (e: React.MouseEvent) => {
                                                        e.stopPropagation();
                                                        const newRevealed = new Set(revealedItems);
                                                        if (newRevealed.has(item.id)) {
                                                            newRevealed.delete(item.id);
                                                        } else {
                                                            newRevealed.add(item.id);
                                                        }
                                                        setRevealedItems(newRevealed);
                                                    };

                                                    const copyToClipboard = (text: string, e: React.MouseEvent) => {
                                                        e.stopPropagation();
                                                        navigator.clipboard.writeText(text);
                                                        // Could add a toast here
                                                    };

                                                    return (
                                                        <SwipeableItem
                                                            key={item.id}
                                                            onSwipeLeft={() => setItemToDelete(item.id)}
                                                            onSwipeRight={
                                                                (item.metadata?.type === 'shopping_item' || item.metadata?.type === 'list_item' || item.metadata?.type === 'task')
                                                                    ? () => handleToggleCheck(item)
                                                                    : undefined
                                                            }
                                                            leftActionIcon={<CheckSquareIcon size={24} />}
                                                            leftActionColor="bg-ela-pink"
                                                            rightActionColor="bg-red-600"
                                                        >
                                                            <div
                                                                className="flex flex-col gap-2 p-4 cursor-pointer group"
                                                                onClick={() => {
                                                                    if (isSelectionMode) {
                                                                        const newSelection = new Set(selectedItems);
                                                                        if (newSelection.has(item.id)) {
                                                                            newSelection.delete(item.id);
                                                                        } else {
                                                                            newSelection.add(item.id);
                                                                        }
                                                                        setSelectedItems(newSelection);
                                                                    } else {
                                                                        setItemToEdit(item);
                                                                        setIsEditItemModalOpen(true);
                                                                    }
                                                                }}
                                                            >
                                                                <div className="flex items-start gap-4">
                                                                    {/* Selection Checkbox */}
                                                                    {isSelectionMode && (
                                                                        <div className={`mt-1.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedItems.has(item.id)
                                                                            ? 'bg-ela-pink border-ela-pink text-white'
                                                                            : 'border-gray-300 bg-white'
                                                                            }`}>
                                                                            {selectedItems.has(item.id) && <Check size={14} />}
                                                                        </div>
                                                                    )}

                                                                    {/* Icon */}
                                                                    {item.metadata?.type === 'expense' || hasAmount ? (
                                                                        <div className="bg-green-100 text-green-600 p-2 rounded-lg mt-1">
                                                                            <DollarSign size={16} />
                                                                        </div>
                                                                    ) : item.metadata?.type === 'credential' ? (
                                                                        <div className="bg-purple-100 text-purple-600 p-2 rounded-lg mt-1">
                                                                            <Lock size={16} />
                                                                        </div>
                                                                    ) : item.metadata?.type === 'task' ? (
                                                                        <div className="bg-orange-100 text-orange-600 p-2 rounded-lg mt-1">
                                                                            <CheckCircle size={16} />
                                                                        </div>
                                                                    ) : item.metadata?.type === 'shopping_item' ? (
                                                                        <div
                                                                            onClick={(e) => handleToggleCheck(item, e)}
                                                                            className={`p-2 rounded-lg mt-1 transition-colors cursor-pointer ${item.metadata?.checked ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                                                        >
                                                                            {item.metadata?.checked ? <CheckSquareIcon size={16} /> : <Square size={16} />}
                                                                        </div>
                                                                    ) : item.metadata?.type === 'list_item' ? (
                                                                        <div
                                                                            onClick={(e) => handleToggleCheck(item, e)}
                                                                            className={`p-2 rounded-lg mt-1 transition-colors cursor-pointer ${item.metadata?.checked ? 'bg-blue-100 text-blue-600' : 'bg-indigo-50 text-indigo-400 hover:bg-indigo-100'}`}
                                                                        >
                                                                            {item.metadata?.checked ? <CheckSquareIcon size={16} /> : <Square size={16} />}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="bg-blue-50 text-blue-500 p-2 rounded-lg mt-1">
                                                                            <FileText size={16} />
                                                                        </div>
                                                                    )}

                                                                    <div className="flex-1 min-w-0">
                                                                        {isCredential ? (
                                                                            <div className="space-y-2">
                                                                                <p className="text-gray-700 font-medium">{item.content}</p>
                                                                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex flex-col gap-2">
                                                                                    {item.metadata?.username && (
                                                                                        <div className="flex items-center justify-between text-sm">
                                                                                            <span className="text-gray-500">Usuário:</span>
                                                                                            <div className="flex items-center gap-2">
                                                                                                <span className="text-gray-800 font-mono">{item.metadata.username}</span>
                                                                                                <button
                                                                                                    onClick={(e) => copyToClipboard(item.metadata.username, e)}
                                                                                                    className="text-gray-400 hover:text-ela-pink p-1 rounded transition-colors"
                                                                                                    title="Copiar usuário"
                                                                                                >
                                                                                                    <Copy size={12} />
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                    {item.metadata?.password && (
                                                                                        <div className="flex items-center justify-between text-sm">
                                                                                            <span className="text-gray-500">Senha:</span>
                                                                                            <div className="flex items-center gap-2">
                                                                                                <span className={`font-mono transition-all ${isRevealed ? 'text-gray-800' : 'text-transparent bg-gray-200 px-2 rounded blur-[2px] select-none'}`}>
                                                                                                    {isRevealed ? item.metadata.password : '••••••••••••'}
                                                                                                </span>
                                                                                                <button
                                                                                                    onClick={toggleReveal}
                                                                                                    className="text-gray-400 hover:text-ela-pink p-1 rounded transition-colors"
                                                                                                    title={isRevealed ? "Ocultar" : "Revelar"}
                                                                                                >
                                                                                                    {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                                                                                                </button>
                                                                                                <button
                                                                                                    onClick={(e) => copyToClipboard(item.metadata.password, e)}
                                                                                                    className="text-gray-400 hover:text-ela-pink p-1 rounded transition-colors"
                                                                                                    title="Copiar senha"
                                                                                                >
                                                                                                    <Copy size={12} />
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ) : item.metadata?.type === 'shopping_item' ? (
                                                                            <div className="flex items-center gap-3">
                                                                                <p className={`text-lg font-medium transition-all ${item.metadata?.checked ? 'text-gray-400 line-through decoration-gray-400' : 'text-ela-text'}`}>
                                                                                    {item.content}
                                                                                </p>
                                                                                {item.metadata?.quantity && (
                                                                                    <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                                                                                        {item.metadata.quantity}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ) : item.metadata?.type === 'list_item' ? (
                                                                            <div className="flex flex-col gap-1">
                                                                                <div className="flex items-center gap-3">
                                                                                    <p className={`text-lg font-medium transition-all ${item.metadata?.checked ? 'text-gray-400 line-through decoration-gray-400' : 'text-ela-text'}`}>
                                                                                        {item.content}
                                                                                    </p>
                                                                                    {item.metadata?.rating && (
                                                                                        <span className="text-xs font-bold bg-yellow-600/20 text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-500/30">
                                                                                            {'⭐'.repeat(item.metadata.rating)}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {item.metadata?.notes && (
                                                                                    <p className="text-xs text-gray-400 italic">
                                                                                        {item.metadata.notes}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <div>
                                                                                <p className="text-gray-600 text-sm font-light whitespace-pre-wrap leading-relaxed">
                                                                                    {item.content.split('|').map((part, i) => (
                                                                                        <span key={i} className={i > 0 ? "block mt-1 text-gray-500" : ""}>
                                                                                            {part.trim()}
                                                                                        </span>
                                                                                    ))}
                                                                                </p>
                                                                            </div>
                                                                        )}

                                                                        <div className="flex items-center gap-2 mt-2">
                                                                            <span className="text-xs text-gray-400">{format(parseDate(item.metadata?.date || item.created_at), "d MMM", { locale: ptBR })}</span>
                                                                            {item.metadata?.category && (
                                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
                                                                                    {item.metadata.category}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {hasAmount && (
                                                                        <div className="text-green-400 font-bold text-sm whitespace-nowrap">
                                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)}
                                                                        </div>
                                                                    )}

                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDeleteItemClick(item.id);
                                                                        }}
                                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </SwipeableItem>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-20">
                                    <div className="bg-gray-50 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                                        <Filter className="text-gray-400" size={32} />
                                    </div>
                                    <p className="text-gray-500 font-medium">Nenhum item encontrado</p>
                                    <p className="text-gray-400 text-sm mt-1">Tente mudar os filtros ou a busca</p>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    // Collections Dashboard (All Collections View)
                    <div className="flex-1 flex flex-col bg-white p-8 overflow-y-auto">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900">Minhas Coleções</h2>
                                <p className="text-gray-500 mt-2">Gerencie todas as suas pastas e arquivos</p>
                            </div>
                            <div className="flex gap-3">
                                {/* Sort Dropdown */}
                                <div className="relative group">
                                    <button className="flex items-center gap-2 px-4 py-2 bg-white text-gray-600 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200">
                                        <ArrowUpDown size={16} />
                                        <span className="text-sm font-medium">
                                            {collectionSort === 'name' ? 'Nome' : collectionSort === 'count' ? 'Qtd. Itens' : 'Data'}
                                        </span>
                                        <ChevronDown size={14} />
                                    </button>
                                    <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-20 hidden group-hover:block">
                                        <button onClick={() => setCollectionSort('name')} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${collectionSort === 'name' ? 'text-ela-pink' : 'text-gray-600'}`}>Nome</button>
                                        <button onClick={() => setCollectionSort('count')} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${collectionSort === 'count' ? 'text-ela-pink' : 'text-gray-600'}`}>Qtd. Itens</button>
                                        <button onClick={() => setCollectionSort('date')} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${collectionSort === 'date' ? 'text-ela-pink' : 'text-gray-600'}`}>Data</button>
                                    </div>
                                </div>

                                <Button
                                    onClick={() => {
                                        setCollectionForm({ name: '', description: '', icon: '📁' });
                                        setIsCreateModalOpen(true);
                                    }}
                                    icon={Plus}
                                    className="bg-ela-pink hover:bg-pink-600 text-white"
                                >
                                    Nova Coleção
                                </Button>
                            </div>
                        </div>

                        {filteredCollections.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                                {filteredCollections.map(collection => (
                                    <Card
                                        key={collection.id}
                                        className="p-6 hover:border-ela-pink/50 hover:bg-gray-50 transition-all cursor-pointer group relative bg-white border-ela-border"
                                        onClick={() => setSelectedCollection(collection)}
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="text-4xl p-3 bg-gray-50 rounded-2xl border border-gray-100 group-hover:border-ela-pink/30 transition-colors">
                                                {collection.icon || '📁'}
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openEditModal(collection);
                                                    }}
                                                    className="p-2 rounded-lg bg-white text-gray-400 hover:text-ela-pink hover:bg-gray-100 border border-gray-200"
                                                    title="Editar"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteCollectionClick(collection.id);
                                                    }}
                                                    className="p-2 rounded-lg bg-white text-gray-400 hover:text-red-500 hover:bg-gray-100 border border-gray-200"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        <h3 className="text-xl font-bold text-gray-900 mb-2">{collection.name}</h3>
                                        <p className="text-gray-500 text-sm line-clamp-2 mb-4 h-10">
                                            {collection.description || 'Sem descrição'}
                                        </p>

                                        <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-sm text-gray-400">
                                            <span>{collection.item_count || 0} itens</span>
                                            <span>{format(new Date(collection.created_at), "d MMM, yyyy", { locale: ptBR })}</span>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                                <div className="bg-gray-50 rounded-full p-6 mb-4">
                                    <Folder size={48} className="text-gray-400" />
                                </div>
                                <p className="text-xl font-medium text-gray-900 mb-2">Nenhuma coleção encontrada</p>
                                <p className="mb-6">Crie sua primeira coleção para começar a organizar.</p>
                                <Button
                                    onClick={() => {
                                        setCollectionForm({ name: '', description: '', icon: '📁' });
                                        setIsCreateModalOpen(true);
                                    }}
                                    icon={Plus}
                                    className="bg-ela-pink hover:bg-pink-600 text-white"
                                >
                                    Criar Coleção
                                </Button>
                            </div>
                        )}
                    </div>
                )}
                {/* Mobile FAB */}
                <button
                    onClick={() => {
                        setCollectionForm({ name: '', description: '', icon: '📁' });
                        setIsCreateModalOpen(true);
                    }}
                    className="md:hidden fixed bottom-24 right-4 w-14 h-14 bg-ela-pink text-white rounded-full shadow-lg shadow-pink-900/50 flex items-center justify-center z-40 active:scale-95 transition-transform"
                >
                    <Plus size={28} />
                </button>
            </div>

            {/* Create/Edit Collection Modal - Bottom Sheet on Mobile, Centered on Desktop */}
            {
                (isCreateModalOpen || isEditModalOpen) && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center" onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }}>
                        <div
                            className="bg-white md:bg-white border-t md:border border-gray-200 rounded-t-3xl md:rounded-2xl p-6 w-full md:max-w-md md:mx-4 shadow-2xl animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10 duration-300"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-center md:hidden mb-6">
                                <div className="w-12 h-1.5 bg-gray-200 rounded-full"></div>
                            </div>

                            <h3 className="text-xl font-bold text-gray-900 mb-6">
                                {isEditModalOpen ? 'Editar Coleção' : 'Nova Coleção'}
                            </h3>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-1.5">Nome</label>
                                    <input
                                        type="text"
                                        value={collectionForm.name}
                                        onChange={(e) => setCollectionForm({ ...collectionForm, name: e.target.value })}
                                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-ela-pink text-lg"
                                        placeholder="Ex: Viagem para Paris"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-1.5">Descrição (Opcional)</label>
                                    <textarea
                                        value={collectionForm.description}
                                        onChange={(e) => setCollectionForm({ ...collectionForm, description: e.target.value })}
                                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-ela-pink h-24 resize-none text-base"
                                        placeholder="Detalhes sobre esta coleção..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-2">Ícone</label>
                                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2">
                                        {['📁', '✈️', '💼', '🏠', '🎓', '💡', '📅', '🛒', '🎵', '📷', '🍔', '💪', '💰', '🏥', '🎮'].map(icon => (
                                            <button
                                                key={icon}
                                                onClick={() => setCollectionForm({ ...collectionForm, icon })}
                                                className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl transition-all ${collectionForm.icon === icon
                                                    ? 'bg-ela-pink text-white scale-110 shadow-lg shadow-pink-900/50'
                                                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
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
                                    className="flex-1 md:flex-none justify-center py-3 bg-gray-100 text-gray-700 hover:bg-gray-200"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={isEditModalOpen ? handleEditCollection : handleCreateCollection}
                                    disabled={!collectionForm.name}
                                    className="flex-1 md:flex-none justify-center py-3 bg-ela-pink hover:bg-pink-600 text-white"
                                >
                                    {isEditModalOpen ? 'Salvar' : 'Criar'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modals */}
            <AlertDialog
                isOpen={!!collectionToDelete}
                onClose={() => setCollectionToDelete(null)}
                onConfirm={confirmDeleteCollection}
                title="Excluir Coleção?"
                description={
                    <span>
                        Isso apagará a coleção e <strong>TODOS os itens</strong> nela permanentemente.
                    </span>
                }
                confirmText="Excluir Tudo"
                variant="danger"
            />

            <AlertDialog
                isOpen={!!itemToDelete}
                onClose={() => setItemToDelete(null)}
                onConfirm={confirmDeleteItem}
                title="Excluir Item?"
                description="Tem certeza que deseja excluir este item?"
                confirmText="Excluir"
                variant="danger"
            />

            <AlertDialog
                isOpen={isBulkDeleteAlertOpen}
                onClose={() => setIsBulkDeleteAlertOpen(false)}
                onConfirm={confirmBulkDelete}
                title="Excluir Itens Selecionados?"
                description={`Tem certeza que deseja apagar ${selectedItems.size} itens?`}
                confirmText={`Apagar (${selectedItems.size})`}
                variant="danger"
            />

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
