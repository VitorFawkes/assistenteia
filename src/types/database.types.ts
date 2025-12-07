// @ts-nocheck
export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
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
                    created_at: string | null
                    file_path: string
                    file_type: string | null
                    filename: string
                    id: string
                    size_bytes: number | null
                    user_id: string
                }
                Insert: {
                    created_at?: string | null
                    file_path: string
                    file_type?: string | null
                    filename: string
                    id?: string
                    size_bytes?: number | null
                    user_id: string
                }
                Update: {
                    created_at?: string | null
                    file_path?: string
                    file_type?: string | null
                    filename?: string
                    id?: string
                    size_bytes?: number | null
                    user_id?: string
                }
                Relationships: []
            }
            memories: {
                Row: {
                    content: string
                    created_at: string | null
                    embedding: string | null
                    id: string
                    user_id: string
                }
                Insert: {
                    content: string
                    created_at?: string | null
                    embedding?: string | null
                    id?: string
                    user_id: string
                }
                Update: {
                    content?: string
                    created_at?: string | null
                    embedding?: string | null
                    id?: string
                    user_id?: string
                }
                Relationships: []
            },
            memory_vectors: {
                Row: {
                    id: string
                    user_id: string
                    content: string
                    metadata: Json | null
                    embedding: string | null
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    content: string
                    metadata?: Json | null
                    embedding?: string | null
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    content?: string
                    metadata?: Json | null
                    embedding?: string | null
                    created_at?: string | null
                }
                Relationships: []
            },
            user_preferences: {
                Row: {
                    id: string
                    user_id: string
                    key: string
                    value: string
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    key: string
                    value: string
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    key?: string
                    value?: string
                    created_at?: string | null
                }
                Relationships: []
            },
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
                    created_at: string | null
                    description: string | null
                    due_at: string
                    id: string
                    is_completed: boolean | null
                    notified: boolean | null
                    notification_sent_at: string | null
                    recurrence_rule: string | null
                    title: string
                    user_id: string
                }
                Insert: {
                    created_at?: string | null
                    description?: string | null
                    due_at: string
                    id?: string
                    is_completed?: boolean | null
                    notified?: boolean | null
                    notification_sent_at?: string | null
                    recurrence_rule?: string | null
                    title: string
                    user_id: string
                }
                Update: {
                    created_at?: string | null
                    description?: string | null
                    due_at?: string
                    id?: string
                    is_completed?: boolean | null
                    notified?: boolean | null
                    notification_sent_at?: string | null
                    recurrence_rule?: string | null
                    title?: string
                    user_id?: string
                }
                Relationships: []
            }
            users: {
                Row: {
                    avatar_url: string | null
                    created_at: string | null
                    full_name: string | null
                    id: string
                }
                Insert: {
                    avatar_url?: string | null
                    created_at?: string | null
                    full_name?: string | null
                    id: string
                }
                Update: {
                    avatar_url?: string | null
                    created_at?: string | null
                    full_name?: string | null
                    id?: string
                }
                Relationships: []
            },
            user_settings: {
                Row: {
                    user_id: string
                    custom_system_prompt: string | null
                    ai_model: string | null
                    updated_at: string | null
                }
                Insert: {
                    user_id: string
                    custom_system_prompt?: string | null
                    ai_model?: string | null
                    updated_at?: string | null
                }
                Update: {
                    user_id?: string
                    custom_system_prompt?: string | null
                    ai_model?: string | null
                    updated_at?: string | null
                }
                Relationships: []
            },
            whatsapp_instances: {
                Row: {
                    id: string
                    user_id: string
                    instance_name: string
                    status: 'connecting' | 'connected' | 'disconnected'
                    qr_code: string | null
                    created_at: string | null
                    updated_at: string | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    instance_name: string
                    status?: 'connecting' | 'connected' | 'disconnected'
                    qr_code?: string | null
                    created_at?: string | null
                    updated_at?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    instance_name?: string
                    status?: 'connecting' | 'connected' | 'disconnected'
                    qr_code?: string | null
                    created_at?: string | null
                    updated_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "whatsapp_instances_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: true
                        referencedRelation: "users"
                        referencedColumns: ["id"]
                    }
                ]
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

type DefaultSchema = Database["public"]

export type Tables<
    DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
    TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
    TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
    TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
    EnumName extends DefaultSchemaEnumNameOrOptions extends {
        schema: keyof Database
    }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
}
    ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never
