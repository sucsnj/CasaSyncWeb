export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          full_name: string | null
          avatar_url: string | null
          user_role: Database['public']['Enums']['user_role']
          points: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          user_role: Database['public']['Enums']['user_role']
          points?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          user_role?: Database['public']['Enums']['user_role']
          points?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      houses: {
        Row: {
          id: string
          name: string
          code: string
          owner_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          code: string
          owner_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          code?: string
          owner_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'houses_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      house_members: {
        Row: {
          id: string
          house_id: string
          profile_id: string
          role: Database['public']['Enums']['member_role']
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          house_id: string
          profile_id: string
          role?: Database['public']['Enums']['member_role']
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          house_id?: string
          profile_id?: string
          role?: Database['public']['Enums']['member_role']
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'house_members_house_id_fkey'
            columns: ['house_id']
            isOneToOne: false
            referencedRelation: 'houses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'house_members_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      tasks: {
        Row: {
          id: string
          house_id: string
          title: string
          description: string | null
          points: number
          status: Database['public']['Enums']['task_status']
          assigned_to: string | null
          created_by: string
          completed_by: string | null
          completed_at: string | null
          due_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          house_id: string
          title: string
          description?: string | null
          points?: number
          status?: Database['public']['Enums']['task_status']
          assigned_to?: string | null
          created_by: string
          completed_by?: string | null
          completed_at?: string | null
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          house_id?: string
          title?: string
          description?: string | null
          points?: number
          status?: Database['public']['Enums']['task_status']
          assigned_to?: string | null
          created_by?: string
          completed_by?: string | null
          completed_at?: string | null
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_house_id_fkey'
            columns: ['house_id']
            isOneToOne: false
            referencedRelation: 'houses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_assigned_to_fkey'
            columns: ['assigned_to']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      rewards: {
        Row: {
          id: string
          house_id: string
          title: string
          description: string | null
          points_cost: number
          emoji: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          house_id: string
          title: string
          description?: string | null
          points_cost: number
          emoji?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          house_id?: string
          title?: string
          description?: string | null
          points_cost?: number
          emoji?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'rewards_house_id_fkey'
            columns: ['house_id']
            isOneToOne: false
            referencedRelation: 'houses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rewards_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      reward_redemptions: {
        Row: {
          id: string
          house_id: string
          reward_id: string
          profile_id: string
          status: Database['public']['Enums']['redemption_status']
          approved_by: string | null
          points_cost: number
          resolved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          house_id: string
          reward_id: string
          profile_id: string
          status?: Database['public']['Enums']['redemption_status']
          approved_by?: string | null
          points_cost: number
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          house_id?: string
          reward_id?: string
          profile_id?: string
          status?: Database['public']['Enums']['redemption_status']
          approved_by?: string | null
          points_cost?: number
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reward_redemptions_house_id_fkey'
            columns: ['house_id']
            isOneToOne: false
            referencedRelation: 'houses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reward_redemptions_reward_id_fkey'
            columns: ['reward_id']
            isOneToOne: false
            referencedRelation: 'rewards'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reward_redemptions_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
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
      user_role: 'ADMIN' | 'DEPENDENT'
      member_role: 'ADMIN' | 'DEPENDENT'
      task_status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED'
      redemption_status: 'PENDING' | 'APPROVED' | 'REJECTED'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]