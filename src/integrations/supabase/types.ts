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
      loads: {
        Row: {
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          comments: string | null
          created_at: string
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_sequence: number | null
          driver: string | null
          has_sweep: boolean | null
          id: string
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          schedule_date: string | null
          schedule_id: string
          status: Database["public"]["Enums"]["load_status"] | null
          str_name: string | null
          str_number: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          yard_arrival_at: string | null
        }
        Insert: {
          arrival_date?: string | null
          arrival_day?: string | null
          arrival_time?: string | null
          comments?: string | null
          created_at?: string
          cutoff_date?: string | null
          cutoff_day?: string | null
          cutoff_time?: string | null
          delivery_sequence?: number | null
          driver?: string | null
          has_sweep?: boolean | null
          id?: string
          origin_id?: string | null
          origin_name?: string | null
          outbound_trailer?: string | null
          return_trailer?: string | null
          return_trailer_location?:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          schedule_date?: string | null
          schedule_id: string
          status?: Database["public"]["Enums"]["load_status"] | null
          str_name?: string | null
          str_number?: string | null
          unload_date?: string | null
          unload_day?: string | null
          unload_time?: string | null
          unload_type?: string | null
          updated_at?: string
          yard_arrival_at?: string | null
        }
        Update: {
          arrival_date?: string | null
          arrival_day?: string | null
          arrival_time?: string | null
          comments?: string | null
          created_at?: string
          cutoff_date?: string | null
          cutoff_day?: string | null
          cutoff_time?: string | null
          delivery_sequence?: number | null
          driver?: string | null
          has_sweep?: boolean | null
          id?: string
          origin_id?: string | null
          origin_name?: string | null
          outbound_trailer?: string | null
          return_trailer?: string | null
          return_trailer_location?:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          schedule_date?: string | null
          schedule_id?: string
          status?: Database["public"]["Enums"]["load_status"] | null
          str_name?: string | null
          str_number?: string | null
          unload_date?: string | null
          unload_day?: string | null
          unload_time?: string | null
          unload_type?: string | null
          updated_at?: string
          yard_arrival_at?: string | null
        }
        Relationships: []
      }
      trailer_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          load_id: string | null
          notes: string | null
          trailer_number: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          load_id?: string | null
          notes?: string | null
          trailer_number?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          load_id?: string | null
          notes?: string | null
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      trailer_location: ["DC", "Store", "Returning", "Yard", "Returned To DC"],
    },
  },
} as const
