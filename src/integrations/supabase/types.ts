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
      accessorials: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          billable_to: string
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          load_id: string
          rejected_reason: string | null
          status: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          billable_to?: string
          code: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          load_id: string
          rejected_reason?: string | null
          status?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          billable_to?: string
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          load_id?: string
          rejected_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "accessorials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessorials_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "accessorials_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_state: {
        Row: {
          alert_type: string
          company_id: string
          id: string
          load_id: string
          raised_at: string
          resolved_at: string | null
        }
        Insert: {
          alert_type: string
          company_id: string
          id?: string
          load_id: string
          raised_at?: string
          resolved_at?: string | null
        }
        Update: {
          alert_type?: string
          company_id?: string
          id?: string
          load_id?: string
          raised_at?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_state_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_state_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "alert_state_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          company_id: string
          confirmation_number: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          rescheduled_from_appointment_id: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          stop_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          confirmation_number?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          rescheduled_from_appointment_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          stop_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          confirmation_number?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          rescheduled_from_appointment_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          stop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_appointment_id_fkey"
            columns: ["rescheduled_from_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      brokers: {
        Row: {
          active: boolean
          company_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          mc_number: string | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          mc_number?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          mc_number?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brokers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_settlement_lines: {
        Row: {
          amount: number
          description: string
          id: string
          load_id: string
          settlement_id: string
        }
        Insert: {
          amount: number
          description: string
          id?: string
          load_id: string
          settlement_id: string
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          load_id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_settlement_lines_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "carrier_settlement_lines_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_settlement_lines_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "carrier_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_settlements: {
        Row: {
          carrier_id: string
          company_id: string
          created_at: string
          id: string
          paid_at: string | null
          settlement_number: string
          status: string
          total_amount: number
        }
        Insert: {
          carrier_id: string
          company_id?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          settlement_number: string
          status?: string
          total_amount?: number
        }
        Update: {
          carrier_id?: string
          company_id?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          settlement_number?: string
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "carrier_settlements_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_settlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          active: boolean
          company_id: string
          contact_email: string | null
          contact_info: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          dot_number: string | null
          id: string
          mc_number: string | null
          name: string
          scac_code: string | null
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          contact_email?: string | null
          contact_info?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          dot_number?: string | null
          id?: string
          mc_number?: string | null
          name: string
          scac_code?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          contact_email?: string | null
          contact_info?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          dot_number?: string | null
          id?: string
          mc_number?: string | null
          name?: string
          scac_code?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carriers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chassis: {
        Row: {
          chassis_number: string
          created_at: string
          id: string
          pool_provider: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          chassis_number: string
          created_at?: string
          id?: string
          pool_provider?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          chassis_number?: string
          created_at?: string
          id?: string
          pool_provider?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chassis_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
          dispatch_phone: string | null
          dot_number: string | null
          id: string
          mc_number: string | null
          name: string
          slug: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dispatch_phone?: string | null
          dot_number?: string | null
          id?: string
          mc_number?: string | null
          name: string
          slug?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dispatch_phone?: string | null
          dot_number?: string | null
          id?: string
          mc_number?: string | null
          name?: string
          slug?: string | null
          tenant_id?: string
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
      company_setting_events: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_setting_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          business_model: string
          company_id: string
          created_at: string
          operating_dot_number: string | null
          operating_mc_number: string | null
          updated_at: string
          yard_critical_hours: number
          yard_deadline_hours: number
        }
        Insert: {
          business_model?: string
          company_id: string
          created_at?: string
          operating_dot_number?: string | null
          operating_mc_number?: string | null
          updated_at?: string
          yard_critical_hours?: number
          yard_deadline_hours?: number
        }
        Update: {
          business_model?: string
          company_id?: string
          created_at?: string
          operating_dot_number?: string | null
          operating_mc_number?: string | null
          updated_at?: string
          yard_critical_hours?: number
          yard_deadline_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_sites: {
        Row: {
          active: boolean
          address_line: string | null
          city: string | null
          code: string | null
          company_id: string
          contact_phone: string | null
          created_at: string
          gate_hours: string | null
          geofence_radius_m: number | null
          id: string
          is_default: boolean
          kind: string
          latitude: number | null
          longitude: number | null
          name: string
          postal_code: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address_line?: string | null
          city?: string | null
          code?: string | null
          company_id?: string
          contact_phone?: string | null
          created_at?: string
          gate_hours?: string | null
          geofence_radius_m?: number | null
          id?: string
          is_default?: boolean
          kind?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address_line?: string | null
          city?: string | null
          code?: string | null
          company_id?: string
          contact_phone?: string | null
          created_at?: string
          gate_hours?: string | null
          geofence_radius_m?: number | null
          id?: string
          is_default?: boolean
          kind?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      container_events: {
        Row: {
          container_id: string
          created_at: string
          event_type: string
          id: string
          note: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          container_id: string
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Update: {
          container_id?: string
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "container_events_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "container_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      containers: {
        Row: {
          appointment_at: string | null
          bill_of_lading: string | null
          chassis_id: string | null
          chassis_number: string | null
          client_id: string | null
          container_number: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivered_at: string | null
          delivery_location: string | null
          detention_free_days: number
          discharged_at: string | null
          driver_id: string | null
          eta: string | null
          id: string
          invoiced: boolean
          last_free_day: string | null
          notes: string | null
          picked_up_at: string | null
          pickup_location: string | null
          port_terminal: string | null
          rate: number | null
          returned_at: string | null
          size: string | null
          status: Database["public"]["Enums"]["container_status"]
          steamship_line: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          appointment_at?: string | null
          bill_of_lading?: string | null
          chassis_id?: string | null
          chassis_number?: string | null
          client_id?: string | null
          container_number: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          delivery_location?: string | null
          detention_free_days?: number
          discharged_at?: string | null
          driver_id?: string | null
          eta?: string | null
          id?: string
          invoiced?: boolean
          last_free_day?: string | null
          notes?: string | null
          picked_up_at?: string | null
          pickup_location?: string | null
          port_terminal?: string | null
          rate?: number | null
          returned_at?: string | null
          size?: string | null
          status?: Database["public"]["Enums"]["container_status"]
          steamship_line?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          appointment_at?: string | null
          bill_of_lading?: string | null
          chassis_id?: string | null
          chassis_number?: string | null
          client_id?: string | null
          container_number?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          delivery_location?: string | null
          detention_free_days?: number
          discharged_at?: string | null
          driver_id?: string | null
          eta?: string | null
          id?: string
          invoiced?: boolean
          last_free_day?: string | null
          notes?: string | null
          picked_up_at?: string | null
          pickup_location?: string | null
          port_terminal?: string | null
          rate?: number | null
          returned_at?: string | null
          size?: string | null
          status?: Database["public"]["Enums"]["container_status"]
          steamship_line?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "containers_chassis_id_fkey"
            columns: ["chassis_id"]
            isOneToOne: false
            referencedRelation: "chassis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invoice_lines: {
        Row: {
          amount: number
          description: string
          id: string
          invoice_id: string
          load_id: string
        }
        Insert: {
          amount: number
          description: string
          id?: string
          invoice_id: string
          load_id: string
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          load_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoice_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoice_lines_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "customer_invoice_lines_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invoices: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          dispute_reason: string | null
          dispute_resolved_at: string | null
          disputed_at: string | null
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          paid_at: string | null
          qbo_invoice_id: string | null
          qbo_sync_error: string | null
          qbo_sync_status: string
          qbo_synced_at: string | null
          status: string
          total_amount: number
        }
        Insert: {
          client_id: string
          company_id?: string
          created_at?: string
          dispute_reason?: string | null
          dispute_resolved_at?: string | null
          disputed_at?: string | null
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string | null
          paid_at?: string | null
          qbo_invoice_id?: string | null
          qbo_sync_error?: string | null
          qbo_sync_status?: string
          qbo_synced_at?: string | null
          status?: string
          total_amount?: number
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          dispute_reason?: string | null
          dispute_resolved_at?: string | null
          disputed_at?: string | null
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          paid_at?: string | null
          qbo_invoice_id?: string | null
          qbo_sync_error?: string | null
          qbo_sync_status?: string
          qbo_synced_at?: string | null
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_activity_log: {
        Row: {
          activity_type: string
          company_id: string
          created_at: string
          id: string
          load_id: string | null
          metadata: Json
          session_id: string
          user_id: string
        }
        Insert: {
          activity_type: string
          company_id?: string
          created_at?: string
          id?: string
          load_id?: string | null
          metadata?: Json
          session_id: string
          user_id: string
        }
        Update: {
          activity_type?: string
          company_id?: string
          created_at?: string
          id?: string
          load_id?: string | null
          metadata?: Json
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_activity_log_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "driver_activity_log_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_activity_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "driver_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_sessions: {
        Row: {
          app_version: string | null
          company_id: string
          created_at: string
          device_type: string | null
          ended_at: string | null
          id: string
          ip_address: unknown
          is_active: boolean
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          company_id: string
          created_at?: string
          device_type?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          company_id?: string
          created_at?: string
          device_type?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
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
      dvir_inspections: {
        Row: {
          brakes_ok: boolean
          cargo_securement_ok: boolean
          company_id: string
          coupling_devices_ok: boolean
          created_at: string
          defect_notes: string | null
          defects_found: boolean
          driver_id: string
          emergency_equipment_ok: boolean
          fluid_leaks_ok: boolean
          horn_ok: boolean
          id: string
          inspection_type: Database["public"]["Enums"]["dvir_inspection_type"]
          lights_reflectors_ok: boolean
          load_id: string
          mirrors_windshield_ok: boolean
          odometer_miles: number | null
          passed: boolean
          tires_wheels_ok: boolean
        }
        Insert: {
          brakes_ok: boolean
          cargo_securement_ok: boolean
          company_id?: string
          coupling_devices_ok: boolean
          created_at?: string
          defect_notes?: string | null
          defects_found?: boolean
          driver_id: string
          emergency_equipment_ok: boolean
          fluid_leaks_ok: boolean
          horn_ok: boolean
          id?: string
          inspection_type: Database["public"]["Enums"]["dvir_inspection_type"]
          lights_reflectors_ok: boolean
          load_id: string
          mirrors_windshield_ok: boolean
          odometer_miles?: number | null
          passed: boolean
          tires_wheels_ok: boolean
        }
        Update: {
          brakes_ok?: boolean
          cargo_securement_ok?: boolean
          company_id?: string
          coupling_devices_ok?: boolean
          created_at?: string
          defect_notes?: string | null
          defects_found?: boolean
          driver_id?: string
          emergency_equipment_ok?: boolean
          fluid_leaks_ok?: boolean
          horn_ok?: boolean
          id?: string
          inspection_type?: Database["public"]["Enums"]["dvir_inspection_type"]
          lights_reflectors_ok?: boolean
          load_id?: string
          mirrors_windshield_ok?: boolean
          odometer_miles?: number | null
          passed?: boolean
          tires_wheels_ok?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dvir_inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dvir_inspections_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dvir_inspections_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "dvir_inspections_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
        ]
      }
      edi_documents: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          direction: string
          id: string
          in_reply_to: string | null
          note: string | null
          parsed: Json | null
          raw_payload: string | null
          related_load_id: string | null
          status: string
          trading_partner: string
          transaction_set: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          in_reply_to?: string | null
          note?: string | null
          parsed?: Json | null
          raw_payload?: string | null
          related_load_id?: string | null
          status?: string
          trading_partner?: string
          transaction_set?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          in_reply_to?: string | null
          note?: string | null
          parsed?: Json | null
          raw_payload?: string | null
          related_load_id?: string | null
          status?: string
          trading_partner?: string
          transaction_set?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "edi_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edi_documents_in_reply_to_fkey"
            columns: ["in_reply_to"]
            isOneToOne: false
            referencedRelation: "edi_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edi_documents_related_load_id_fkey"
            columns: ["related_load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "edi_documents_related_load_id_fkey"
            columns: ["related_load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
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
      equipment: {
        Row: {
          company_id: string
          created_at: string
          equipment_number: string
          equipment_type: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          equipment_number: string
          equipment_type?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          equipment_number?: string
          equipment_type?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      exception_case_events: {
        Row: {
          actor_id: string | null
          case_id: string
          company_id: string
          created_at: string
          details: Json
          event_type: string
          id: string
        }
        Insert: {
          actor_id?: string | null
          case_id: string
          company_id: string
          created_at?: string
          details?: Json
          event_type: string
          id?: string
        }
        Update: {
          actor_id?: string | null
          case_id?: string
          company_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exception_case_events_case_company_fk"
            columns: ["case_id", "company_id"]
            isOneToOne: false
            referencedRelation: "exception_cases"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "exception_case_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      exception_case_evidence: {
        Row: {
          capture_source: string
          captured_at: string
          case_id: string
          company_id: string
          created_at: string
          created_by: string | null
          evidence_kind: string
          id: string
          metadata: Json
          note: string | null
          source_reference: string | null
          storage_path: string | null
        }
        Insert: {
          capture_source?: string
          captured_at?: string
          case_id: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          evidence_kind: string
          id?: string
          metadata?: Json
          note?: string | null
          source_reference?: string | null
          storage_path?: string | null
        }
        Update: {
          capture_source?: string
          captured_at?: string
          case_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          evidence_kind?: string
          id?: string
          metadata?: Json
          note?: string | null
          source_reference?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exception_case_evidence_case_company_fk"
            columns: ["case_id", "company_id"]
            isOneToOne: false
            referencedRelation: "exception_cases"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "exception_case_evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      exception_cases: {
        Row: {
          arrived_at: string | null
          carrier_amount_approved: number | null
          carrier_amount_claimed: number | null
          carrier_amount_paid: number | null
          carrier_claim_status: string
          carrier_rate_per_hour: number | null
          case_status: string
          company_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          customer_amount_approved: number | null
          customer_amount_claimed: number | null
          customer_amount_paid: number | null
          customer_claim_status: string
          customer_rate_per_hour: number | null
          departed_at: string | null
          description: string | null
          exception_type: string
          facility_name: string | null
          free_time_minutes: number | null
          id: string
          load_id: string
          metadata: Json
          occurred_at: string
          responsible_party: string
          stop_id: string | null
          trailer_number: string | null
          trailer_role: string
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          carrier_amount_approved?: number | null
          carrier_amount_claimed?: number | null
          carrier_amount_paid?: number | null
          carrier_claim_status?: string
          carrier_rate_per_hour?: number | null
          case_status?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_amount_approved?: number | null
          customer_amount_claimed?: number | null
          customer_amount_paid?: number | null
          customer_claim_status?: string
          customer_rate_per_hour?: number | null
          departed_at?: string | null
          description?: string | null
          exception_type: string
          facility_name?: string | null
          free_time_minutes?: number | null
          id?: string
          load_id: string
          metadata?: Json
          occurred_at?: string
          responsible_party?: string
          stop_id?: string | null
          trailer_number?: string | null
          trailer_role?: string
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          carrier_amount_approved?: number | null
          carrier_amount_claimed?: number | null
          carrier_amount_paid?: number | null
          carrier_claim_status?: string
          carrier_rate_per_hour?: number | null
          case_status?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_amount_approved?: number | null
          customer_amount_claimed?: number | null
          customer_amount_paid?: number | null
          customer_claim_status?: string
          customer_rate_per_hour?: number | null
          departed_at?: string | null
          description?: string | null
          exception_type?: string
          facility_name?: string | null
          free_time_minutes?: number | null
          id?: string
          load_id?: string
          metadata?: Json
          occurred_at?: string
          responsible_party?: string
          stop_id?: string | null
          trailer_number?: string | null
          trailer_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exception_cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_cases_load_company_fk"
            columns: ["load_id", "company_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id", "company_id"]
          },
          {
            foreignKeyName: "exception_cases_load_company_fk"
            columns: ["load_id", "company_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "exception_cases_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_presence: {
        Row: {
          company_id: string
          entered_at: string
          geofence_id: string
          load_id: string
        }
        Insert: {
          company_id: string
          entered_at: string
          geofence_id: string
          load_id: string
        }
        Update: {
          company_id?: string
          entered_at?: string
          geofence_id?: string
          load_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofence_presence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_presence_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_presence_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "geofence_presence_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
        ]
      }
      geofences: {
        Row: {
          center_lat: number
          center_lng: number
          company_id: string
          created_at: string
          id: string
          location_code: string | null
          name: string
          radius_meters: number
          updated_at: string
        }
        Insert: {
          center_lat: number
          center_lng: number
          company_id?: string
          created_at?: string
          id?: string
          location_code?: string | null
          name: string
          radius_meters?: number
          updated_at?: string
        }
        Update: {
          center_lat?: number
          center_lng?: number
          company_id?: string
          created_at?: string
          id?: string
          location_code?: string | null
          name?: string
          radius_meters?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_job_tokens: {
        Row: {
          created_at: string
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          name: string
          token: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
      legacy_trailer_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          load_id: string | null
          notes: string | null
          tenant_id: string
          trailer_number: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          load_id?: string | null
          notes?: string | null
          tenant_id?: string
          trailer_number?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          load_id?: string | null
          notes?: string | null
          tenant_id?: string
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
          tenant_id: string
          trailer_number: string
        }
        Insert: {
          arrival_at?: string
          checked_out_at?: string | null
          created_at?: string
          id?: string
          inbound_load_id?: string | null
          note?: string | null
          tenant_id?: string
          trailer_number: string
        }
        Update: {
          arrival_at?: string
          checked_out_at?: string | null
          created_at?: string
          id?: string
          inbound_load_id?: string | null
          note?: string | null
          tenant_id?: string
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
      legs: {
        Row: {
          company_id: string
          created_at: string
          destination_stop_id: string
          id: string
          leg_sequence: number
          origin_stop_id: string
          root_id: string
          shipment_id: string
          status: Database["public"]["Enums"]["leg_status"]
          superseded_by_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          destination_stop_id: string
          id?: string
          leg_sequence: number
          origin_stop_id: string
          root_id?: string
          shipment_id: string
          status?: Database["public"]["Enums"]["leg_status"]
          superseded_by_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          destination_stop_id?: string
          id?: string
          leg_sequence?: number
          origin_stop_id?: string
          root_id?: string
          shipment_id?: string
          status?: Database["public"]["Enums"]["leg_status"]
          superseded_by_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "legs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legs_destination_stop_id_fkey"
            columns: ["destination_stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legs_origin_stop_id_fkey"
            columns: ["origin_stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legs_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legs_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "legs"
            referencedColumns: ["id"]
          },
        ]
      }
      load_documents: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          document_type: string
          file_name: string | null
          id: string
          load_id: string
          note: string | null
          storage_path: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_name?: string | null
          id?: string
          load_id: string
          note?: string | null
          storage_path?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_name?: string | null
          id?: string
          load_id?: string
          note?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_documents_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "load_documents_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
      notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          role_target: Database["public"]["Enums"]["app_role"] | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          role_target?: Database["public"]["Enums"]["app_role"] | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          role_target?: Database["public"]["Enums"]["app_role"] | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_parties: {
        Row: {
          client_id: string | null
          company_id: string
          created_at: string
          dot_number: string | null
          email: string | null
          id: string
          mc_number: string | null
          name: string
          order_id: string
          party_role: string
          phone: string | null
          reference_number: string | null
          source: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          dot_number?: string | null
          email?: string | null
          id?: string
          mc_number?: string | null
          name: string
          order_id: string
          party_role: string
          phone?: string | null
          reference_number?: string | null
          source?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          dot_number?: string | null
          email?: string | null
          id?: string
          mc_number?: string | null
          name?: string
          order_id?: string
          party_role?: string
          phone?: string | null
          reference_number?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_parties_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_parties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_parties_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          bol_number: string | null
          client_id: string | null
          commodity_description: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_reference: string | null
          equipment_type: string | null
          external_load_number: string | null
          id: string
          order_number: string
          po_number: string | null
          ready_datetime: string | null
          requested_delivery_datetime: string | null
          root_id: string
          service_level: string | null
          status: Database["public"]["Enums"]["order_status"]
          superseded_by_id: string | null
          total_pallets: number | null
          total_pieces: number | null
          total_weight: number | null
          updated_at: string
          version: number
        }
        Insert: {
          bol_number?: string | null
          client_id?: string | null
          commodity_description?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_reference?: string | null
          equipment_type?: string | null
          external_load_number?: string | null
          id?: string
          order_number: string
          po_number?: string | null
          ready_datetime?: string | null
          requested_delivery_datetime?: string | null
          root_id?: string
          service_level?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          superseded_by_id?: string | null
          total_pallets?: number | null
          total_pieces?: number | null
          total_weight?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          bol_number?: string | null
          client_id?: string | null
          commodity_description?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_reference?: string | null
          equipment_type?: string | null
          external_load_number?: string | null
          id?: string
          order_number?: string
          po_number?: string | null
          ready_datetime?: string | null
          requested_delivery_datetime?: string | null
          root_id?: string
          service_level?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          superseded_by_id?: string | null
          total_pallets?: number | null
          total_pieces?: number | null
          total_weight?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      proof_of_delivery: {
        Row: {
          company_id: string
          created_by: string | null
          id: string
          load_id: string
          notes: string | null
          photo_path: string | null
          recipient_name: string
          signature_svg: string | null
          signed_at: string
        }
        Insert: {
          company_id?: string
          created_by?: string | null
          id?: string
          load_id: string
          notes?: string | null
          photo_path?: string | null
          recipient_name: string
          signature_svg?: string | null
          signed_at?: string
        }
        Update: {
          company_id?: string
          created_by?: string | null
          id?: string
          load_id?: string
          notes?: string | null
          photo_path?: string | null
          recipient_name?: string
          signature_svg?: string | null
          signed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proof_of_delivery_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "proof_of_delivery_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_account_mappings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          qbo_income_account: string | null
          qbo_item_name: string | null
          revenue_code: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          qbo_income_account?: string | null
          qbo_item_name?: string | null
          revenue_code: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          qbo_income_account?: string | null
          qbo_item_name?: string | null
          revenue_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_account_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_connections: {
        Row: {
          access_expires_at: string
          access_token: string
          company_id: string
          company_name: string | null
          connected_by: string | null
          created_at: string
          environment: string
          id: string
          last_synced_at: string | null
          realm_id: string
          refresh_expires_at: string | null
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_expires_at: string
          access_token: string
          company_id: string
          company_name?: string | null
          connected_by?: string | null
          created_at?: string
          environment?: string
          id?: string
          last_synced_at?: string | null
          realm_id: string
          refresh_expires_at?: string | null
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_expires_at?: string
          access_token?: string
          company_id?: string
          company_name?: string | null
          connected_by?: string | null
          created_at?: string
          environment?: string
          id?: string
          last_synced_at?: string | null
          realm_id?: string
          refresh_expires_at?: string | null
          refresh_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_oauth_states: {
        Row: {
          company_id: string
          created_at: string
          state: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          state: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          state?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qbo_oauth_states_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_agreements: {
        Row: {
          additional_stop_rate: number
          client_id: string | null
          company_id: string
          contract_number: string | null
          created_at: string
          destination_code: string | null
          effective_end: string | null
          effective_start: string
          fuel_surcharge_pct: number
          id: string
          linehaul_rate: number
          origin_code: string | null
          rate_type: string
          root_id: string
          superseded_by_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          additional_stop_rate?: number
          client_id?: string | null
          company_id?: string
          contract_number?: string | null
          created_at?: string
          destination_code?: string | null
          effective_end?: string | null
          effective_start?: string
          fuel_surcharge_pct?: number
          id?: string
          linehaul_rate: number
          origin_code?: string | null
          rate_type?: string
          root_id?: string
          superseded_by_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          additional_stop_rate?: number
          client_id?: string | null
          company_id?: string
          contract_number?: string | null
          created_at?: string
          destination_code?: string | null
          effective_end?: string | null
          effective_start?: string
          fuel_surcharge_pct?: number
          id?: string
          linehaul_rate?: number
          origin_code?: string | null
          rate_type?: string
          root_id?: string
          superseded_by_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rate_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_agreements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_agreements_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "rate_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_breaks: {
        Row: {
          id: string
          linehaul_rate: number
          max_weight: number | null
          min_weight: number
          rate_agreement_id: string
        }
        Insert: {
          id?: string
          linehaul_rate: number
          max_weight?: number | null
          min_weight?: number
          rate_agreement_id: string
        }
        Update: {
          id?: string
          linehaul_rate?: number
          max_weight?: number | null
          min_weight?: number
          rate_agreement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_breaks_rate_agreement_id_fkey"
            columns: ["rate_agreement_id"]
            isOneToOne: false
            referencedRelation: "rate_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_confirmation_imports: {
        Row: {
          business_key: string | null
          client_id: string | null
          company_id: string
          confidence: Json
          created_at: string
          duplicate_of_import_id: string | null
          extracted_at: string | null
          extracted_data: Json | null
          extraction_status: string
          failed_at: string | null
          failure_reason: string | null
          file_hash: string
          final_data: Json | null
          id: string
          import_status: string
          leg_ids: string[] | null
          normalized_data: Json | null
          order_id: string | null
          original_filename: string
          overrides: Json
          processed_at: string | null
          shipment_id: string | null
          source_type: string
          storage_path: string
          trailer_load_id: string | null
          updated_at: string
          uploaded_by_user_id: string | null
          validation_errors: Json
        }
        Insert: {
          business_key?: string | null
          client_id?: string | null
          company_id?: string
          confidence?: Json
          created_at?: string
          duplicate_of_import_id?: string | null
          extracted_at?: string | null
          extracted_data?: Json | null
          extraction_status?: string
          failed_at?: string | null
          failure_reason?: string | null
          file_hash: string
          final_data?: Json | null
          id?: string
          import_status?: string
          leg_ids?: string[] | null
          normalized_data?: Json | null
          order_id?: string | null
          original_filename: string
          overrides?: Json
          processed_at?: string | null
          shipment_id?: string | null
          source_type?: string
          storage_path: string
          trailer_load_id?: string | null
          updated_at?: string
          uploaded_by_user_id?: string | null
          validation_errors?: Json
        }
        Update: {
          business_key?: string | null
          client_id?: string | null
          company_id?: string
          confidence?: Json
          created_at?: string
          duplicate_of_import_id?: string | null
          extracted_at?: string | null
          extracted_data?: Json | null
          extraction_status?: string
          failed_at?: string | null
          failure_reason?: string | null
          file_hash?: string
          final_data?: Json | null
          id?: string
          import_status?: string
          leg_ids?: string[] | null
          normalized_data?: Json | null
          order_id?: string | null
          original_filename?: string
          overrides?: Json
          processed_at?: string | null
          shipment_id?: string | null
          source_type?: string
          storage_path?: string
          trailer_load_id?: string | null
          updated_at?: string
          uploaded_by_user_id?: string | null
          validation_errors?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rate_confirmation_imports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_confirmation_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_confirmation_imports_duplicate_of_import_id_fkey"
            columns: ["duplicate_of_import_id"]
            isOneToOne: false
            referencedRelation: "rate_confirmation_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_confirmation_imports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_confirmation_imports_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_confirmation_imports_trailer_load_id_fkey"
            columns: ["trailer_load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "rate_confirmation_imports_trailer_load_id_fkey"
            columns: ["trailer_load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_confirmations: {
        Row: {
          broker_id: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          document_url: string | null
          id: string
          issued_at: string
          operating_carrier_name: string | null
          operating_dot_number: string | null
          operating_mc_number: string | null
          rate_notes: string | null
          rc_number: string | null
          total_rate: number | null
          updated_at: string
        }
        Insert: {
          broker_id?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          id?: string
          issued_at?: string
          operating_carrier_name?: string | null
          operating_dot_number?: string | null
          operating_mc_number?: string | null
          rate_notes?: string | null
          rc_number?: string | null
          total_rate?: number | null
          updated_at?: string
        }
        Update: {
          broker_id?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          id?: string
          issued_at?: string
          operating_carrier_name?: string | null
          operating_dot_number?: string | null
          operating_mc_number?: string | null
          rate_notes?: string | null
          rc_number?: string | null
          total_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_confirmations_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_confirmations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_confirmations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_sync_outbox: {
        Row: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          last_error: string | null
          lease_expires_at: string | null
          match_column: string | null
          match_value: string | null
          next_attempt_at: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          last_error?: string | null
          lease_expires_at?: string | null
          match_column?: string | null
          match_value?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          lease_expires_at?: string | null
          match_column?: string | null
          match_value?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_sync_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_orders: {
        Row: {
          created_at: string
          id: string
          order_id: string
          shipment_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          shipment_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_orders_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          root_id: string
          shipment_number: string
          status: Database["public"]["Enums"]["shipment_status"]
          superseded_by_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          root_id?: string
          shipment_number: string
          status?: Database["public"]["Enums"]["shipment_status"]
          superseded_by_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          root_id?: string
          shipment_number?: string
          status?: Database["public"]["Enums"]["shipment_status"]
          superseded_by_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "shipments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      status_propagation_log: {
        Row: {
          cause_load_id: string | null
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          from_status: string | null
          id: string
          to_status: string
        }
        Insert: {
          cause_load_id?: string | null
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          from_status?: string | null
          id?: string
          to_status: string
        }
        Update: {
          cause_load_id?: string | null
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          from_status?: string | null
          id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_propagation_log_cause_load_id_fkey"
            columns: ["cause_load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "status_propagation_log_cause_load_id_fkey"
            columns: ["cause_load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_propagation_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stops: {
        Row: {
          address1: string | null
          address2: string | null
          city: string | null
          company_id: string
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          earliest_datetime: string | null
          id: string
          latest_datetime: string | null
          location_code: string | null
          location_name: string | null
          notes: string | null
          postal_code: string | null
          shipment_id: string
          state: string | null
          status: string
          stop_sequence: number
          stop_type: Database["public"]["Enums"]["stop_type"]
        }
        Insert: {
          address1?: string | null
          address2?: string | null
          city?: string | null
          company_id?: string
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          earliest_datetime?: string | null
          id?: string
          latest_datetime?: string | null
          location_code?: string | null
          location_name?: string | null
          notes?: string | null
          postal_code?: string | null
          shipment_id: string
          state?: string | null
          status?: string
          stop_sequence: number
          stop_type: Database["public"]["Enums"]["stop_type"]
        }
        Update: {
          address1?: string | null
          address2?: string | null
          city?: string | null
          company_id?: string
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          earliest_datetime?: string | null
          id?: string
          latest_datetime?: string | null
          location_code?: string | null
          location_name?: string | null
          notes?: string | null
          postal_code?: string | null
          shipment_id?: string
          state?: string | null
          status?: string
          stop_sequence?: number
          stop_type?: Database["public"]["Enums"]["stop_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stops_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stops_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
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
          tenant_id: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          endpoint_url?: string | null
          id?: number
          last_synced_at?: string | null
          sheet_name?: string | null
          spreadsheet_id?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          endpoint_url?: string | null
          id?: number
          last_synced_at?: string | null
          sheet_name?: string | null
          spreadsheet_id?: string | null
          tenant_id?: string
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
      sync_secrets: {
        Row: {
          company_id: string
          created_at: string
          edi_inbound_token: string | null
          id: string
          inbound_token: string | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          edi_inbound_token?: string | null
          id?: string
          inbound_token?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          edi_inbound_token?: string | null
          id?: string
          inbound_token?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_secrets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
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
      tenant_products: {
        Row: {
          created_at: string
          id: string
          product: Database["public"]["Enums"]["product_key"]
          status: string
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product: Database["public"]["Enums"]["product_key"]
          status?: string
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product?: Database["public"]["Enums"]["product_key"]
          status?: string
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_products_tenant_id_fkey"
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
      tenders: {
        Row: {
          carrier_id: string
          company_id: string
          expires_at: string | null
          id: string
          leg_id: string
          offered_at: string
          offered_rate: number | null
          responded_at: string | null
          response_notes: string | null
          response_token: string | null
          status: Database["public"]["Enums"]["tender_status"]
          token_expires_at: string | null
        }
        Insert: {
          carrier_id: string
          company_id?: string
          expires_at?: string | null
          id?: string
          leg_id: string
          offered_at?: string
          offered_rate?: number | null
          responded_at?: string | null
          response_notes?: string | null
          response_token?: string | null
          status?: Database["public"]["Enums"]["tender_status"]
          token_expires_at?: string | null
        }
        Update: {
          carrier_id?: string
          company_id?: string
          expires_at?: string | null
          id?: string
          leg_id?: string
          offered_at?: string
          offered_rate?: number | null
          responded_at?: string | null
          response_notes?: string | null
          response_token?: string | null
          status?: Database["public"]["Enums"]["tender_status"]
          token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenders_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenders_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "legs"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          asset_type: string | null
          company_id: string
          dedupe_key: string | null
          external_id: string
          heading_deg: number | null
          id: string
          latitude: number | null
          load_id: string | null
          longitude: number | null
          matched_by: string | null
          provider: string | null
          raw_payload: Json | null
          received_at: string
          recorded_at: string
          source: string
          speed_mph: number | null
        }
        Insert: {
          asset_type?: string | null
          company_id: string
          dedupe_key?: string | null
          external_id: string
          heading_deg?: number | null
          id?: string
          latitude?: number | null
          load_id?: string | null
          longitude?: number | null
          matched_by?: string | null
          provider?: string | null
          raw_payload?: Json | null
          received_at?: string
          recorded_at: string
          source?: string
          speed_mph?: number | null
        }
        Update: {
          asset_type?: string | null
          company_id?: string
          dedupe_key?: string | null
          external_id?: string
          heading_deg?: number | null
          id?: string
          latitude?: number | null
          load_id?: string | null
          longitude?: number | null
          matched_by?: string | null
          provider?: string | null
          raw_payload?: Json | null
          received_at?: string
          recorded_at?: string
          source?: string
          speed_mph?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "tracking_events_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
        ]
      }
      tractors: {
        Row: {
          company_id: string
          created_at: string
          id: string
          plate_number: string | null
          status: string
          unit_number: string
          updated_at: string
          vin: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          plate_number?: string | null
          status?: string
          unit_number: string
          updated_at?: string
          vin?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          plate_number?: string | null
          status?: string
          unit_number?: string
          updated_at?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tractors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_client_activities: {
        Row: {
          activity_type: string
          client_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
        }
        Insert: {
          activity_type: string
          client_id: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
        }
        Update: {
          activity_type?: string
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_client_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_client_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_client_contacts: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          title: string | null
        }
        Insert: {
          client_id: string
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          title?: string | null
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_client_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_clients: {
        Row: {
          company_id: string
          contact_info: string | null
          created_at: string
          credit_limit: number | null
          id: string
          name: string
          notes: string | null
          payment_terms_days: number
          qbo_customer_id: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string
          contact_info?: string | null
          created_at?: string
          credit_limit?: number | null
          id?: string
          name: string
          notes?: string | null
          payment_terms_days?: number
          qbo_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_info?: string | null
          created_at?: string
          credit_limit?: number | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms_days?: number
          qbo_customer_id?: string | null
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
          command_id: string | null
          created_at: string
          event_type: string
          event_version: number
          from_status: Database["public"]["Enums"]["trailer_load_status"] | null
          id: string
          load_id: string | null
          note: string | null
          source: string
          to_status: Database["public"]["Enums"]["trailer_load_status"] | null
          trailer_number: string | null
          trailer_role: string | null
          user_id: string | null
        }
        Insert: {
          command_id?: string | null
          created_at?: string
          event_type: string
          event_version?: number
          from_status?:
            | Database["public"]["Enums"]["trailer_load_status"]
            | null
          id?: string
          load_id?: string | null
          note?: string | null
          source?: string
          to_status?: Database["public"]["Enums"]["trailer_load_status"] | null
          trailer_number?: string | null
          trailer_role?: string | null
          user_id?: string | null
        }
        Update: {
          command_id?: string | null
          created_at?: string
          event_type?: string
          event_version?: number
          from_status?:
            | Database["public"]["Enums"]["trailer_load_status"]
            | null
          id?: string
          load_id?: string | null
          note?: string | null
          source?: string
          to_status?: Database["public"]["Enums"]["trailer_load_status"] | null
          trailer_number?: string | null
          trailer_role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_events_load_id_fkey1"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
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
          broker_id: string | null
          carrier_comments: string | null
          carrier_id: string | null
          carrier_pay: number | null
          category: string | null
          client_id: string | null
          comments: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_rate: number | null
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          driver_id: string | null
          equipment_id: string | null
          eta_at: string | null
          eta_source: string | null
          exception_at: string | null
          exception_reason: string | null
          exception_resolved_at: string | null
          exception_resolved_note: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          fuel_surcharge_amount: number
          has_sweep: boolean
          haul_type: string | null
          id: string
          invoice_status: string
          invoiced: boolean | null
          is_exception: boolean
          leg_id: string
          legacy_load_id: string | null
          order_id: string
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          rate_confirmation_id: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id: string
          schedule_date: string | null
          schedule_id: string
          settlement_status: string
          shipment_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          superseded_by_id: string | null
          target_load_id: string | null
          total_distance: string | null
          tracking_token: string | null
          tractor_id: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          version: number
          yard_arrival_at: string | null
        }
        Insert: {
          alert_status?: string | null
          arrival_date?: string | null
          arrival_day?: string | null
          arrival_time?: string | null
          broker_id?: string | null
          carrier_comments?: string | null
          carrier_id?: string | null
          carrier_pay?: number | null
          category?: string | null
          client_id?: string | null
          comments?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_rate?: number | null
          cutoff_date?: string | null
          cutoff_day?: string | null
          cutoff_time?: string | null
          delivery_defect_reason?: string | null
          delivery_sequence?: number | null
          driver?: string | null
          driver_id?: string | null
          equipment_id?: string | null
          eta_at?: string | null
          eta_source?: string | null
          exception_at?: string | null
          exception_reason?: string | null
          exception_resolved_at?: string | null
          exception_resolved_note?: string | null
          expected_delivery?: string | null
          expected_pickup?: string | null
          fuel_surcharge_amount?: number
          has_sweep?: boolean
          haul_type?: string | null
          id?: string
          invoice_status?: string
          invoiced?: boolean | null
          is_exception?: boolean
          leg_id: string
          legacy_load_id?: string | null
          order_id: string
          origin_id?: string | null
          origin_name?: string | null
          outbound_trailer?: string | null
          pickup_defect_reason?: string | null
          pro_number?: string | null
          rate_confirmation_id?: string | null
          return_trailer?: string | null
          return_trailer_location?:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id?: string
          schedule_date?: string | null
          schedule_id: string
          settlement_status?: string
          shipment_id: string
          status?: Database["public"]["Enums"]["trailer_load_status"]
          str_name?: string | null
          str_number?: string | null
          str_return_trailer_started_at?: string | null
          str_trl_location?: string | null
          superseded_by_id?: string | null
          target_load_id?: string | null
          total_distance?: string | null
          tracking_token?: string | null
          tractor_id?: string | null
          trip_id?: string | null
          trl_location_code?: string | null
          unload_date?: string | null
          unload_day?: string | null
          unload_time?: string | null
          unload_type?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          yard_arrival_at?: string | null
        }
        Update: {
          alert_status?: string | null
          arrival_date?: string | null
          arrival_day?: string | null
          arrival_time?: string | null
          broker_id?: string | null
          carrier_comments?: string | null
          carrier_id?: string | null
          carrier_pay?: number | null
          category?: string | null
          client_id?: string | null
          comments?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_rate?: number | null
          cutoff_date?: string | null
          cutoff_day?: string | null
          cutoff_time?: string | null
          delivery_defect_reason?: string | null
          delivery_sequence?: number | null
          driver?: string | null
          driver_id?: string | null
          equipment_id?: string | null
          eta_at?: string | null
          eta_source?: string | null
          exception_at?: string | null
          exception_reason?: string | null
          exception_resolved_at?: string | null
          exception_resolved_note?: string | null
          expected_delivery?: string | null
          expected_pickup?: string | null
          fuel_surcharge_amount?: number
          has_sweep?: boolean
          haul_type?: string | null
          id?: string
          invoice_status?: string
          invoiced?: boolean | null
          is_exception?: boolean
          leg_id?: string
          legacy_load_id?: string | null
          order_id?: string
          origin_id?: string | null
          origin_name?: string | null
          outbound_trailer?: string | null
          pickup_defect_reason?: string | null
          pro_number?: string | null
          rate_confirmation_id?: string | null
          return_trailer?: string | null
          return_trailer_location?:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id?: string
          schedule_date?: string | null
          schedule_id?: string
          settlement_status?: string
          shipment_id?: string
          status?: Database["public"]["Enums"]["trailer_load_status"]
          str_name?: string | null
          str_number?: string | null
          str_return_trailer_started_at?: string | null
          str_trl_location?: string | null
          superseded_by_id?: string | null
          target_load_id?: string | null
          total_distance?: string | null
          tracking_token?: string | null
          tractor_id?: string | null
          trip_id?: string | null
          trl_location_code?: string | null
          unload_date?: string | null
          unload_day?: string | null
          unload_time?: string | null
          unload_type?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          yard_arrival_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_loads_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "trailer_loads_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_rate_confirmation_id_fkey"
            columns: ["rate_confirmation_id"]
            isOneToOne: false
            referencedRelation: "rate_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "trailer_loads_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "trailer_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_tractor_id_fkey"
            columns: ["tractor_id"]
            isOneToOne: false
            referencedRelation: "tractors"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_sync_config: {
        Row: {
          company_id: string
          created_at: string
          id: string
          last_sync_status: string | null
          last_synced_at: string | null
          sheet_name: string | null
          spreadsheet_id: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          last_sync_status?: string | null
          last_synced_at?: string | null
          sheet_name?: string | null
          spreadsheet_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          last_sync_status?: string | null
          last_synced_at?: string | null
          sheet_name?: string | null
          spreadsheet_id?: string | null
          updated_at?: string
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
          company_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          inbound_load_id: string | null
          note: string | null
          trailer_norm: string | null
          trailer_number: string
        }
        Insert: {
          arrival_at?: string
          checked_out_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          inbound_load_id?: string | null
          note?: string | null
          trailer_norm?: string | null
          trailer_number: string
        }
        Update: {
          arrival_at?: string
          checked_out_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          inbound_load_id?: string | null
          note?: string | null
          trailer_norm?: string | null
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
            referencedRelation: "load_party_roles"
            referencedColumns: ["load_id"]
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
      customer_invoice_aging: {
        Row: {
          aging_bucket: string | null
          client_id: string | null
          client_name: string | null
          company_id: string | null
          days_past_due: number | null
          due_at: string | null
          id: string | null
          invoice_number: string | null
          status: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "trailer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      load_alert_conditions: {
        Row: {
          alert_type: string | null
          body: string | null
          company_id: string | null
          load_id: string | null
          title: string | null
        }
        Relationships: []
      }
      load_party_roles: {
        Row: {
          bill_to_client_id: string | null
          bill_to_name: string | null
          broker_mc_number: string | null
          broker_name: string | null
          company_id: string | null
          customer_name: string | null
          driver_id: string | null
          driver_name: string | null
          latest_tender_status: string | null
          leg_id: string | null
          load_id: string | null
          operating_carrier_mc_number: string | null
          operating_carrier_name: string | null
          operating_mode: string | null
          order_id: string | null
          outbound_trailer: string | null
          rate_confirmation_import_id: string | null
          return_trailer: string | null
          schedule_id: string | null
          shipment_id: string | null
          shipper_name: string | null
          tendered_carrier_id: string | null
          tendered_carrier_name: string | null
          tractor_id: string | null
          tractor_number: string | null
          trailer_equipment_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_loads_carrier_id_fkey"
            columns: ["tendered_carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_client_id_fkey"
            columns: ["bill_to_client_id"]
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
          {
            foreignKeyName: "trailer_loads_equipment_id_fkey"
            columns: ["trailer_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_loads_tractor_id_fkey"
            columns: ["tractor_id"]
            isOneToOne: false
            referencedRelation: "tractors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _jsonb_deep_merge: { Args: { a: Json; b: Json }; Returns: Json }
      _log_status_propagation: {
        Args: {
          p_company: string
          p_from: string
          p_id: string
          p_to: string
          p_type: string
        }
        Returns: undefined
      }
      _rc_business_key: { Args: { p_data: Json }; Returns: string }
      _rc_digits: { Args: { p: string }; Returns: string }
      _rc_map_equipment_type: { Args: { p_type: string }; Returns: string }
      _rc_validate: { Args: { p_company: string; p_data: Json }; Returns: Json }
      add_shipment_leg: {
        Args: {
          p_destination_stop_id: string
          p_origin_stop_id: string
          p_shipment_id: string
        }
        Returns: string
      }
      add_shipment_stop: {
        Args: {
          p_earliest: string
          p_latest: string
          p_location_code: string
          p_location_name: string
          p_shipment_id: string
          p_stop_type: Database["public"]["Enums"]["stop_type"]
        }
        Returns: string
      }
      admin_save_sync_config: {
        Args: {
          p_sheet_name: string
          p_spreadsheet_id: string
          p_webhook_url: string
        }
        Returns: undefined
      }
      admin_sync_config: {
        Args: never
        Returns: {
          last_sync_status: string
          last_synced_at: string
          sheet_name: string
          spreadsheet_id: string
          webhook_url: string
        }[]
      }
      apply_rate_to_load: {
        Args: {
          p_load_id: string
          p_miles?: number
          p_rate_agreement_id: string
          p_weight?: number
        }
        Returns: {
          alert_status: string | null
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          broker_id: string | null
          carrier_comments: string | null
          carrier_id: string | null
          carrier_pay: number | null
          category: string | null
          client_id: string | null
          comments: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_rate: number | null
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          driver_id: string | null
          equipment_id: string | null
          eta_at: string | null
          eta_source: string | null
          exception_at: string | null
          exception_reason: string | null
          exception_resolved_at: string | null
          exception_resolved_note: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          fuel_surcharge_amount: number
          has_sweep: boolean
          haul_type: string | null
          id: string
          invoice_status: string
          invoiced: boolean | null
          is_exception: boolean
          leg_id: string
          legacy_load_id: string | null
          order_id: string
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          rate_confirmation_id: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id: string
          schedule_date: string | null
          schedule_id: string
          settlement_status: string
          shipment_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          superseded_by_id: string | null
          target_load_id: string | null
          total_distance: string | null
          tracking_token: string | null
          tractor_id: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          version: number
          yard_arrival_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trailer_loads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_accessorial: {
        Args: { p_accessorial_id: string }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          billable_to: string
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          load_id: string
          rejected_reason: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "accessorials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_load_parties: {
        Args: {
          p_broker_id?: string
          p_load_id: string
          p_rate_confirmation_id?: string
          p_tractor_id?: string
        }
        Returns: {
          alert_status: string | null
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          broker_id: string | null
          carrier_comments: string | null
          carrier_id: string | null
          carrier_pay: number | null
          category: string | null
          client_id: string | null
          comments: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_rate: number | null
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          driver_id: string | null
          equipment_id: string | null
          eta_at: string | null
          eta_source: string | null
          exception_at: string | null
          exception_reason: string | null
          exception_resolved_at: string | null
          exception_resolved_note: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          fuel_surcharge_amount: number
          has_sweep: boolean
          haul_type: string | null
          id: string
          invoice_status: string
          invoiced: boolean | null
          is_exception: boolean
          leg_id: string
          legacy_load_id: string | null
          order_id: string
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          rate_confirmation_id: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id: string
          schedule_date: string | null
          schedule_id: string
          settlement_status: string
          shipment_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          superseded_by_id: string | null
          target_load_id: string | null
          total_distance: string | null
          tracking_token: string | null
          tractor_id: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          version: number
          yard_arrival_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trailer_loads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_dispatch: { Args: never; Returns: boolean }
      capture_pod: {
        Args: {
          p_load_id: string
          p_notes?: string
          p_photo_path?: string
          p_recipient_name: string
          p_signature_svg: string
        }
        Returns: {
          company_id: string
          created_by: string | null
          id: string
          load_id: string
          notes: string | null
          photo_path: string | null
          recipient_name: string
          signature_svg: string | null
          signed_at: string
        }
        SetofOptions: {
          from: "*"
          to: "proof_of_delivery"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_sheet_outbox: {
        Args: {
          p_company_id?: string
          p_lease_seconds?: number
          p_limit?: number
          p_worker: string
        }
        Returns: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          last_error: string | null
          lease_expires_at: string | null
          match_column: string | null
          match_value: string | null
          next_attempt_at: string
          payload: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sheet_sync_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_order_with_shipment: {
        Args: {
          p_client_id: string
          p_commodity_description: string
          p_consignee_code: string
          p_consignee_name: string
          p_ready_datetime: string
          p_requested_delivery_datetime: string
          p_service_level: string
          p_shipper_code: string
          p_shipper_name: string
          p_total_pallets: number
          p_total_pieces: number
          p_total_weight: number
        }
        Returns: {
          order_id: string
          shipment_id: string
        }[]
      }
      create_tender: {
        Args: {
          p_carrier_id: string
          p_expires_at?: string
          p_leg_id: string
          p_offered_rate: number
        }
        Returns: {
          carrier_id: string
          company_id: string
          expires_at: string | null
          id: string
          leg_id: string
          offered_at: string
          offered_rate: number | null
          responded_at: string | null
          response_notes: string | null
          response_token: string | null
          status: Database["public"]["Enums"]["tender_status"]
          token_expires_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_company_id: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      current_user_has_any_role: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      dispatch_trailer: {
        Args: {
          p_command_id?: string
          p_destination?: string
          p_driver: string
          p_load_id: string
          p_previous_driver?: string
          p_trailer: string
        }
        Returns: {
          alert_status: string | null
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          broker_id: string | null
          carrier_comments: string | null
          carrier_id: string | null
          carrier_pay: number | null
          category: string | null
          client_id: string | null
          comments: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_rate: number | null
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          driver_id: string | null
          equipment_id: string | null
          eta_at: string | null
          eta_source: string | null
          exception_at: string | null
          exception_reason: string | null
          exception_resolved_at: string | null
          exception_resolved_note: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          fuel_surcharge_amount: number
          has_sweep: boolean
          haul_type: string | null
          id: string
          invoice_status: string
          invoiced: boolean | null
          is_exception: boolean
          leg_id: string
          legacy_load_id: string | null
          order_id: string
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          rate_confirmation_id: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id: string
          schedule_date: string | null
          schedule_id: string
          settlement_status: string
          shipment_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          superseded_by_id: string | null
          target_load_id: string | null
          total_distance: string | null
          tracking_token: string | null
          tractor_id: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          version: number
          yard_arrival_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trailer_loads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dispute_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: {
          client_id: string
          company_id: string
          created_at: string
          dispute_reason: string | null
          dispute_resolved_at: string | null
          disputed_at: string | null
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          paid_at: string | null
          qbo_invoice_id: string | null
          qbo_sync_error: string | null
          qbo_sync_status: string
          qbo_synced_at: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "customer_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_transition_allowed: {
        Args: {
          p_from: Database["public"]["Enums"]["trailer_load_status"]
          p_to: Database["public"]["Enums"]["trailer_load_status"]
        }
        Returns: boolean
      }
      driver_update_status: {
        Args: {
          p_load_id: string
          p_new_status: Database["public"]["Enums"]["trailer_load_status"]
        }
        Returns: {
          alert_status: string | null
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          broker_id: string | null
          carrier_comments: string | null
          carrier_id: string | null
          carrier_pay: number | null
          category: string | null
          client_id: string | null
          comments: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_rate: number | null
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          driver_id: string | null
          equipment_id: string | null
          eta_at: string | null
          eta_source: string | null
          exception_at: string | null
          exception_reason: string | null
          exception_resolved_at: string | null
          exception_resolved_note: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          fuel_surcharge_amount: number
          has_sweep: boolean
          haul_type: string | null
          id: string
          invoice_status: string
          invoiced: boolean | null
          is_exception: boolean
          leg_id: string
          legacy_load_id: string | null
          order_id: string
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          rate_confirmation_id: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id: string
          schedule_date: string | null
          schedule_id: string
          settlement_status: string
          shipment_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          superseded_by_id: string | null
          target_load_id: string | null
          total_distance: string | null
          tracking_token: string | null
          tractor_id: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          version: number
          yard_arrival_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trailer_loads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_driver_session: {
        Args: { p_session_id: string }
        Returns: {
          app_version: string | null
          company_id: string
          created_at: string
          device_type: string | null
          ended_at: string | null
          id: string
          ip_address: unknown
          is_active: boolean
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "driver_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_tracking_token: { Args: { p_load_id: string }; Returns: string }
      evaluate_alerts: {
        Args: { p_notify?: boolean }
        Returns: {
          raised: number
          resolved: number
        }[]
      }
      exception_case_exists_for_current_company: {
        Args: { _case_id: string }
        Returns: boolean
      }
      flag_exception: {
        Args: { p_load_id: string; p_reason: string }
        Returns: {
          alert_status: string | null
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          broker_id: string | null
          carrier_comments: string | null
          carrier_id: string | null
          carrier_pay: number | null
          category: string | null
          client_id: string | null
          comments: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_rate: number | null
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          driver_id: string | null
          equipment_id: string | null
          eta_at: string | null
          eta_source: string | null
          exception_at: string | null
          exception_reason: string | null
          exception_resolved_at: string | null
          exception_resolved_note: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          fuel_surcharge_amount: number
          has_sweep: boolean
          haul_type: string | null
          id: string
          invoice_status: string
          invoiced: boolean | null
          is_exception: boolean
          leg_id: string
          legacy_load_id: string | null
          order_id: string
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          rate_confirmation_id: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id: string
          schedule_date: string | null
          schedule_id: string
          settlement_status: string
          shipment_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          superseded_by_id: string | null
          target_load_id: string | null
          total_distance: string | null
          tracking_token: string | null
          tractor_id: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          version: number
          yard_arrival_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trailer_loads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_carrier_settlement: {
        Args: { p_carrier_id: string; p_load_ids: string[] }
        Returns: {
          carrier_id: string
          company_id: string
          created_at: string
          id: string
          paid_at: string | null
          settlement_number: string
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "carrier_settlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_customer_invoice: {
        Args: { p_client_id: string; p_load_ids: string[] }
        Returns: {
          client_id: string
          company_id: string
          created_at: string
          dispute_reason: string | null
          dispute_resolved_at: string | null
          disputed_at: string | null
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          paid_at: string | null
          qbo_invoice_id: string | null
          qbo_sync_error: string | null
          qbo_sync_status: string
          qbo_synced_at: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "customer_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_edi_inbound_token: { Args: never; Returns: string }
      get_inbound_token: { Args: never; Returns: string }
      get_load_source_document: { Args: { p_load_id: string }; Returns: Json }
      get_tender_by_token: {
        Args: { p_token: string }
        Returns: {
          carrier_name: string
          destination_name: string
          expires_at: string
          offered_at: string
          offered_rate: number
          origin_name: string
          responded_at: string
          schedule_id: string
          status: Database["public"]["Enums"]["tender_status"]
          tender_id: string
          token_valid: boolean
        }[]
      }
      get_tracking_by_token: {
        Args: { p_token: string }
        Returns: {
          destination_name: string
          eta_at: string
          expected_delivery: string
          expected_pickup: string
          found: boolean
          is_exception: boolean
          origin_name: string
          schedule_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          updated_at: string
        }[]
      }
      get_tracking_milestones_by_token: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          event_type: string
          note: string
        }[]
      }
      has_passing_pretrip_dvir: {
        Args: { p_load_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_rate_confirmation: {
        Args: { p_force?: boolean; p_import_id: string; p_override_data?: Json }
        Returns: Json
      }
      ingest_tracking_event: {
        Args: {
          p_asset_type?: string
          p_company_id: string
          p_eta_at?: string
          p_eta_source?: string
          p_external_id: string
          p_heading_deg: number
          p_latitude: number
          p_longitude: number
          p_provider?: string
          p_raw_payload?: Json
          p_recorded_at: string
          p_speed_mph: number
        }
        Returns: {
          asset_type: string | null
          company_id: string
          dedupe_key: string | null
          external_id: string
          heading_deg: number | null
          id: string
          latitude: number | null
          load_id: string | null
          longitude: number | null
          matched_by: string | null
          provider: string | null
          raw_payload: Json | null
          received_at: string
          recorded_at: string
          source: string
          speed_mph: number | null
        }
        SetofOptions: {
          from: "*"
          to: "tracking_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_assigned_driver: { Args: { p_load_id: string }; Returns: boolean }
      is_dispatcher_or_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      latest_tracking_locations: {
        Args: never
        Returns: {
          external_id: string
          heading_deg: number
          latitude: number
          load_id: string
          load_schedule_id: string
          longitude: number
          matched_by: string
          received_at: string
          recorded_at: string
          speed_mph: number
        }[]
      }
      leg_status_for_load: {
        Args: { p_status: Database["public"]["Enums"]["trailer_load_status"] }
        Returns: Database["public"]["Enums"]["leg_status"]
      }
      log_container_milestone: {
        Args: { p_container_id: string; p_milestone: string; p_note?: string }
        Returns: {
          appointment_at: string | null
          bill_of_lading: string | null
          chassis_id: string | null
          chassis_number: string | null
          client_id: string | null
          container_number: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivered_at: string | null
          delivery_location: string | null
          detention_free_days: number
          discharged_at: string | null
          driver_id: string | null
          eta: string | null
          id: string
          invoiced: boolean
          last_free_day: string | null
          notes: string | null
          picked_up_at: string | null
          pickup_location: string | null
          port_terminal: string | null
          rate: number | null
          returned_at: string | null
          size: string | null
          status: Database["public"]["Enums"]["container_status"]
          steamship_line: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "containers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      notify_role: {
        Args: {
          p_body: string
          p_company_id: string
          p_link: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      notify_user: {
        Args: {
          p_body?: string
          p_company_id: string
          p_link?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      plan_leg: {
        Args: { p_driver_id: string; p_equipment_id: string; p_leg_id: string }
        Returns: {
          alert_status: string | null
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          broker_id: string | null
          carrier_comments: string | null
          carrier_id: string | null
          carrier_pay: number | null
          category: string | null
          client_id: string | null
          comments: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_rate: number | null
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          driver_id: string | null
          equipment_id: string | null
          eta_at: string | null
          eta_source: string | null
          exception_at: string | null
          exception_reason: string | null
          exception_resolved_at: string | null
          exception_resolved_note: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          fuel_surcharge_amount: number
          has_sweep: boolean
          haul_type: string | null
          id: string
          invoice_status: string
          invoiced: boolean | null
          is_exception: boolean
          leg_id: string
          legacy_load_id: string | null
          order_id: string
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          rate_confirmation_id: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id: string
          schedule_date: string | null
          schedule_id: string
          settlement_status: string
          shipment_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          superseded_by_id: string | null
          target_load_id: string | null
          total_distance: string | null
          tracking_token: string | null
          tractor_id: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          version: number
          yard_arrival_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trailer_loads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_edi_response: {
        Args: {
          p_in_reply_to: string
          p_note?: string
          p_parsed?: Json
          p_transaction_set: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          direction: string
          id: string
          in_reply_to: string | null
          note: string | null
          parsed: Json | null
          raw_payload: string | null
          related_load_id: string | null
          status: string
          trading_partner: string
          transaction_set: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "edi_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recent_tracking_events: {
        Args: { p_limit?: number }
        Returns: {
          asset_type: string
          external_id: string
          heading_deg: number
          id: string
          latitude: number
          load_id: string
          load_schedule_id: string
          longitude: number
          matched_by: string
          provider: string
          received_at: string
          recorded_at: string
          speed_mph: number
        }[]
      }
      recompute_leg: { Args: { p_leg_id: string }; Returns: undefined }
      recompute_order: { Args: { p_order_id: string }; Returns: undefined }
      recompute_shipment: {
        Args: { p_shipment_id: string }
        Returns: undefined
      }
      register_rate_confirmation_upload: {
        Args: {
          p_file_hash: string
          p_filename: string
          p_storage_path: string
        }
        Returns: Json
      }
      reject_accessorial: {
        Args: { p_accessorial_id: string; p_reason: string }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          billable_to: string
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          load_id: string
          rejected_reason: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "accessorials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_rate_confirmation_import: {
        Args: { p_import_id: string; p_reason?: string }
        Returns: Json
      }
      resolve_exception: {
        Args: { p_load_id: string; p_resolution_note: string }
        Returns: {
          alert_status: string | null
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          broker_id: string | null
          carrier_comments: string | null
          carrier_id: string | null
          carrier_pay: number | null
          category: string | null
          client_id: string | null
          comments: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_rate: number | null
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          driver_id: string | null
          equipment_id: string | null
          eta_at: string | null
          eta_source: string | null
          exception_at: string | null
          exception_reason: string | null
          exception_resolved_at: string | null
          exception_resolved_note: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          fuel_surcharge_amount: number
          has_sweep: boolean
          haul_type: string | null
          id: string
          invoice_status: string
          invoiced: boolean | null
          is_exception: boolean
          leg_id: string
          legacy_load_id: string | null
          order_id: string
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          rate_confirmation_id: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id: string
          schedule_date: string | null
          schedule_id: string
          settlement_status: string
          shipment_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          superseded_by_id: string | null
          target_load_id: string | null
          total_distance: string | null
          tracking_token: string | null
          tractor_id: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          version: number
          yard_arrival_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trailer_loads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_invoice_dispute: {
        Args: { p_invoice_id: string; p_new_status: string }
        Returns: {
          client_id: string
          company_id: string
          created_at: string
          dispute_reason: string | null
          dispute_resolved_at: string | null
          disputed_at: string | null
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          paid_at: string | null
          qbo_invoice_id: string | null
          qbo_sync_error: string | null
          qbo_sync_status: string
          qbo_synced_at: string | null
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "customer_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_tender: {
        Args: {
          p_response: Database["public"]["Enums"]["tender_status"]
          p_response_notes?: string
          p_tender_id: string
        }
        Returns: {
          carrier_id: string
          company_id: string
          expires_at: string | null
          id: string
          leg_id: string
          offered_at: string
          offered_rate: number | null
          responded_at: string | null
          response_notes: string | null
          response_token: string | null
          status: Database["public"]["Enums"]["tender_status"]
          token_expires_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_tender_by_token: {
        Args: {
          p_response: Database["public"]["Enums"]["tender_status"]
          p_response_notes?: string
          p_token: string
        }
        Returns: {
          message: string
          ok: boolean
          status: Database["public"]["Enums"]["tender_status"]
        }[]
      }
      review_edi_document: {
        Args: {
          p_document_id: string
          p_note?: string
          p_related_load_id?: string
          p_status: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          direction: string
          id: string
          in_reply_to: string | null
          note: string | null
          parsed: Json | null
          raw_payload: string | null
          related_load_id: string | null
          status: string
          trading_partner: string
          transaction_set: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "edi_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revise_rate_agreement: {
        Args: {
          p_effective_start?: string
          p_new_fuel_surcharge_pct: number
          p_new_linehaul_rate: number
          p_rate_agreement_id: string
        }
        Returns: {
          additional_stop_rate: number
          client_id: string | null
          company_id: string
          contract_number: string | null
          created_at: string
          destination_code: string | null
          effective_end: string | null
          effective_start: string
          fuel_surcharge_pct: number
          id: string
          linehaul_rate: number
          origin_code: string | null
          rate_type: string
          root_id: string
          superseded_by_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "rate_agreements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rotate_edi_inbound_token: { Args: never; Returns: string }
      rotate_inbound_token: { Args: never; Returns: string }
      save_rate_confirmation_extraction: {
        Args: {
          p_confidence?: Json
          p_error?: string
          p_extracted: Json
          p_import_id: string
          p_normalized: Json
        }
        Returns: Json
      }
      set_load_financials: {
        Args: {
          p_carrier_pay: number
          p_customer_rate: number
          p_fuel_surcharge_amount: number
          p_load_id: string
        }
        Returns: {
          alert_status: string | null
          arrival_date: string | null
          arrival_day: string | null
          arrival_time: string | null
          broker_id: string | null
          carrier_comments: string | null
          carrier_id: string | null
          carrier_pay: number | null
          category: string | null
          client_id: string | null
          comments: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_rate: number | null
          cutoff_date: string | null
          cutoff_day: string | null
          cutoff_time: string | null
          delivery_defect_reason: string | null
          delivery_sequence: number | null
          driver: string | null
          driver_id: string | null
          equipment_id: string | null
          eta_at: string | null
          eta_source: string | null
          exception_at: string | null
          exception_reason: string | null
          exception_resolved_at: string | null
          exception_resolved_note: string | null
          expected_delivery: string | null
          expected_pickup: string | null
          fuel_surcharge_amount: number
          has_sweep: boolean
          haul_type: string | null
          id: string
          invoice_status: string
          invoiced: boolean | null
          is_exception: boolean
          leg_id: string
          legacy_load_id: string | null
          order_id: string
          origin_id: string | null
          origin_name: string | null
          outbound_trailer: string | null
          pickup_defect_reason: string | null
          pro_number: string | null
          rate_confirmation_id: string | null
          return_trailer: string | null
          return_trailer_location:
            | Database["public"]["Enums"]["trailer_location"]
            | null
          root_id: string
          schedule_date: string | null
          schedule_id: string
          settlement_status: string
          shipment_id: string
          status: Database["public"]["Enums"]["trailer_load_status"]
          str_name: string | null
          str_number: string | null
          str_return_trailer_started_at: string | null
          str_trl_location: string | null
          superseded_by_id: string | null
          target_load_id: string | null
          total_distance: string | null
          tracking_token: string | null
          tractor_id: string | null
          trip_id: string | null
          trl_location_code: string | null
          unload_date: string | null
          unload_day: string | null
          unload_time: string | null
          unload_type: string | null
          updated_at: string
          updated_by: string | null
          version: number
          yard_arrival_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trailer_loads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_driver_session: {
        Args: {
          p_app_version?: string
          p_device_type?: string
          p_user_agent?: string
        }
        Returns: {
          app_version: string | null
          company_id: string
          created_at: string
          device_type: string | null
          ended_at: string | null
          id: string
          ip_address: unknown
          is_active: boolean
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "driver_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_dvir: {
        Args: {
          p_brakes_ok: boolean
          p_cargo_securement_ok: boolean
          p_coupling_devices_ok: boolean
          p_defect_notes?: string
          p_emergency_equipment_ok: boolean
          p_fluid_leaks_ok: boolean
          p_horn_ok: boolean
          p_inspection_type: Database["public"]["Enums"]["dvir_inspection_type"]
          p_lights_reflectors_ok: boolean
          p_load_id: string
          p_mirrors_windshield_ok: boolean
          p_odometer_miles?: number
          p_tires_wheels_ok: boolean
        }
        Returns: {
          brakes_ok: boolean
          cargo_securement_ok: boolean
          company_id: string
          coupling_devices_ok: boolean
          created_at: string
          defect_notes: string | null
          defects_found: boolean
          driver_id: string
          emergency_equipment_ok: boolean
          fluid_leaks_ok: boolean
          horn_ok: boolean
          id: string
          inspection_type: Database["public"]["Enums"]["dvir_inspection_type"]
          lights_reflectors_ok: boolean
          load_id: string
          mirrors_windshield_ok: boolean
          odometer_miles: number | null
          passed: boolean
          tires_wheels_ok: boolean
        }
        SetofOptions: {
          from: "*"
          to: "dvir_inspections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tenant_has_product: {
        Args: { _product: Database["public"]["Enums"]["product_key"] }
        Returns: boolean
      }
      update_rate_confirmation_review: {
        Args: { p_import_id: string; p_override_data: Json }
        Returns: Json
      }
      validate_rate_confirmation_import: {
        Args: { p_import_id: string }
        Returns: Json
      }
      yard_check_in: {
        Args: {
          p_idempotency_key?: string
          p_load_id?: string
          p_note?: string
          p_trailer: string
        }
        Returns: {
          arrival_at: string
          checked_out_at: string | null
          company_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          inbound_load_id: string | null
          note: string | null
          trailer_norm: string | null
          trailer_number: string
        }
        SetofOptions: {
          from: "*"
          to: "yard_check_ins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      yard_check_out: {
        Args: { p_id: string }
        Returns: {
          arrival_at: string
          checked_out_at: string | null
          company_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          inbound_load_id: string | null
          note: string | null
          trailer_norm: string | null
          trailer_number: string
        }
        SetofOptions: {
          from: "*"
          to: "yard_check_ins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "dispatcher"
        | "guard"
        | "billing"
        | "driver"
        | "owner"
      appointment_status:
        | "REQUESTED"
        | "CONFIRMED"
        | "RESCHEDULED"
        | "CANCELLED"
      container_status:
        | "Available"
        | "Dispatched"
        | "At Port"
        | "Loaded"
        | "In Transit"
        | "Delivered"
        | "Empty Ready"
        | "Returned"
        | "Completed"
        | "Delayed"
        | "Exception"
      dvir_inspection_type: "PRE_TRIP" | "POST_TRIP"
      leg_status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED"
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
      order_status:
        | "OPEN"
        | "PARTIALLY_ALLOCATED"
        | "ALLOCATED"
        | "CANCELLED"
        | "CLOSED"
      product_key: "trailer" | "drayage"
      shipment_status:
        | "PLANNING"
        | "PLANNED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
      stop_type: "PICKUP" | "DELIVERY"
      tender_status:
        | "OFFERED"
        | "ACCEPTED"
        | "REJECTED"
        | "EXPIRED"
        | "RESCINDED"
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
      appointment_status: [
        "REQUESTED",
        "CONFIRMED",
        "RESCHEDULED",
        "CANCELLED",
      ],
      container_status: [
        "Available",
        "Dispatched",
        "At Port",
        "Loaded",
        "In Transit",
        "Delivered",
        "Empty Ready",
        "Returned",
        "Completed",
        "Delayed",
        "Exception",
      ],
      dvir_inspection_type: ["PRE_TRIP", "POST_TRIP"],
      leg_status: ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"],
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
      order_status: [
        "OPEN",
        "PARTIALLY_ALLOCATED",
        "ALLOCATED",
        "CANCELLED",
        "CLOSED",
      ],
      product_key: ["trailer", "drayage"],
      shipment_status: [
        "PLANNING",
        "PLANNED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      stop_type: ["PICKUP", "DELIVERY"],
      tender_status: [
        "OFFERED",
        "ACCEPTED",
        "REJECTED",
        "EXPIRED",
        "RESCINDED",
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
