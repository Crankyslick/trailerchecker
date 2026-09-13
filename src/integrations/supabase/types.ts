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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          contact_info: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_info?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          contact_info?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          phone: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_org_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          parent_tenant_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          parent_tenant_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_tenant_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_parent_tenant_id_fkey"
            columns: ["parent_tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_trailer_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          load_id: string | null
          notes: string | null
          tenant_id: string | null
          trailer_number: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          load_id?: string | null
          notes?: string | null
          tenant_id?: string | null
          trailer_number?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          load_id?: string | null
          notes?: string | null
          tenant_id?: string | null
          trailer_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_events_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_events_org_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_yard_check_ins: {
        Row: {
          arrival_at: string
          checked_out_at: string | null
          created_at: string
          id: string
          inbound_load_id: string | null
          note: string | null
          tenant_id: string | null
          trailer_number: string
        }
        Insert: {
          arrival_at?: string
          checked_out_at?: string | null
          created_at?: string
          id?: string
          inbound_load_id?: string | null
          note?: string | null
          tenant_id?: string | null
          trailer_number: string
        }
        Update: {
          arrival_at?: string
          checked_out_at?: string | null
          created_at?: string
          id?: string
          inbound_load_id?: string | null
          note?: string | null
          tenant_id?: string | null
          trailer_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "yard_check_ins_org_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loads: {
        Row: {
          alert_status: string | null
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          carrier_comments: string | null
          category: string | null
          client_id: string | null
          comments: string | null
          created_at: string
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          has_sweep: boolean | null
          id: string
          invoiced: boolean | null
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["legacy_trailer_location"]
            | null
          schedule_date: string | null
          schedule_id: string
          status: Database["public"]["Enums"]["load_status"] | null
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          target_load_id: string | null
          tenant_id: string | null
          total_distance: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          yard_arrival_at: string | null
        }
        Insert: {
          alert_status?: string | null
          arrival_date?: string | null
          arrival_day?: string | null
          arrival_time?: string | null
          carrier_comments?: string | null
          category?: string | null
          client_id?: string | null
          comments?: string | null
          created_at?: string
          cutoff_date?: string | null
          cutoff_day?: string | null
          cutoff_time?: string | null
          delivery_defect_reason?: string | null
          delivery_sequence?: number | null
          driver?: string | null
          expected_delivery?: string | null
          expected_pickup?: string | null
          has_sweep?: boolean | null
          id?: string
          invoiced?: boolean | null
          origin_id?: string | null
          origin_name?: string | null
          outbound_trailer?: string | null
          pickup_defect_reason?: string | null
          pro_number?: string | null
          return_trailer?: string | null
          return_trailer_location?:
            | Database["public"]["Enums"]["legacy_trailer_location"]
            | null
          schedule_date?: string | null
          schedule_id: string
          status?: Database["public"]["Enums"]["load_status"] | null
          str_name?: string | null
          str_number?: string | null
          str_return_trailer_started_at?: string | null
          str_trl_location?: string | null
          target_load_id?: string | null
          tenant_id?: string | null
          total_distance?: string | null
          trip_id?: string | null
          trl_location_code?: string | null
          unload_date?: string | null
          unload_day?: string | null
          unload_time?: string | null
          unload_type?: string | null
          updated_at?: string
          updated_by?: string | null
          yard_arrival_at?: string | null
        }
        Update: {
          alert_status?: string | null
          arrival_date?: string | null
          arrival_day?: string | null
          arrival_time?: string | null
          carrier_comments?: string | null
          category?: string | null
          client_id?: string | null
          comments?: string | null
          created_at?: string
          cutoff_date?: string | null
          cutoff_day?: string | null
          cutoff_time?: string | null
          delivery_defect_reason?: string | null
          delivery_sequence?: number | null
          driver?: string | null
          expected_delivery?: string | null
          expected_pickup?: string | null
          has_sweep?: boolean | null
          id?: string
          invoiced?: boolean | null
          origin_id?: string | null
          origin_name?: string | null
          outbound_trailer?: string | null
          pickup_defect_reason?: string | null
          pro_number?: string | null
          return_trailer?: string | null
          return_trailer_location?:
            | Database["public"]["Enums"]["legacy_trailer_location"]
            | null
          schedule_date?: string | null
          schedule_id?: string
          status?: Database["public"]["Enums"]["load_status"] | null
          str_name?: string | null
          str_number?: string | null
          str_return_trailer_started_at?: string | null
          str_trl_location?: string | null
          target_load_id?: string | null
          tenant_id?: string | null
          total_distance?: string | null
          trip_id?: string | null
          trl_location_code?: string | null
          unload_date?: string | null
          unload_day?: string | null
          unload_time?: string | null
          unload_type?: string | null
          updated_at?: string
          updated_by?: string | null
          yard_arrival_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_org_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_config: {
        Row: {
          endpoint_url: string | null
          id: number
          last_synced_at: string | null
          sheet_name: string | null
          spreadsheet_id: string | null
          tenant_id: string | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          endpoint_url?: string | null
          id?: number
          last_synced_at?: string | null
          sheet_name?: string | null
          spreadsheet_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          endpoint_url?: string | null
          id?: number
          last_synced_at?: string | null
          sheet_name?: string | null
          spreadsheet_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_config_org_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          onboarded: boolean
          plan: string
          updated_at: string
          yard_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          onboarded?: boolean
          plan?: string
          updated_at?: string
          yard_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          onboarded?: boolean
          plan?: string
          updated_at?: string
          yard_count?: number
        }
        Relationships: []
      }
      trailer_clients: {
        Row: {
          company_id: string | null
          contact_info: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          contact_info?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_info?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          load_id: string | null
          note: string | null
          trailer_number: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          load_id?: string | null
          note?: string | null
          trailer_number?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          load_id?: string | null
          note?: string | null
          trailer_number?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_events_load_id_fkey1"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_loads: {
        Row: {
          alert_status: string | null
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          carrier_comments: string | null
          category: string | null
          client_id: string | null
          comments: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          driver_id: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          has_sweep: boolean
          id: string
          invoiced: boolean | null
          legacy_load_id: string | null
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          schedule_date: string | null
          schedule_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          target_load_id: string | null
          total_distance: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          yard_arrival_at: string | null
        }
        Insert: {
          alert_status?: string | null
          arrival_date?: string | null
          arrival_day?: string | null
          arrival_time?: string | null
          carrier_comments?: string | null
          category?: string | null
          client_id?: string | null
          comments?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          cutoff_date?: string | null
          cutoff_day?: string | null
          cutoff_time?: string | null
          delivery_defect_reason?: string | null
          delivery_sequence?: number | null
          driver?: string | null
          driver_id?: string | null
          expected_delivery?: string | null
          expected_pickup?: string | null
          has_sweep?: boolean
          id?: string
          invoiced?: boolean | null
          legacy_load_id?: string | null
          origin_id?: string | null
          origin_name?: string | null
          outbound_trailer?: string | null
          pickup_defect_reason?: string | null
          pro_number?: string | null
          return_trailer?: string | null
          return_trailer_location?:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          schedule_date?: string | null
          schedule_id: string
          status?: Database["public"]["Enums"]["trailer_load_status"]
          str_name?: string | null
          str_number?: string | null
          str_return_trailer_started_at?: string | null
          str_trl_location?: string | null
          target_load_id?: string | null
          total_distance?: string | null
          trip_id?: string | null
          trl_location_code?: string | null
          unload_date?: string | null
          unload_day?: string | null
          unload_time?: string | null
          unload_type?: string | null
          updated_at?: string
          updated_by?: string | null
          yard_arrival_at?: string | null
        }
        Update: {
          alert_status?: string | null
          arrival_date?: string | null
          arrival_day?: string | null
          arrival_time?: string | null
          carrier_comments?: string | null
          category?: string | null
          client_id?: string | null
          comments?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          cutoff_date?: string | null
          cutoff_day?: string | null
          cutoff_time?: string | null
          delivery_defect_reason?: string | null
          delivery_sequence?: number | null
          driver?: string | null
          driver_id?: string | null
          expected_delivery?: string | null
          expected_pickup?: string | null
          has_sweep?: boolean
          id?: string
          invoiced?: boolean | null
          legacy_load_id?: string | null
          origin_id?: string | null
          origin_name?: string | null
          outbound_trailer?: string | null
          pickup_defect_reason?: string | null
          pro_number?: string | null
          return_trailer?: string | null
          return_trailer_location?:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          schedule_date?: string | null
          schedule_id?: string
          status?: Database["public"]["Enums"]["trailer_load_status"]
          str_name?: string | null
          str_number?: string | null
          str_return_trailer_started_at?: string | null
          str_trl_location?: string | null
          target_load_id?: string | null
          total_distance?: string | null
          trip_id?: string | null
          trl_location_code?: string | null
          unload_date?: string | null
          unload_day?: string | null
          unload_time?: string | null
          unload_type?: string | null
          updated_at?: string
          updated_by?: string | null
          yard_arrival_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_loads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_sync_config: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          last_sync_status: string | null
          last_synced_at: string | null
          sheet_name: string | null
          spreadsheet_id: string | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          last_sync_status?: string | null
          last_synced_at?: string | null
          sheet_name?: string | null
          spreadsheet_id?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          last_sync_status?: string | null
          last_synced_at?: string | null
          sheet_name?: string | null
          spreadsheet_id?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_sync_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      yard_check_ins: {
        Row: {
          arrival_at: string
          checked_out_at: string | null
          company_id: string | null
          created_at: string
          id: string
          inbound_load_id: string | null
          note: string | null
          trailer_number: string
        }
        Insert: {
          arrival_at?: string
          checked_out_at?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          inbound_load_id?: string | null
          note?: string | null
          trailer_number: string
        }
        Update: {
          arrival_at?: string
          checked_out_at?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          inbound_load_id?: string | null
          note?: string | null
          trailer_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "yard_check_ins_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yard_check_ins_inbound_load_id_fkey"
            columns: ["inbound_load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_dispatch: { Args: never; Returns: boolean }
      current_company_id: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      current_user_has_any_role: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_dispatcher_or_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "dispatcher"
        | "guard"
        | "billing"
        | "driver"
        | "owner"
      legacy_trailer_location:
        | "DC"
        | "Store"
        | "Returning"
        | "Yard"
        | "Returned To DC"
      load_status:
        | "Assigned"
        | "Heading To DC"
        | "Loaded"
        | "En Route"
        | "Delivered"
        | "Picked Up Return Trailer"
        | "Returning"
        | "At Yard"
        | "Returned To DC"
        | "Completed"
        | "Delayed"
        | "Exception"
      trailer_load_status:
        | "Assigned"
        | "Heading To DC"
        | "Loaded"
        | "En Route"
        | "Delivered"
        | "Picked Up Return Trailer"
        | "Returning"
        | "At Yard"
        | "Returned To DC"
        | "Completed"
        | "Delayed"
        | "Exception"
      trailer_location: "DC" | "Store" | "Returning" | "Yard" | "Returned To DC"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "dispatcher", "guard", "billing", "driver", "owner"],
      legacy_trailer_location: [
        "DC",
        "Store",
        "Returning",
        "Yard",
        "Returned To DC",
      ],
      load_status: [
        "Assigned",
        "Heading To DC",
        "Loaded",
        "En Route",
        "Delivered",
        "Picked Up Return Trailer",
        "Returning",
        "At Yard",
        "Returned To DC",
        "Completed",
        "Delayed",
        "Exception",
      ],
      trailer_load_status: [
        "Assigned",
        "Heading To DC",
        "Loaded",
        "En Route",
        "Delivered",
        "Picked Up Return Trailer",
        "Returning",
        "At Yard",
        "Returned To DC",
        "Completed",
        "Delayed",
        "Exception",
      ],
      trailer_location: ["DC", "Store", "Returning", "Yard", "Returned To DC"],
    },
  },
} as const
