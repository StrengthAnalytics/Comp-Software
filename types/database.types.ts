// INTERIM hand-authored mirror of the schema in /supabase/migrations, used so the app
// typechecks before the database is provisioned. Replace with `pnpm db:types` output
// generated against the hosted database once the migrations are applied.
// Source of truth remains /supabase/migrations.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      competitions: {
        Row: {
          id: string;
          slug: string;
          name: string;
          federation: string;
          kit_type: Database['public']['Enums']['kit_type'];
          event_type: Database['public']['Enums']['event_type'];
          status: Database['public']['Enums']['comp_status'];
          starts_on: string | null;
          ends_on: string | null;
          overlay_key: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          federation?: string;
          kit_type: Database['public']['Enums']['kit_type'];
          event_type: Database['public']['Enums']['event_type'];
          status?: Database['public']['Enums']['comp_status'];
          starts_on?: string | null;
          ends_on?: string | null;
          overlay_key?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          federation?: string;
          kit_type?: Database['public']['Enums']['kit_type'];
          event_type?: Database['public']['Enums']['event_type'];
          status?: Database['public']['Enums']['comp_status'];
          starts_on?: string | null;
          ends_on?: string | null;
          overlay_key?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      divisions: {
        Row: {
          id: string;
          competition_id: string;
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          name: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      weight_classes: {
        Row: {
          id: string;
          competition_id: string;
          name: string;
          gender: string;
          lower_kg: number;
          upper_kg: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          name: string;
          gender: string;
          lower_kg?: number;
          upper_kg?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          name?: string;
          gender?: string;
          lower_kg?: number;
          upper_kg?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      platforms: {
        Row: {
          id: string;
          competition_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          competition_id: string;
          platform_id: string | null;
          name: string;
          session_date: string | null;
          start_time: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          platform_id?: string | null;
          name: string;
          session_date?: string | null;
          start_time?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          platform_id?: string | null;
          name?: string;
          session_date?: string | null;
          start_time?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      flights: {
        Row: {
          id: string;
          competition_id: string;
          session_id: string;
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          session_id: string;
          name: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          session_id?: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      lifters: {
        Row: {
          id: string;
          first_name: string;
          surname: string;
          gender: string;
          date_of_birth: string | null;
          ipf_member_id: string | null;
          club: string | null;
          country: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          surname: string;
          gender: string;
          date_of_birth?: string | null;
          ipf_member_id?: string | null;
          club?: string | null;
          country?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          surname?: string;
          gender?: string;
          date_of_birth?: string | null;
          ipf_member_id?: string | null;
          club?: string | null;
          country?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      entries: {
        Row: {
          id: string;
          competition_id: string;
          lifter_id: string;
          weight_class_id: string | null;
          division_id: string | null;
          flight_id: string | null;
          lot_number: number | null;
          bodyweight_kg: number | null;
          opener_squat_kg: number | null;
          opener_bench_kg: number | null;
          opener_deadlift_kg: number | null;
          rack_height_squat: string | null;
          rack_height_bench: string | null;
          status: Database['public']['Enums']['entry_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          lifter_id: string;
          weight_class_id?: string | null;
          division_id?: string | null;
          flight_id?: string | null;
          lot_number?: number | null;
          bodyweight_kg?: number | null;
          opener_squat_kg?: number | null;
          opener_bench_kg?: number | null;
          opener_deadlift_kg?: number | null;
          rack_height_squat?: string | null;
          rack_height_bench?: string | null;
          status?: Database['public']['Enums']['entry_status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          lifter_id?: string;
          weight_class_id?: string | null;
          division_id?: string | null;
          flight_id?: string | null;
          lot_number?: number | null;
          bodyweight_kg?: number | null;
          opener_squat_kg?: number | null;
          opener_bench_kg?: number | null;
          opener_deadlift_kg?: number | null;
          rack_height_squat?: string | null;
          rack_height_bench?: string | null;
          status?: Database['public']['Enums']['entry_status'];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      attempts: {
        Row: {
          id: string;
          competition_id: string;
          entry_id: string;
          lift: Database['public']['Enums']['lift_type'];
          attempt_number: number;
          weight_kg: number | null;
          declared_at: string | null;
          result: Database['public']['Enums']['attempt_result'];
          is_record_attempt: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          entry_id: string;
          lift: Database['public']['Enums']['lift_type'];
          attempt_number: number;
          weight_kg?: number | null;
          declared_at?: string | null;
          result?: Database['public']['Enums']['attempt_result'];
          is_record_attempt?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          entry_id?: string;
          lift?: Database['public']['Enums']['lift_type'];
          attempt_number?: number;
          weight_kg?: number | null;
          declared_at?: string | null;
          result?: Database['public']['Enums']['attempt_result'];
          is_record_attempt?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      referee_decisions: {
        Row: {
          id: string;
          competition_id: string;
          attempt_id: string;
          position: Database['public']['Enums']['ref_position'];
          decision: Database['public']['Enums']['ref_decision'];
          reasons: string[];
          referee_user_id: string | null;
          decided_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          attempt_id: string;
          position: Database['public']['Enums']['ref_position'];
          decision: Database['public']['Enums']['ref_decision'];
          reasons?: string[];
          referee_user_id?: string | null;
          decided_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          attempt_id?: string;
          position?: Database['public']['Enums']['ref_position'];
          decision?: Database['public']['Enums']['ref_decision'];
          reasons?: string[];
          referee_user_id?: string | null;
          decided_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      comp_roles: {
        Row: {
          id: string;
          competition_id: string;
          user_id: string;
          role: Database['public']['Enums']['comp_role'];
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          user_id: string;
          role: Database['public']['Enums']['comp_role'];
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          user_id?: string;
          role?: Database['public']['Enums']['comp_role'];
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      attempt_result: 'pending' | 'good_lift' | 'no_lift' | 'not_taken' | 'withdrawn';
      comp_role:
        | 'meet_director'
        | 'scorekeeper'
        | 'table_loader'
        | 'referee'
        | 'jury'
        | 'announcer'
        | 'viewer';
      comp_status: 'draft' | 'published' | 'active' | 'completed';
      entry_status:
        | 'registered'
        | 'checked_in'
        | 'weighed_in'
        | 'lifting'
        | 'finished'
        | 'withdrawn'
        | 'disqualified';
      event_type: 'full_power' | 'bench_only' | 'deadlift_only';
      kit_type: 'classic' | 'equipped';
      lift_type: 'squat' | 'bench' | 'deadlift';
      ref_decision: 'white' | 'red';
      ref_position: 'left' | 'head' | 'right';
    };
    CompositeTypes: Record<string, never>;
  };
};
