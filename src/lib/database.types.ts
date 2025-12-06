export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "13.0.5"
    }
    public: {
        Tables: {
            collection_items: {
                Row: {
                    collection_id: string
                    content: string | null
                    created_at: string | null
                    id: string
                    media_url: string | null
                    metadata: Json | null
                    type: string
                    user_id: string
                }
                Insert: {
                    collection_id: string
                    content?: string | null
                    created_at?: string | null
                    id?: string
                    media_url?: string | null
                    metadata?: Json | null
                    type: string
                    user_id: string
                }
                Update: {
                    collection_id?: string
                    content?: string | null
                    created_at?: string | null
                    id?: string
                    media_url?: string | null
                    metadata?: Json | null
                    type?: string
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "collection_items_collection_id_fkey"
                        columns: ["collection_id"]
                        isOneToOne: false
                        referencedRelation: "collections"
                        referencedColumns: ["id"]
                    },
                ]
            }
            collections: {
                Row: {
                    created_at: string | null
                    description: string | null
                    icon: string | null
                    id: string
                    name: string
                    updated_at: string | null
                    user_id: string
                }
                Insert: {
                    created_at?: string | null
                    description?: string | null
                    icon?: string | null
                    id?: string
                    name: string
                    updated_at?: string | null
                    user_id: string
                }
                Update: {
                    created_at?: string | null
                    description?: string | null
                    icon?: string | null
                    id?: string
                    name?: string
                    updated_at?: string | null
                    user_id?: string
                }
                Relationships: []
            }
            documents: {
                Row: {
                    content: string | null
                    created_at: string | null
                    id: string
                    metadata: Json | null
                    title: string
                    updated_at: string | null
                    user_id: string
                }
                Insert: {
                    content?: string | null
                    created_at?: string | null
                    id?: string
                    metadata?: Json | null
                    title: string
                    updated_at?: string | null
                    user_id: string
                }
                Update: {
                    content?: string | null
                    created_at?: string | null
                    id?: string
                    metadata?: Json | null
                    title?: string
                    updated_at?: string | null
                    user_id?: string
                }
                Relationships: []
            }
            memories: {
                Row: {
                    category: string | null
                    content: string
                    created_at: string | null
                    embedding: string | null
                    id: string
                    importance: number | null
                    user_id: string
                }
                Insert: {
                    category?: string | null
                    content: string
                    created_at?: string | null
                    embedding?: string | null
                    id?: string
                    importance?: number | null
                    user_id: string
                }
                Update: {
                    category?: string | null
                    content?: string
                    created_at?: string | null
                    embedding?: string | null
                    id?: string
                    importance?: number | null
                    user_id?: string
                }
                Relationships: []
            }
            memory_vectors: {
                Row: {
                    content: string | null
                    created_at: string | null
                    embedding: string | null
                    id: string
                    metadata: Json | null
                    user_id: string | null
                }
                Insert: {
                    content?: string | null
                    created_at?: string | null
                    embedding?: string | null
                    id?: string
                    metadata?: Json | null
                    user_id?: string | null
                }
                Update: {
                    content?: string | null
                    created_at?: string | null
                    embedding?: string | null
                    id?: string
                    metadata?: Json | null
                    user_id?: string | null
                }
                Relationships: []
            }
            messages: {
                Row: {
                    content: string | null
                    created_at: string | null
                    id: string
                    media_type: string | null
                    media_url: string | null
                    role: string
                    user_id: string
                }
                Insert: {
                    content?: string | null
                    created_at?: string | null
                    id?: string
                    media_type?: string | null
                    media_url?: string | null
                    role: string
                    user_id: string
                }
                Update: {
                    content?: string | null
                    created_at?: string | null
                    id?: string
                    media_type?: string | null
                    media_url?: string | null
                    role?: string
                    user_id?: string
                }
                Relationships: []
            }
            reminders: {
                Row: {
                    completed: boolean | null
                    created_at: string | null
                    description: string | null
                    due_at: string
                    id: string
                    recurrence_count: number | null
                    recurrence_interval: number | null
                    recurrence_type: string | null
                    recurrence_unit: string | null
                    title: string
                    updated_at: string | null
                    user_id: string
                    weekdays: number[] | null
                }
                Insert: {
                    completed?: boolean | null
                    created_at?: string | null
                    description?: string | null
                    due_at: string
                    id?: string
                    recurrence_count?: number | null
                    recurrence_interval?: number | null
                    recurrence_type?: string | null
                    recurrence_unit?: string | null
                    title: string
                    updated_at?: string | null
                    user_id: string
                    weekdays?: number[] | null
                }
                Update: {
                    completed?: boolean | null
                    created_at?: string | null
                    description?: string | null
                    due_at?: string
                    id?: string
                    recurrence_count?: number | null
                    recurrence_interval?: number | null
                    recurrence_type?: string | null
                    recurrence_unit?: string | null
                    title?: string
                    updated_at?: string | null
                    user_id?: string
                    weekdays?: number[] | null
                }
                Relationships: []
            }

            user_preferences: {
                Row: {
                    created_at: string | null
                    id: string
                    key: string
                    updated_at: string | null
                    user_id: string
                    value: Json
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    key: string
                    updated_at?: string | null
                    user_id: string
                    value: Json
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    key?: string
                    updated_at?: string | null
                    user_id?: string
                    value?: Json
                }
                Relationships: []
            }
            user_settings: {
                Row: {
                    ai_model: string | null
                    created_at: string | null
                    custom_system_prompt: string | null
                    id: string
                    updated_at: string | null
                    user_id: string
                }
                Insert: {
                    ai_model?: string | null
                    created_at?: string | null
                    custom_system_prompt?: string | null
                    id?: string
                    updated_at?: string | null
                    user_id: string
                }
                Update: {
                    ai_model?: string | null
                    created_at?: string | null
                    custom_system_prompt?: string | null
                    id?: string
                    updated_at?: string | null
                    user_id?: string
                }
                Relationships: []
            }
            users: {
                Row: {
                    created_at: string | null
                    email: string
                    id: string
                    name: string | null
                    phone: string | null
                }
                Insert: {
                    created_at?: string | null
                    email: string
                    id?: string
                    name?: string | null
                    phone?: string | null
                }
                Update: {
                    created_at?: string | null
                    email?: string
                    id?: string
                    name?: string | null
                    phone?: string | null
                }
                Relationships: []
            }
            user_integrations: {
                Row: {
                    access_token: string
                    created_at: string | null
                    expires_at: string | null
                    id: string
                    provider: string
                    refresh_token: string | null
                    updated_at: string | null
                    user_id: string
                }
                Insert: {
                    access_token: string
                    created_at?: string | null
                    expires_at?: string | null
                    id?: string
                    provider: string
                    refresh_token?: string | null
                    updated_at?: string | null
                    user_id: string
                }
                Update: {
                    access_token?: string
                    created_at?: string | null
                    expires_at?: string | null
                    id?: string
                    provider?: string
                    refresh_token?: string | null
                    updated_at?: string | null
                    user_id?: string
                }
                Relationships: []
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof Database
    }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
