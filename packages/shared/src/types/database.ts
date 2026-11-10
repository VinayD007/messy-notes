import type { NoteContent, NoteRow, NoteType, PhotoAttachment } from './note';

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      notes: {
        Row: NoteRow;
        Insert: {
          id?: string;
          user_id?: string;
          title?: string | null;
          type?: NoteType;
          content?: NoteContent;
          favorite?: boolean;
          pinned?: boolean;
          pinned_at?: string | null;
          photo_attachments?: PhotoAttachment[];
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          type?: NoteType;
          content?: NoteContent;
          favorite?: boolean;
          pinned?: boolean;
          pinned_at?: string | null;
          photo_attachments?: PhotoAttachment[];
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
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
      note_type: NoteType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
