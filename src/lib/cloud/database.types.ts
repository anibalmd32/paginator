export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          plan: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          [_ in never]: never;
        };
        Update: {
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          snapshot: Json;
          page_count: number;
          sheet_count: number;
          verdict: 'ok' | 'warnings' | 'errors';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          snapshot: Json;
          page_count?: number;
          sheet_count?: number;
          verdict?: 'ok' | 'warnings' | 'errors';
        };
        Update: {
          title?: string;
          snapshot?: Json;
          page_count?: number;
          sheet_count?: number;
          verdict?: 'ok' | 'warnings' | 'errors';
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
