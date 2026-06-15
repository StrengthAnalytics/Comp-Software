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
          is_team_competition: boolean;
          entry_form: Json;
          entry_form_open: boolean;
          rota_open: boolean;
          rota_withdrawal_contact: string | null;
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
          is_team_competition?: boolean;
          entry_form?: Json;
          entry_form_open?: boolean;
          rota_open?: boolean;
          rota_withdrawal_contact?: string | null;
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
          is_team_competition?: boolean;
          entry_form?: Json;
          entry_form_open?: boolean;
          rota_open?: boolean;
          rota_withdrawal_contact?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      age_categories: {
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
          weigh_in_time: string | null;
          lift_off_time: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          platform_id?: string | null;
          name: string;
          session_date?: string | null;
          weigh_in_time?: string | null;
          lift_off_time?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          platform_id?: string | null;
          name?: string;
          session_date?: string | null;
          weigh_in_time?: string | null;
          lift_off_time?: string | null;
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
      teams: {
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
          age_category_id: string | null;
          division: string | null;
          flight_id: string | null;
          team_id: string | null;
          team_lift: Database['public']['Enums']['lift_type'] | null;
          lot_number: number | null;
          bodyweight_kg: number | null;
          opener_squat_kg: number | null;
          opener_bench_kg: number | null;
          opener_deadlift_kg: number | null;
          rack_height_squat: number | null;
          squat_rack_setting: Database['public']['Enums']['squat_rack_setting'] | null;
          rack_height_bench: number | null;
          bench_safety_height: number | null;
          bench_spotting: Database['public']['Enums']['bench_spotting'] | null;
          racks_set: boolean;
          status: Database['public']['Enums']['entry_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          lifter_id: string;
          weight_class_id?: string | null;
          age_category_id?: string | null;
          division?: string | null;
          flight_id?: string | null;
          team_id?: string | null;
          team_lift?: Database['public']['Enums']['lift_type'] | null;
          lot_number?: number | null;
          bodyweight_kg?: number | null;
          opener_squat_kg?: number | null;
          opener_bench_kg?: number | null;
          opener_deadlift_kg?: number | null;
          rack_height_squat?: number | null;
          squat_rack_setting?: Database['public']['Enums']['squat_rack_setting'] | null;
          rack_height_bench?: number | null;
          bench_safety_height?: number | null;
          bench_spotting?: Database['public']['Enums']['bench_spotting'] | null;
          racks_set?: boolean;
          status?: Database['public']['Enums']['entry_status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          lifter_id?: string;
          weight_class_id?: string | null;
          age_category_id?: string | null;
          division?: string | null;
          flight_id?: string | null;
          team_id?: string | null;
          team_lift?: Database['public']['Enums']['lift_type'] | null;
          lot_number?: number | null;
          bodyweight_kg?: number | null;
          opener_squat_kg?: number | null;
          opener_bench_kg?: number | null;
          opener_deadlift_kg?: number | null;
          rack_height_squat?: number | null;
          squat_rack_setting?: Database['public']['Enums']['squat_rack_setting'] | null;
          rack_height_bench?: number | null;
          bench_safety_height?: number | null;
          bench_spotting?: Database['public']['Enums']['bench_spotting'] | null;
          racks_set?: boolean;
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
          decided_at: string | null;
          result: Database['public']['Enums']['attempt_result'];
          is_record_attempt: boolean;
          weight_changes: number;
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
          decided_at?: string | null;
          result?: Database['public']['Enums']['attempt_result'];
          is_record_attempt?: boolean;
          weight_changes?: number;
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
          decided_at?: string | null;
          result?: Database['public']['Enums']['attempt_result'];
          is_record_attempt?: boolean;
          weight_changes?: number;
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
      entry_submissions: {
        Row: {
          id: string;
          competition_id: string;
          status: string;
          first_name: string;
          surname: string;
          gender: string;
          date_of_birth: string;
          club: string | null;
          ipf_member_id: string | null;
          division: string | null;
          weight_class: string | null;
          predicted_total_kg: number | null;
          recent_best_total_kg: number | null;
          kit_choice: string | null;
          event_choice: string | null;
          instagram: string | null;
          email: string | null;
          phone: string | null;
          disclaimer_accepted_at: string | null;
          entry_id: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          status?: string;
          first_name: string;
          surname?: string;
          gender: string;
          date_of_birth: string;
          club?: string | null;
          ipf_member_id?: string | null;
          division?: string | null;
          weight_class?: string | null;
          predicted_total_kg?: number | null;
          recent_best_total_kg?: number | null;
          kit_choice?: string | null;
          event_choice?: string | null;
          instagram?: string | null;
          email?: string | null;
          phone?: string | null;
          disclaimer_accepted_at?: string | null;
          entry_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          status?: string;
          first_name?: string;
          surname?: string;
          gender?: string;
          date_of_birth?: string;
          club?: string | null;
          ipf_member_id?: string | null;
          division?: string | null;
          weight_class?: string | null;
          predicted_total_kg?: number | null;
          recent_best_total_kg?: number | null;
          kit_choice?: string | null;
          event_choice?: string | null;
          instagram?: string | null;
          email?: string | null;
          phone?: string | null;
          disclaimer_accepted_at?: string | null;
          entry_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      records: {
        Row: {
          id: string;
          region: string;
          name: string;
          gender: string;
          weight_class: string;
          age_category: string;
          lift: Database['public']['Enums']['record_lift'];
          equipment: Database['public']['Enums']['record_equipment'];
          weight_kg: number;
          date_set: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          region: string;
          name: string;
          gender: string;
          weight_class: string;
          age_category: string;
          lift: Database['public']['Enums']['record_lift'];
          equipment: Database['public']['Enums']['record_equipment'];
          weight_kg: number;
          date_set?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          region?: string;
          name?: string;
          gender?: string;
          weight_class?: string;
          age_category?: string;
          lift?: Database['public']['Enums']['record_lift'];
          equipment?: Database['public']['Enums']['record_equipment'];
          weight_kg?: number;
          date_set?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rota_sections: {
        Row: {
          id: string;
          competition_id: string;
          session_id: string | null;
          day_label: string | null;
          title: string;
          subtitle: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          session_id?: string | null;
          day_label?: string | null;
          title: string;
          subtitle?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          session_id?: string | null;
          day_label?: string | null;
          title?: string;
          subtitle?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      rota_roles: {
        Row: {
          id: string;
          competition_id: string;
          section_id: string;
          title: string;
          arrive_by: string | null;
          capacity: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          section_id: string;
          title: string;
          arrive_by?: string | null;
          capacity?: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          section_id?: string;
          title?: string;
          arrive_by?: string | null;
          capacity?: number;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      rota_signups: {
        Row: {
          id: string;
          competition_id: string;
          role_id: string;
          name: string;
          email: string;
          phone: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          role_id: string;
          name: string;
          email: string;
          phone: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          role_id?: string;
          name?: string;
          email?: string;
          phone?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      // Public-safe lifter projection (no DOB, no IPF member ID). Columns are nullable to match
      // what Supabase's type generator emits for views. See migration 11.
      public_lifters: {
        Row: {
          id: string | null;
          first_name: string | null;
          surname: string | null;
          gender: string | null;
          club: string | null;
          country: string | null;
        };
        Relationships: [];
      };
      // Public-safe rota sign-ups: name + which slot only, never email/phone. Rows limited to
      // rota-open comps. Columns nullable to match Supabase's view type generation. See migration
      // 20260615000001.
      public_rota_signups: {
        Row: {
          id: string | null;
          competition_id: string | null;
          role_id: string | null;
          name: string | null;
        };
        Relationships: [];
      };
      // Minimal public identity of a rota-open comp, so the public board header renders even while
      // the comp is still a draft, without exposing the rest of the competitions row.
      public_rota_comps: {
        Row: {
          id: string | null;
          slug: string | null;
          name: string | null;
          starts_on: string | null;
          ends_on: string | null;
          rota_open: boolean | null;
          rota_withdrawal_contact: string | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: {
      attempt_result: 'pending' | 'good_lift' | 'no_lift' | 'not_taken' | 'withdrawn';
      bench_spotting: 'self' | 'hand_out';
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
      record_equipment: 'equipped' | 'unequipped';
      record_lift: 'squat' | 'bench_press' | 'bench_press_ac' | 'deadlift' | 'total';
      ref_decision: 'white' | 'red';
      ref_position: 'left' | 'head' | 'right';
      squat_rack_setting: 'in' | 'out' | 'left_in' | 'right_in';
    };
    CompositeTypes: Record<string, never>;
  };
};
