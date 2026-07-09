// Generated via Supabase MCP (project wnujoyzdpdyxblgdtxjw) on 2026-07-08.
// NOTE: only the public schema is included — the MCP generator does not expose a schema option.
// The `ketzal` schema below is HAND-WRITTEN (2026-07-08) from docs/DATA_MODEL.md and
// db/proposed/001_ketzal_os_v1.sql: focused on the Ketzal OS v1 tables only, and for
// the pre-existing tables (suppliers, services, profiles, payments) it is a PARTIAL
// best-effort subset of columns. Replace it when the generator supports schemas, e.g.:
//   supabase gen types typescript --project-id wnujoyzdpdyxblgdtxjw --schema ketzal --schema public > src/lib/db/database.types.ts

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
  ketzal: {
    Tables: {
      // PARTIAL: fila única (id=1) con la configuración global de la plataforma.
      app_settings: {
        Row: {
          id: number
          platform_commission_rate: number
          updated_at: string
        }
        Insert: {
          id?: number
          platform_commission_rate?: number
          updated_at?: string
        }
        Update: {
          id?: number
          platform_commission_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      booking_items: {
        Row: {
          booking_id: string
          created_at: string
          description: string | null
          id: string
          item_type: string
          line_total: number
          meta: Json
          passenger_type: string | null
          qty: number
          unit_price: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          description?: string | null
          id?: string
          item_type?: string
          line_total?: number
          meta?: Json
          passenger_type?: string | null
          qty?: number
          unit_price?: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          description?: string | null
          id?: string
          item_type?: string
          line_total?: number
          meta?: Json
          passenger_type?: string | null
          qty?: number
          unit_price?: number
        }
        Relationships: []
      }
      bookings: {
        Row: {
          cancel_reason: string | null
          created_at: string
          currency: string
          customer_id: string
          discount: number
          due_date: string | null
          folio: string | null
          id: string
          notes: string | null
          num_pax: number
          owner_supplier_id: string
          quote_token: string
          selling_supplier_id: string
          service_id: string | null
          sold_by: string | null
          status: Database["ketzal"]["Enums"]["booking_status"]
          subtotal: number
          total: number
          travel_date: string | null
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          discount?: number
          due_date?: string | null
          folio?: string | null
          id?: string
          notes?: string | null
          num_pax?: number
          owner_supplier_id: string
          quote_token?: string
          selling_supplier_id: string
          service_id?: string | null
          sold_by?: string | null
          status?: Database["ketzal"]["Enums"]["booking_status"]
          subtotal?: number
          total?: number
          travel_date?: string | null
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          discount?: number
          due_date?: string | null
          folio?: string | null
          id?: string
          notes?: string | null
          num_pax?: number
          owner_supplier_id?: string
          quote_token?: string
          selling_supplier_id?: string
          service_id?: string | null
          sold_by?: string | null
          status?: Database["ketzal"]["Enums"]["booking_status"]
          subtotal?: number
          total?: number
          travel_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          created_by: string | null
          doc_id: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          supplier_id: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      // PARTIAL: pre-existing table, only the columns Ketzal OS v1 uses.
      payments: {
        Row: {
          amount_mxn: number
          booking_id: string | null
          created_at: string
          id: string
          paid_at: string | null
          payment_method: string | null
          status: Database["ketzal"]["Enums"]["payment_status"]
          supplier_id: string | null
          type: Database["ketzal"]["Enums"]["payment_type"]
          user_id: string
        }
        Insert: {
          amount_mxn: number
          booking_id?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["ketzal"]["Enums"]["payment_status"]
          supplier_id?: string | null
          type?: Database["ketzal"]["Enums"]["payment_type"]
          user_id: string
        }
        Update: {
          amount_mxn?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["ketzal"]["Enums"]["payment_status"]
          supplier_id?: string | null
          type?: Database["ketzal"]["Enums"]["payment_type"]
          user_id?: string
        }
        Relationships: []
      }
      // PARTIAL: pre-existing table, only the columns Ketzal OS v1 uses.
      profiles: {
        Row: {
          active: boolean
          email: string | null
          id: string
          name: string | null
          role: Database["ketzal"]["Enums"]["user_role"] | null
          supplier_id: string | null
        }
        Insert: {
          active?: boolean
          email?: string | null
          id: string
          name?: string | null
          role?: Database["ketzal"]["Enums"]["user_role"] | null
          supplier_id?: string | null
        }
        Update: {
          active?: boolean
          email?: string | null
          id?: string
          name?: string | null
          role?: Database["ketzal"]["Enums"]["user_role"] | null
          supplier_id?: string | null
        }
        Relationships: []
      }
      receipts: {
        Row: {
          amount: number
          booking_id: string
          folio: number
          id: string
          issued_at: string
          issued_by: string | null
          payment_id: string | null
          pdf_url: string | null
          supplier_id: string
        }
        Insert: {
          amount: number
          booking_id: string
          folio: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          payment_id?: string | null
          pdf_url?: string | null
          supplier_id: string
        }
        Update: {
          amount?: number
          booking_id?: string
          folio?: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          payment_id?: string | null
          pdf_url?: string | null
          supplier_id?: string
        }
        Relationships: []
      }
      // PARTIAL: pre-existing table (32 columns), only the columns Ketzal OS v1 uses.
      services: {
        Row: {
          add_ons: Json | null
          available_from: string | null
          available_to: string | null
          city_from: string | null
          city_to: string | null
          created_at: string | null
          current_bookings: number
          dates: Json | null
          description: string | null
          excludes: Json | null
          hotel_provider_id: string | null
          id: string
          includes: Json | null
          itinerary: Json | null
          max_capacity: number | null
          name: string
          packs: Json | null
          price: number
          seasonal_prices: Json | null
          service_type: string | null
          state_from: string | null
          state_to: string | null
          supplier_id: string
          transport_provider_id: string | null
          updated_at: string | null
        }
        Insert: {
          add_ons?: Json | null
          available_from?: string | null
          available_to?: string | null
          city_from?: string | null
          city_to?: string | null
          created_at?: string | null
          current_bookings?: number
          dates?: Json | null
          description?: string | null
          excludes?: Json | null
          hotel_provider_id?: string | null
          id?: string
          includes?: Json | null
          itinerary?: Json | null
          max_capacity?: number | null
          name: string
          packs?: Json | null
          price: number
          seasonal_prices?: Json | null
          service_type?: string | null
          state_from?: string | null
          state_to?: string | null
          supplier_id: string
          transport_provider_id?: string | null
          updated_at?: string | null
        }
        Update: {
          add_ons?: Json | null
          available_from?: string | null
          available_to?: string | null
          city_from?: string | null
          city_to?: string | null
          created_at?: string | null
          current_bookings?: number
          dates?: Json | null
          description?: string | null
          excludes?: Json | null
          hotel_provider_id?: string | null
          id?: string
          includes?: Json | null
          itinerary?: Json | null
          max_capacity?: number | null
          name?: string
          packs?: Json | null
          price?: number
          seasonal_prices?: Json | null
          service_type?: string | null
          state_from?: string | null
          state_to?: string | null
          supplier_id?: string
          transport_provider_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      // PARTIAL: pre-existing table, only the columns Ketzal OS v1 uses.
      suppliers: {
        Row: {
          address: string | null
          commission_rate: number
          contact_email: string
          created_at: string
          description: string | null
          id: string
          info: Json | null
          location: Json | null
          name: string
          phone_number: string | null
          photos: Json | null
          supplier_sub_type: string | null
          supplier_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          commission_rate?: number
          contact_email: string
          created_at?: string
          description?: string | null
          id?: string
          info?: Json | null
          location?: Json | null
          name: string
          phone_number?: string | null
          photos?: Json | null
          supplier_sub_type?: string | null
          supplier_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          commission_rate?: number
          contact_email?: string
          created_at?: string
          description?: string | null
          id?: string
          info?: Json | null
          location?: Json | null
          name?: string
          phone_number?: string | null
          photos?: Json | null
          supplier_sub_type?: string | null
          supplier_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: undefined
      }
      reports_summary: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      create_payment_intent: {
        Args: { p_booking_id: string; p_amount: number }
        Returns: string
      }
      confirm_online_payment: {
        Args: { p_intent_id: string; p_mp_payment_id: string; p_status: string }
        Returns: Json
      }
      ensure_profile: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      list_team: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      set_user_active: {
        Args: { p_user: string; p_active: boolean }
        Returns: undefined
      }
      assign_user_agency: {
        Args: { p_user: string; p_supplier: string | null }
        Returns: undefined
      }
      set_user_role: {
        Args: { p_user: string; p_role: Database["ketzal"]["Enums"]["user_role"] }
        Returns: undefined
      }
      commissions_summary: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      convert_quote_to_sale: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      create_booking_with_items: {
        Args: {
          p_customer_id: string | null
          p_new_customer: Json | null
          p_service_id: string | null
          p_travel_date: string | null
          p_discount: number | null
          p_notes: string | null
          p_items: Json
          p_status: Database["ketzal"]["Enums"]["booking_status"]
        }
        Returns: string
      }
      dashboard_summary: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_quote_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
      list_customers: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      emit_receipt: {
        Args: { p_payment_id: string }
        Returns: number
      }
      register_payment: {
        Args: {
          p_booking_id: string
          p_amount: number
          p_method: string | null
          p_paid_at: string | null
          p_type: "payment" | "refund"
        }
        Returns: number
      }
    }
    Enums: {
      booking_status: "draft" | "reserved" | "confirmed" | "paid" | "cancelled"
      payment_status: "PENDING" | "PARTIAL" | "COMPLETED" | "REFUNDED"
      payment_type: "payment" | "refund"
      user_role: "user" | "admin" | "superadmin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_chat_messages: {
        Row: {
          approval_decided_at: string | null
          approval_decided_by: string | null
          approval_required: boolean
          approval_status: string | null
          content: string | null
          conversation_id: string
          created_at: string
          execution_result: Json | null
          execution_task_id: string | null
          id: string
          metadata: Json
          role: string
          tool_call_id: string | null
          tool_calls: Json | null
        }
        Insert: {
          approval_decided_at?: string | null
          approval_decided_by?: string | null
          approval_required?: boolean
          approval_status?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string
          execution_result?: Json | null
          execution_task_id?: string | null
          id?: string
          metadata?: Json
          role: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Update: {
          approval_decided_at?: string | null
          approval_decided_by?: string | null
          approval_required?: boolean
          approval_status?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          execution_result?: Json | null
          execution_task_id?: string | null
          id?: string
          metadata?: Json
          role?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_chat_messages_execution_task_id_fkey"
            columns: ["execution_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          last_message_at: string | null
          metadata: Json
          org_id: string | null
          pinned: boolean
          status: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          metadata?: Json
          org_id?: string | null
          pinned?: boolean
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          metadata?: Json
          org_id?: string | null
          pinned?: boolean
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          claude_md: string
          created_at: string | null
          id: string
          model_config: Json | null
          name: string
          org_id: string | null
          role: string
          status: string | null
        }
        Insert: {
          claude_md: string
          created_at?: string | null
          id?: string
          model_config?: Json | null
          name: string
          org_id?: string | null
          role: string
          status?: string | null
        }
        Update: {
          claude_md?: string
          created_at?: string | null
          id?: string
          model_config?: Json | null
          name?: string
          org_id?: string | null
          role?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_alerts: {
        Row: {
          agent_name: string | null
          created_at: string | null
          error_type: string
          http_status: number | null
          id: string
          model: string | null
          org_id: string | null
          provider: string
          raw_message: string | null
          task_id: string | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string | null
          error_type: string
          http_status?: number | null
          id?: string
          model?: string | null
          org_id?: string | null
          provider: string
          raw_message?: string | null
          task_id?: string | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string | null
          error_type?: string
          http_status?: number | null
          id?: string
          model?: string | null
          org_id?: string | null
          provider?: string
          raw_message?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_posts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          campaign_id: string
          content: Json
          created_at: string
          external_id: string | null
          external_url: string | null
          fail_reason: string | null
          id: string
          org_id: string | null
          platform: string
          published_at: string | null
          review_notes: string | null
          scheduled_at: string | null
          similarity_signature: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          campaign_id: string
          content?: Json
          created_at?: string
          external_id?: string | null
          external_url?: string | null
          fail_reason?: string | null
          id?: string
          org_id?: string | null
          platform: string
          published_at?: string | null
          review_notes?: string | null
          scheduled_at?: string | null
          similarity_signature?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          campaign_id?: string
          content?: Json
          created_at?: string
          external_id?: string | null
          external_url?: string | null
          fail_reason?: string | null
          id?: string
          org_id?: string | null
          platform?: string
          published_at?: string | null
          review_notes?: string | null
          scheduled_at?: string | null
          similarity_signature?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          brand_voice: string | null
          cadence: Json
          created_at: string
          end_date: string | null
          id: string
          last_run_at: string | null
          max_posts_per_day: number
          name: string
          next_run_at: string | null
          org_id: string | null
          platforms: string[]
          posts_per_run: number
          project_id: string | null
          start_date: string | null
          status: string
          target_audience: string | null
          topic_pillar: string
          updated_at: string
        }
        Insert: {
          brand_voice?: string | null
          cadence?: Json
          created_at?: string
          end_date?: string | null
          id?: string
          last_run_at?: string | null
          max_posts_per_day?: number
          name: string
          next_run_at?: string | null
          org_id?: string | null
          platforms?: string[]
          posts_per_run?: number
          project_id?: string | null
          start_date?: string | null
          status?: string
          target_audience?: string | null
          topic_pillar: string
          updated_at?: string
        }
        Update: {
          brand_voice?: string | null
          cadence?: Json
          created_at?: string
          end_date?: string | null
          id?: string
          last_run_at?: string | null
          max_posts_per_day?: number
          name?: string
          next_run_at?: string | null
          org_id?: string | null
          platforms?: string[]
          posts_per_run?: number
          project_id?: string | null
          start_date?: string | null
          status?: string
          target_audience?: string | null
          topic_pillar?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string | null
          id: string
          message_type: string | null
          metadata: Json | null
          project_id: string | null
          sender_name: string
          sender_type: string
          task_id: string | null
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          project_id?: string | null
          sender_name: string
          sender_type: string
          task_id?: string | null
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          project_id?: string | null
          sender_name?: string
          sender_type?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          description: string | null
          id: string
          industry: string | null
          name: string
          org_id: string | null
          status: string
          target_audience: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          name: string
          org_id?: string | null
          status?: string
          target_audience?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          name?: string
          org_id?: string | null
          status?: string
          target_audience?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_executions: {
        Row: {
          executed_at: string
          id: string
          job_id: string
          result: string | null
          status: string
          task_id: string | null
          updated_at: string | null
        }
        Insert: {
          executed_at?: string
          id?: string
          job_id: string
          result?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string | null
        }
        Update: {
          executed_at?: string
          id?: string
          job_id?: string
          result?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cron_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cron_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cron_executions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_jobs: {
        Row: {
          assigned_agent_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          interval_minutes: number | null
          last_run_at: string | null
          name: string
          next_run_at: string
          org_id: string | null
          project_id: string | null
          related_campaign_id: string | null
          run_count: number | null
          schedule_config: Json | null
          schedule_type: string
          status: string
          task_template: string
          updated_at: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          interval_minutes?: number | null
          last_run_at?: string | null
          name: string
          next_run_at?: string
          org_id?: string | null
          project_id?: string | null
          related_campaign_id?: string | null
          run_count?: number | null
          schedule_config?: Json | null
          schedule_type?: string
          status?: string
          task_template: string
          updated_at?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          interval_minutes?: number | null
          last_run_at?: string | null
          name?: string
          next_run_at?: string
          org_id?: string | null
          project_id?: string | null
          related_campaign_id?: string | null
          run_count?: number | null
          schedule_config?: Json | null
          schedule_type?: string
          status?: string
          task_template?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cron_jobs_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cron_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cron_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cron_jobs_related_campaign_id_fkey"
            columns: ["related_campaign_id"]
            isOneToOne: false
            referencedRelation: "lead_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_audit_cache: {
        Row: {
          audit: Json
          created_at: string
          domain: string
          id: number
          public_result: Json
        }
        Insert: {
          audit: Json
          created_at?: string
          domain: string
          id?: never
          public_result: Json
        }
        Update: {
          audit?: Json
          created_at?: string
          domain?: string
          id?: never
          public_result?: Json
        }
        Relationships: []
      }
      demo_digi_cache: {
        Row: {
          cache_key: string
          created_at: string
          id: number
          result: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          id?: never
          result: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          id?: never
          result?: Json
        }
        Relationships: []
      }
      demo_usage: {
        Row: {
          count: number
          day: string
          demo: string
          id: number
          ip_hash: string
          updated_at: string
        }
        Insert: {
          count?: number
          day?: string
          demo: string
          id?: never
          ip_hash: string
          updated_at?: string
        }
        Update: {
          count?: number
          day?: string
          demo?: string
          id?: never
          ip_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          body: string | null
          bounced_at: string | null
          campaign_id: string | null
          classification: string | null
          clicked_at: string | null
          created_at: string
          direction: string
          fail_reason: string | null
          id: string
          lead_id: string
          opened_at: string | null
          org_id: string | null
          replied_at: string | null
          resend_message_id: string | null
          sent_at: string | null
          sequence_step: number | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          bounced_at?: string | null
          campaign_id?: string | null
          classification?: string | null
          clicked_at?: string | null
          created_at?: string
          direction: string
          fail_reason?: string | null
          id?: string
          lead_id: string
          opened_at?: string | null
          org_id?: string | null
          replied_at?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          sequence_step?: number | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          bounced_at?: string | null
          campaign_id?: string | null
          classification?: string | null
          clicked_at?: string | null
          created_at?: string
          direction?: string
          fail_reason?: string | null
          id?: string
          lead_id?: string
          opened_at?: string | null
          org_id?: string | null
          replied_at?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          sequence_step?: number | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "lead_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequences: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          org_id: string | null
          steps: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          org_id?: string | null
          steps?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string | null
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_logs: {
        Row: {
          agent_name: string | null
          category: string
          created_at: string | null
          id: number
          level: string
          message: string
          meta: Json | null
          org_id: string | null
          task_id: string | null
        }
        Insert: {
          agent_name?: string | null
          category?: string
          created_at?: string | null
          id?: number
          level?: string
          message: string
          meta?: Json | null
          org_id?: string | null
          task_id?: string | null
        }
        Update: {
          agent_name?: string | null
          category?: string
          created_at?: string | null
          id?: number
          level?: string
          message?: string
          meta?: Json | null
          org_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          agent_name: string | null
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          org_id: string | null
          tags: string[] | null
          topic: string
        }
        Insert: {
          agent_name?: string | null
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          org_id?: string | null
          tags?: string[] | null
          topic: string
        }
        Update: {
          agent_name?: string | null
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          org_id?: string | null
          tags?: string[] | null
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activity: {
        Row: {
          actor: string
          actor_name: string | null
          created_at: string
          id: string
          lead_id: string
          meta: Json
          org_id: string
          ref_id: string | null
          ref_table: string | null
          title: string
          ts: string
          type: string
        }
        Insert: {
          actor?: string
          actor_name?: string | null
          created_at?: string
          id?: string
          lead_id: string
          meta?: Json
          org_id: string
          ref_id?: string | null
          ref_table?: string | null
          title: string
          ts?: string
          type: string
        }
        Update: {
          actor?: string
          actor_name?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          meta?: Json
          org_id?: string
          ref_id?: string | null
          ref_table?: string | null
          title?: string
          ts?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_campaigns: {
        Row: {
          created_at: string
          daily_quota: number
          icp_filters: Json
          icp_query: string
          id: string
          last_run_at: string | null
          name: string
          next_run_at: string | null
          org_id: string | null
          project_id: string | null
          schedule: Json
          sequence_id: string | null
          sources: string[]
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_quota?: number
          icp_filters?: Json
          icp_query: string
          id?: string
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          org_id?: string | null
          project_id?: string | null
          schedule?: Json
          sequence_id?: string | null
          sources?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_quota?: number
          icp_filters?: Json
          icp_query?: string
          id?: string
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          org_id?: string | null
          project_id?: string | null
          schedule?: Json
          sequence_id?: string | null
          sources?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_campaigns_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          audit: Json | null
          campaign_id: string | null
          city: string | null
          company: string
          contact_name: string | null
          country: string | null
          created_at: string
          data: Json
          domain: string | null
          email: string | null
          id: string
          industry: string | null
          last_audited_at: string | null
          last_contacted_at: string | null
          notes: string | null
          org_id: string | null
          phone: string | null
          project_id: string | null
          score: number | null
          source: string
          source_url: string | null
          status: string
          tier: string | null
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          audit?: Json | null
          campaign_id?: string | null
          city?: string | null
          company: string
          contact_name?: string | null
          country?: string | null
          created_at?: string
          data?: Json
          domain?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          last_audited_at?: string | null
          last_contacted_at?: string | null
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          project_id?: string | null
          score?: number | null
          source: string
          source_url?: string | null
          status?: string
          tier?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          audit?: Json | null
          campaign_id?: string | null
          city?: string | null
          company?: string
          contact_name?: string | null
          country?: string | null
          created_at?: string
          data?: Json
          domain?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          last_audited_at?: string | null
          last_contacted_at?: string | null
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          project_id?: string | null
          score?: number | null
          source?: string
          source_url?: string | null
          status?: string
          tier?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "lead_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          cal_event_id: string | null
          calendar_url: string | null
          created_at: string
          duration_min: number | null
          id: string
          lead_id: string
          notes: string | null
          org_id: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cal_event_id?: string | null
          calendar_url?: string | null
          created_at?: string
          duration_min?: number | null
          id?: string
          lead_id: string
          notes?: string | null
          org_id?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cal_event_id?: string | null
          calendar_url?: string | null
          created_at?: string
          duration_min?: number | null
          id?: string
          lead_id?: string
          notes?: string | null
          org_id?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mystery_blocklist: {
        Row: {
          created_at: string
          id: string
          identifier: string
          kind: string
          org_id: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          kind: string
          org_id?: string | null
          reason: string
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          kind?: string
          org_id?: string | null
          reason?: string
        }
        Relationships: []
      }
      mystery_tests: {
        Row: {
          attempted_at: string
          conversion_score: number | null
          created_at: string
          evidence: Json | null
          id: string
          lead_id: string
          notes: string | null
          org_id: string
          response_received_at: string | null
          response_time_min: number | null
          sentinel_id: string | null
          sentinel_payload: Json | null
          status: string
          test_type: string
        }
        Insert: {
          attempted_at?: string
          conversion_score?: number | null
          created_at?: string
          evidence?: Json | null
          id?: string
          lead_id: string
          notes?: string | null
          org_id: string
          response_received_at?: string | null
          response_time_min?: number | null
          sentinel_id?: string | null
          sentinel_payload?: Json | null
          status?: string
          test_type: string
        }
        Update: {
          attempted_at?: string
          conversion_score?: number | null
          created_at?: string
          evidence?: Json | null
          id?: string
          lead_id?: string
          notes?: string | null
          org_id?: string
          response_received_at?: string | null
          response_time_min?: number | null
          sentinel_id?: string | null
          sentinel_payload?: Json | null
          status?: string
          test_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "mystery_tests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          id: string
          joined_at: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          default_project_id: string | null
          id: string
          name: string
          owner_id: string | null
          plan: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_project_id?: string | null
          id?: string
          name: string
          owner_id?: string | null
          plan?: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_project_id?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          plan?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_default_project_id_fkey"
            columns: ["default_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assets: {
        Row: {
          agent_id: string
          asset_type: string
          content: Json
          created_at: string
          id: string
          lineage_id: string | null
          project_id: string
          status: string
          task_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          agent_id: string
          asset_type: string
          content?: Json
          created_at?: string
          id?: string
          lineage_id?: string | null
          project_id: string
          status?: string
          task_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          agent_id?: string
          asset_type?: string
          content?: Json
          created_at?: string
          id?: string
          lineage_id?: string | null
          project_id?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assets_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          brand_context: Json | null
          client_id: string | null
          created_at: string
          id: string
          name: string
          org_id: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          brand_context?: Json | null
          client_id?: string | null
          created_at?: string
          id?: string
          name: string
          org_id?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          brand_context?: Json | null
          client_id?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          content: string
          description: string
          embedding: string | null
          id: string
          name: string
        }
        Insert: {
          content: string
          description: string
          embedding?: string | null
          id?: string
          name: string
        }
        Update: {
          content?: string
          description?: string
          embedding?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      social_accounts: {
        Row: {
          access_token_enc: string | null
          business_id: string
          created_at: string
          display_name: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          org_id: string
          platform: string
          refresh_token_enc: string | null
          scopes: string[]
          status: string
          updated_at: string
        }
        Insert: {
          access_token_enc?: string | null
          business_id: string
          created_at?: string
          display_name?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          org_id: string
          platform: string
          refresh_token_enc?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          access_token_enc?: string | null
          business_id?: string
          created_at?: string
          display_name?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          org_id?: string
          platform?: string
          refresh_token_enc?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tasks: {
        Row: {
          archived_at: string | null
          assigned_agent_id: string | null
          attachments: Json
          created_at: string | null
          delegated_by_agent_id: string | null
          description: string
          id: string
          org_id: string | null
          parent_task_id: string | null
          project_id: string | null
          result: string | null
          status: string | null
          tag: string | null
          target_asset_id: string | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_agent_id?: string | null
          attachments?: Json
          created_at?: string | null
          delegated_by_agent_id?: string | null
          description: string
          id?: string
          org_id?: string | null
          parent_task_id?: string | null
          project_id?: string | null
          result?: string | null
          status?: string | null
          tag?: string | null
          target_asset_id?: string | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_agent_id?: string | null
          attachments?: Json
          created_at?: string | null
          delegated_by_agent_id?: string | null
          description?: string
          id?: string
          org_id?: string | null
          parent_task_id?: string | null
          project_id?: string | null
          result?: string | null
          status?: string | null
          tag?: string | null
          target_asset_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_delegated_by_agent_id_fkey"
            columns: ["delegated_by_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_target_asset_id_fkey"
            columns: ["target_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      token_logs: {
        Row: {
          agent_name: string | null
          completion_tokens: number | null
          created_at: string | null
          estimated_cost_usd: number | null
          id: string
          model: string | null
          org_id: string | null
          prompt_tokens: number | null
          task_id: string | null
          total_tokens: number | null
        }
        Insert: {
          agent_name?: string | null
          completion_tokens?: number | null
          created_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          model?: string | null
          org_id?: string | null
          prompt_tokens?: number | null
          task_id?: string | null
          total_tokens?: number | null
        }
        Update: {
          agent_name?: string | null
          completion_tokens?: number | null
          created_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          model?: string | null
          org_id?: string | null
          prompt_tokens?: number | null
          task_id?: string | null
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "token_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_notes: {
        Row: {
          backlinks: string[]
          body: string | null
          canvas_json: Json | null
          content_hash: string | null
          created_at: string
          embedding: string | null
          frontmatter: Json
          id: string
          is_canvas: boolean
          org_id: string
          path: string
          source_id: string | null
          source_table: string | null
          tags: string[]
          title: string
          type: string | null
          updated_at: string
          updated_by: string | null
          wikilinks: string[]
        }
        Insert: {
          backlinks?: string[]
          body?: string | null
          canvas_json?: Json | null
          content_hash?: string | null
          created_at?: string
          embedding?: string | null
          frontmatter?: Json
          id?: string
          is_canvas?: boolean
          org_id: string
          path: string
          source_id?: string | null
          source_table?: string | null
          tags?: string[]
          title: string
          type?: string | null
          updated_at?: string
          updated_by?: string | null
          wikilinks?: string[]
        }
        Update: {
          backlinks?: string[]
          body?: string | null
          canvas_json?: Json | null
          content_hash?: string | null
          created_at?: string
          embedding?: string | null
          frontmatter?: Json
          id?: string
          is_canvas?: boolean
          org_id?: string
          path?: string
          source_id?: string | null
          source_table?: string | null
          tags?: string[]
          title?: string
          type?: string | null
          updated_at?: string
          updated_by?: string | null
          wikilinks?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "vault_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_admin_log: {
        Row: {
          account_id: string
          action: string
          actor_email: string
          bridge_status: number | null
          confirm_value_hash: string | null
          error: string | null
          id: string
          ip: string | null
          result: string
          ts: string
          user_agent: string | null
        }
        Insert: {
          account_id?: string
          action: string
          actor_email: string
          bridge_status?: number | null
          confirm_value_hash?: string | null
          error?: string | null
          id?: string
          ip?: string | null
          result?: string
          ts?: string
          user_agent?: string | null
        }
        Update: {
          account_id?: string
          action?: string
          actor_email?: string
          bridge_status?: number | null
          confirm_value_hash?: string | null
          error?: string | null
          id?: string
          ip?: string | null
          result?: string
          ts?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      wa_bridge_events: {
        Row: {
          account_id: string
          event_type: string
          id: string
          level: string
          message: string
          metadata: Json
          ts: string
        }
        Insert: {
          account_id?: string
          event_type: string
          id?: string
          level: string
          message: string
          metadata?: Json
          ts?: string
        }
        Update: {
          account_id?: string
          event_type?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
          ts?: string
        }
        Relationships: []
      }
      wa_messages: {
        Row: {
          body: string
          created_at: string
          direction: string
          id: string
          lead_id: string | null
          media_duration_s: number | null
          media_mime: string | null
          media_type: string | null
          media_url: string | null
          org_id: string | null
          read_at: string | null
          sent_at: string
          wa_chat_id: string
          wa_message_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          direction: string
          id?: string
          lead_id?: string | null
          media_duration_s?: number | null
          media_mime?: string | null
          media_type?: string | null
          media_url?: string | null
          org_id?: string | null
          read_at?: string | null
          sent_at?: string
          wa_chat_id: string
          wa_message_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          direction?: string
          id?: string
          lead_id?: string | null
          media_duration_s?: number | null
          media_mime?: string | null
          media_type?: string | null
          media_url?: string | null
          org_id?: string | null
          read_at?: string | null
          sent_at?: string
          wa_chat_id?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      cost_summary: {
        Row: {
          agent_name: string | null
          completion_tokens: number | null
          last_call_at: string | null
          llm_calls: number | null
          model: string | null
          org_id: string | null
          project_id: string | null
          project_name: string | null
          prompt_tokens: number | null
          provider: string | null
          started_at: string | null
          task_description: string | null
          task_id: string | null
          total_cost_usd: number | null
          total_tokens: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cascade_task_failure: {
        Args: { failed_task_id: string }
        Returns: number
      }
      claim_due_cron_jobs: {
        Args: never
        Returns: {
          assigned_agent_id: string
          job_id: string
          job_name: string
          org_id: string
          project_id: string
          task_template: string
        }[]
      }
      claim_orphan_clients: { Args: { p_org_id: string }; Returns: number }
      claim_orphan_resources: { Args: { p_org_id: string }; Returns: undefined }
      claim_pending_tasks: {
        Args: { worker_limit: number }
        Returns: {
          archived_at: string | null
          assigned_agent_id: string | null
          attachments: Json
          created_at: string | null
          delegated_by_agent_id: string | null
          description: string
          id: string
          org_id: string | null
          parent_task_id: string | null
          project_id: string | null
          result: string | null
          status: string | null
          tag: string | null
          target_asset_id: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_org_ids: { Args: never; Returns: string[] }
      increment_demo_usage: {
        Args: { p_day: string; p_demo: string; p_ip_hash: string }
        Returns: number
      }
      mish_update_lead_audit: {
        Args: {
          p_conversion_score: number
          p_lead_id: string
          p_notes?: string
          p_response_time_min: number
          p_test_type: string
        }
        Returns: undefined
      }
      provision_user_workspace: {
        Args: { p_display_name: string; p_user_id: string }
        Returns: string
      }
      public_projects: { Args: never; Returns: Json }
      search_knowledge_base: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          agent_name: string
          content: string
          id: string
          similarity: number
          tags: string[]
          topic: string
        }[]
      }
      search_skills: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          description: string
          id: string
          name: string
          similarity: number
        }[]
      }
      seed_org_agents: { Args: { p_org_id: string }; Returns: undefined }
      setup_cron_dispatcher: { Args: { p_service_key: string }; Returns: Json }
      wa_unread_counts: {
        Args: { p_org_id: string }
        Returns: {
          lead_id: string
          unread: number
        }[]
      }
      wa_unread_total: { Args: { p_org_id: string }; Returns: number }
      web_swarm_activity: {
        Args: { p_limit?: number }
        Returns: {
          agent: string
          at: string
          role: string
          verb: string
        }[]
      }
      web_swarm_pulse: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
  ketzal: {
    Enums: {
      booking_status: ["draft", "reserved", "confirmed", "paid", "cancelled"],
      payment_status: ["PENDING", "PARTIAL", "COMPLETED", "REFUNDED"],
      payment_type: ["payment", "refund"],
      user_role: ["user", "admin", "superadmin"],
    },
  },
  public: {
    Enums: {},
  },
} as const
