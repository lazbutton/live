// Généré par `npm run db:types` depuis supabase/migrations/ : ne pas modifier à la main.

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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      app_audience_counts: {
        Row: {
          count: number
          day: string
          metric: string
        }
        Insert: {
          count?: number
          day: string
          metric: string
        }
        Update: {
          count?: number
          day?: string
          metric?: string
        }
        Relationships: []
      }
      app_possible_duplicate_results: {
        Row: {
          event_id: string
          rank: number
          reason: string
        }
        Insert: {
          event_id: string
          rank: number
          reason: string
        }
        Update: {
          event_id?: string
          rank?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_possible_duplicate_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      app_search_results: {
        Row: {
          event_id: string
          rank: number
        }
        Insert: {
          event_id: string
          rank: number
        }
        Update: {
          event_id?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "app_search_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      app_see_also_results: {
        Row: {
          event_id: string
          rank: number
          section: string
          source_events_count: number | null
          source_id: string | null
          source_kind: string | null
          source_name: string | null
        }
        Insert: {
          event_id: string
          rank: number
          section: string
          source_events_count?: number | null
          source_id?: string | null
          source_kind?: string | null
          source_name?: string | null
        }
        Update: {
          event_id?: string
          rank?: number
          section?: string
          source_events_count?: number | null
          source_id?: string | null
          source_kind?: string | null
          source_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_see_also_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: {
          artist_type_label: string | null
          created_at: string
          created_by: string | null
          deezer_url: string | null
          id: string
          image_credit: string | null
          image_license: string | null
          image_source_url: string | null
          image_url: string | null
          instagram_url: string | null
          name: string
          origin_city: string | null
          short_description: string | null
          slug: string
          soundcloud_url: string | null
          tag_ids: string[]
          updated_at: string
          website_url: string | null
        }
        Insert: {
          artist_type_label?: string | null
          created_at?: string
          created_by?: string | null
          deezer_url?: string | null
          id?: string
          image_credit?: string | null
          image_license?: string | null
          image_source_url?: string | null
          image_url?: string | null
          instagram_url?: string | null
          name: string
          origin_city?: string | null
          short_description?: string | null
          slug: string
          soundcloud_url?: string | null
          tag_ids?: string[]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          artist_type_label?: string | null
          created_at?: string
          created_by?: string | null
          deezer_url?: string | null
          id?: string
          image_credit?: string | null
          image_license?: string | null
          image_source_url?: string | null
          image_url?: string | null
          instagram_url?: string | null
          name?: string
          origin_city?: string | null
          short_description?: string | null
          slug?: string
          soundcloud_url?: string | null
          tag_ids?: string[]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_user_id: string
          blocker_user_id: string
          created_at: string
          id: string
          report_id: string | null
          source_event_id: string | null
          updated_at: string
        }
        Insert: {
          blocked_user_id: string
          blocker_user_id: string
          created_at?: string
          id?: string
          report_id?: string | null
          source_event_id?: string | null
          updated_at?: string
        }
        Update: {
          blocked_user_id?: string
          blocker_user_id?: string
          created_at?: string
          id?: string
          report_id?: string | null
          source_event_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "content_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          icon_svg: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          icon_svg?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          icon_svg?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cities: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          label_normalized: string
          slug: string
          updated_at: string
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          label_normalized: string
          slug: string
          updated_at?: string
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          label_normalized?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          admin_note: string | null
          block_requested: boolean
          created_at: string
          details: string | null
          id: string
          reason_code: string
          reported_user_id: string | null
          reporter_user_id: string
          review_due_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_event_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          block_requested?: boolean
          created_at?: string
          details?: string | null
          id?: string
          reason_code: string
          reported_user_id?: string | null
          reporter_user_id: string
          review_due_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_event_id: string
          target_type?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          block_requested?: boolean
          created_at?: string
          details?: string | null
          id?: string
          reason_code?: string
          reported_user_id?: string | null
          reporter_user_id?: string
          review_due_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_event_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_target_event_id_fkey"
            columns: ["target_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_artists: {
        Row: {
          artist_id: string
          created_at: string
          event_id: string
          id: string
          role_label: string | null
          sort_index: number
          updated_at: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          event_id: string
          id?: string
          role_label?: string | null
          sort_index?: number
          updated_at?: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          event_id?: string
          id?: string
          role_label?: string | null
          sort_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_artists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_genres: {
        Row: {
          category_id: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          phrase: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          phrase: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          phrase?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_genres_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      event_likes: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_likes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_opportunities: {
        Row: {
          assigned_to: string | null
          capture_mode: string
          confidence_score: number
          created_at: string
          created_by: string | null
          created_event_id: string | null
          decision_reason: string | null
          detected_category: string | null
          detected_date: string | null
          detected_location: string | null
          duplicate_event_id: string | null
          id: string
          import_metadata: Json | null
          import_payload: Json | null
          import_warnings: Json
          missing_fields: string[]
          notes: string | null
          priority_score: number
          raw_title: string
          source_id: string | null
          source_scan_log_id: string | null
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          capture_mode?: string
          confidence_score?: number
          created_at?: string
          created_by?: string | null
          created_event_id?: string | null
          decision_reason?: string | null
          detected_category?: string | null
          detected_date?: string | null
          detected_location?: string | null
          duplicate_event_id?: string | null
          id?: string
          import_metadata?: Json | null
          import_payload?: Json | null
          import_warnings?: Json
          missing_fields?: string[]
          notes?: string | null
          priority_score?: number
          raw_title: string
          source_id?: string | null
          source_scan_log_id?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          capture_mode?: string
          confidence_score?: number
          created_at?: string
          created_by?: string | null
          created_event_id?: string | null
          decision_reason?: string | null
          detected_category?: string | null
          detected_date?: string | null
          detected_location?: string | null
          duplicate_event_id?: string | null
          id?: string
          import_metadata?: Json | null
          import_payload?: Json | null
          import_warnings?: Json
          missing_fields?: string[]
          notes?: string | null
          priority_score?: number
          raw_title?: string
          source_id?: string | null
          source_scan_log_id?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_opportunities_created_event_id_fkey"
            columns: ["created_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_opportunities_duplicate_event_id_fkey"
            columns: ["duplicate_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_opportunities_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "event_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_opportunities_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "intake_sources_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_opportunities_source_scan_log_id_fkey"
            columns: ["source_scan_log_id"]
            isOneToOne: false
            referencedRelation: "event_source_scan_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      event_organizers: {
        Row: {
          event_id: string
          location_id: string | null
          organizer_id: string | null
        }
        Insert: {
          event_id: string
          location_id?: string | null
          organizer_id?: string | null
        }
        Update: {
          event_id?: string
          location_id?: string | null
          organizer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_organizers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_organizers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_organizers_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_source_scan_logs: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          next_scan_at: string | null
          notes: string | null
          opportunities_found: number
          previous_next_scan_at: string | null
          previous_scan_count: number | null
          scan_count: number | null
          scanned_at: string
          session_key: string | null
          source_id: string
          started_at: string | null
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          next_scan_at?: string | null
          notes?: string | null
          opportunities_found?: number
          previous_next_scan_at?: string | null
          previous_scan_count?: number | null
          scan_count?: number | null
          scanned_at?: string
          session_key?: string | null
          source_id: string
          started_at?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          next_scan_at?: string | null
          notes?: string | null
          opportunities_found?: number
          previous_next_scan_at?: string | null
          previous_scan_count?: number | null
          scan_count?: number | null
          scanned_at?: string
          session_key?: string | null
          source_id?: string
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_source_scan_logs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "event_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_source_scan_logs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "intake_sources_view"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sources: {
        Row: {
          average_scan_minutes: number
          category_hint: string | null
          city_hint: string | null
          created_at: string
          created_by: string | null
          default_capture_mode: string
          discovery_count: number
          id: string
          last_found_at: string | null
          last_scanned_at: string | null
          name: string
          next_scan_at: string | null
          notes: string | null
          novelty_score: number
          organizer_id: string | null
          organizer_location_id: string | null
          priority: string
          reliability_score: number
          scan_count: number
          scan_frequency_days: number
          source_scope: string
          status: string
          type: string
          updated_at: string
          url: string
        }
        Insert: {
          average_scan_minutes?: number
          category_hint?: string | null
          city_hint?: string | null
          created_at?: string
          created_by?: string | null
          default_capture_mode?: string
          discovery_count?: number
          id?: string
          last_found_at?: string | null
          last_scanned_at?: string | null
          name: string
          next_scan_at?: string | null
          notes?: string | null
          novelty_score?: number
          organizer_id?: string | null
          organizer_location_id?: string | null
          priority?: string
          reliability_score?: number
          scan_count?: number
          scan_frequency_days?: number
          source_scope?: string
          status?: string
          type?: string
          updated_at?: string
          url: string
        }
        Update: {
          average_scan_minutes?: number
          category_hint?: string | null
          city_hint?: string | null
          created_at?: string
          created_by?: string | null
          default_capture_mode?: string
          discovery_count?: number
          id?: string
          last_found_at?: string | null
          last_scanned_at?: string | null
          name?: string
          next_scan_at?: string | null
          notes?: string | null
          novelty_score?: number
          organizer_id?: string | null
          organizer_location_id?: string | null
          priority?: string
          reliability_score?: number
          scan_count?: number
          scan_frequency_days?: number
          source_scope?: string
          status?: string
          type?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sources_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sources_organizer_location_id_fkey"
            columns: ["organizer_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          agenda_types: string[]
          archived: boolean
          audience: string | null
          booking: string | null
          capacity: number | null
          category: string
          city_id: string | null
          community_attribution_opt_in: boolean
          community_contributor_label: string | null
          community_submission: boolean
          created_at: string | null
          created_by: string | null
          date: string
          description: string | null
          details_to_confirm: boolean
          door_opening_time: string | null
          end_date: string | null
          end_time: string | null
          external_url: string | null
          external_url_label: string | null
          facebook_url: string | null
          festival_added_at: string | null
          festival_id: string | null
          genre_ids: string[]
          hide_from_home: boolean
          id: string
          image_card_error: string | null
          image_card_url: string | null
          image_color: string | null
          image_height: number | null
          image_url: string | null
          image_width: number | null
          instagram_url: string | null
          is_featured: boolean
          is_full: boolean | null
          is_pay_what_you_want: boolean
          is_safety_hidden: boolean
          is_young_audience: boolean
          latitude: number | null
          location_id: string | null
          longitude: number | null
          min_age: number | null
          presale_price: number | null
          price: number | null
          price_kind: string | null
          price_max: number | null
          price_min: number | null
          published_at: string | null
          room_id: string | null
          scraping_url: string | null
          show_on_app: boolean
          status: string | null
          subscriber_price: number | null
          tag_ids: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          agenda_types?: string[]
          archived?: boolean
          audience?: string | null
          booking?: string | null
          capacity?: number | null
          category: string
          city_id?: string | null
          community_attribution_opt_in?: boolean
          community_contributor_label?: string | null
          community_submission?: boolean
          created_at?: string | null
          created_by?: string | null
          date: string
          description?: string | null
          details_to_confirm?: boolean
          door_opening_time?: string | null
          end_date?: string | null
          end_time?: string | null
          external_url?: string | null
          external_url_label?: string | null
          facebook_url?: string | null
          festival_added_at?: string | null
          festival_id?: string | null
          genre_ids?: string[]
          hide_from_home?: boolean
          id?: string
          image_card_error?: string | null
          image_card_url?: string | null
          image_color?: string | null
          image_height?: number | null
          image_url?: string | null
          image_width?: number | null
          instagram_url?: string | null
          is_featured?: boolean
          is_full?: boolean | null
          is_pay_what_you_want?: boolean
          is_safety_hidden?: boolean
          is_young_audience?: boolean
          latitude?: number | null
          location_id?: string | null
          longitude?: number | null
          min_age?: number | null
          presale_price?: number | null
          price?: number | null
          price_kind?: string | null
          price_max?: number | null
          price_min?: number | null
          published_at?: string | null
          room_id?: string | null
          scraping_url?: string | null
          show_on_app?: boolean
          status?: string | null
          subscriber_price?: number | null
          tag_ids?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          agenda_types?: string[]
          archived?: boolean
          audience?: string | null
          booking?: string | null
          capacity?: number | null
          category?: string
          city_id?: string | null
          community_attribution_opt_in?: boolean
          community_contributor_label?: string | null
          community_submission?: boolean
          created_at?: string | null
          created_by?: string | null
          date?: string
          description?: string | null
          details_to_confirm?: boolean
          door_opening_time?: string | null
          end_date?: string | null
          end_time?: string | null
          external_url?: string | null
          external_url_label?: string | null
          facebook_url?: string | null
          festival_added_at?: string | null
          festival_id?: string | null
          genre_ids?: string[]
          hide_from_home?: boolean
          id?: string
          image_card_error?: string | null
          image_card_url?: string | null
          image_color?: string | null
          image_height?: number | null
          image_url?: string | null
          image_width?: number | null
          instagram_url?: string | null
          is_featured?: boolean
          is_full?: boolean | null
          is_pay_what_you_want?: boolean
          is_safety_hidden?: boolean
          is_young_audience?: boolean
          latitude?: number | null
          location_id?: string | null
          longitude?: number | null
          min_age?: number | null
          presale_price?: number | null
          price?: number | null
          price_kind?: string | null
          price_max?: number | null
          price_min?: number | null
          published_at?: string | null
          room_id?: string | null
          scraping_url?: string | null
          show_on_app?: boolean
          status?: string | null
          subscriber_price?: number | null
          tag_ids?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_objects: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      feedbacks: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          description: string
          feedback_object_id: string
          id: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          description: string
          feedback_object_id: string
          id?: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          description?: string
          feedback_object_id?: string
          id?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_feedback_object_id_fkey"
            columns: ["feedback_object_id"]
            isOneToOne: false
            referencedRelation: "feedback_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_locations: {
        Row: {
          festival_id: string
          id: string
          location_id: string
          sort_index: number
        }
        Insert: {
          festival_id: string
          id?: string
          location_id: string
          sort_index?: number
        }
        Update: {
          festival_id?: string
          id?: string
          location_id?: string
          sort_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "festival_locations_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      global_sources: {
        Row: {
          created_at: string
          source_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          source_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "event_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "intake_sources_view"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string
          capacity: number | null
          city_id: string | null
          created_at: string | null
          directions: string | null
          facebook_page_id: string | null
          facebook_url: string | null
          id: string
          image_url: string | null
          instagram_url: string | null
          is_organizer: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          scraping_example_url: string | null
          short_description: string | null
          source_capture_mode: string
          suggested: boolean
          tiktok_url: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          address: string
          capacity?: number | null
          city_id?: string | null
          created_at?: string | null
          directions?: string | null
          facebook_page_id?: string | null
          facebook_url?: string | null
          id?: string
          image_url?: string | null
          instagram_url?: string | null
          is_organizer?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          scraping_example_url?: string | null
          short_description?: string | null
          source_capture_mode?: string
          suggested?: boolean
          tiktok_url?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string
          capacity?: number | null
          city_id?: string | null
          created_at?: string | null
          directions?: string | null
          facebook_page_id?: string | null
          facebook_url?: string | null
          id?: string
          image_url?: string | null
          instagram_url?: string | null
          is_organizer?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          scraping_example_url?: string | null
          short_description?: string | null
          source_capture_mode?: string
          suggested?: boolean
          tiktok_url?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      major_event_events: {
        Row: {
          created_at: string
          event_id: string
          is_featured: boolean
          major_event_id: string
          program_label_override: string | null
          sort_index: number
        }
        Insert: {
          created_at?: string
          event_id: string
          is_featured?: boolean
          major_event_id: string
          program_label_override?: string | null
          sort_index?: number
        }
        Update: {
          created_at?: string
          event_id?: string
          is_featured?: boolean
          major_event_id?: string
          program_label_override?: string | null
          sort_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "major_event_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "major_event_events_major_event_id_fkey"
            columns: ["major_event_id"]
            isOneToOne: false
            referencedRelation: "major_events"
            referencedColumns: ["id"]
          },
        ]
      }
      major_event_locations: {
        Row: {
          created_at: string
          is_featured: boolean
          label_override: string | null
          location_id: string
          major_event_id: string
          sort_index: number
        }
        Insert: {
          created_at?: string
          is_featured?: boolean
          label_override?: string | null
          location_id: string
          major_event_id: string
          sort_index?: number
        }
        Update: {
          created_at?: string
          is_featured?: boolean
          label_override?: string | null
          location_id?: string
          major_event_id?: string
          sort_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "major_event_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "major_event_locations_major_event_id_fkey"
            columns: ["major_event_id"]
            isOneToOne: false
            referencedRelation: "major_events"
            referencedColumns: ["id"]
          },
        ]
      }
      major_event_organizers: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          major_event_id: string
          organizer_id: string | null
          role_label: string | null
          sort_index: number
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          major_event_id: string
          organizer_id?: string | null
          role_label?: string | null
          sort_index?: number
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          major_event_id?: string
          organizer_id?: string | null
          role_label?: string | null
          sort_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "major_event_organizers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "major_event_organizers_major_event_id_fkey"
            columns: ["major_event_id"]
            isOneToOne: false
            referencedRelation: "major_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "major_event_organizers_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      major_events: {
        Row: {
          city_id: string | null
          city_name: string | null
          created_at: string
          created_by: string | null
          default_map_zoom: number | null
          end_at: string
          hero_image_url: string | null
          id: string
          is_featured: boolean
          logo_url: string | null
          long_description: string | null
          map_center_latitude: number | null
          map_center_longitude: number | null
          official_url: string | null
          primary_category: string | null
          short_description: string | null
          slug: string
          start_at: string
          status: string
          tag_ids: string[]
          ticketing_url: string | null
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          city_id?: string | null
          city_name?: string | null
          created_at?: string
          created_by?: string | null
          default_map_zoom?: number | null
          end_at: string
          hero_image_url?: string | null
          id?: string
          is_featured?: boolean
          logo_url?: string | null
          long_description?: string | null
          map_center_latitude?: number | null
          map_center_longitude?: number | null
          official_url?: string | null
          primary_category?: string | null
          short_description?: string | null
          slug: string
          start_at: string
          status?: string
          tag_ids?: string[]
          ticketing_url?: string | null
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          city_id?: string | null
          city_name?: string | null
          created_at?: string
          created_by?: string | null
          default_map_zoom?: number | null
          end_at?: string
          hero_image_url?: string | null
          id?: string
          is_featured?: boolean
          logo_url?: string | null
          long_description?: string | null
          map_center_latitude?: number | null
          map_center_longitude?: number | null
          official_url?: string | null
          primary_category?: string | null
          short_description?: string | null
          slug?: string
          start_at?: string
          status?: string
          tag_ids?: string[]
          ticketing_url?: string | null
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "major_events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          body: string
          covered_until: string | null
          created_at: string | null
          delivery_date: string | null
          delivery_key: string | null
          event_ids: string[] | null
          flow_type: string | null
          id: string
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          covered_until?: string | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_key?: string | null
          event_ids?: string[] | null
          flow_type?: string | null
          id?: string
          sent_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          covered_until?: string | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_key?: string | null
          event_ids?: string[] | null
          flow_type?: string | null
          id?: string
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          created_at: string | null
          id: string
          in_app_popup_badge: string | null
          in_app_popup_cta_label: string | null
          in_app_popup_cta_url: string | null
          in_app_popup_enabled: boolean
          in_app_popup_image_url: string | null
          in_app_popup_message: string | null
          in_app_popup_theme: string
          in_app_popup_title: string | null
          is_active: boolean | null
          is_password_auth_enabled: boolean
          notification_time: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          in_app_popup_badge?: string | null
          in_app_popup_cta_label?: string | null
          in_app_popup_cta_url?: string | null
          in_app_popup_enabled?: boolean
          in_app_popup_image_url?: string | null
          in_app_popup_message?: string | null
          in_app_popup_theme?: string
          in_app_popup_title?: string | null
          is_active?: boolean | null
          is_password_auth_enabled?: boolean
          notification_time?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          in_app_popup_badge?: string | null
          in_app_popup_cta_label?: string | null
          in_app_popup_cta_url?: string | null
          in_app_popup_enabled?: boolean
          in_app_popup_image_url?: string | null
          in_app_popup_message?: string | null
          in_app_popup_theme?: string
          in_app_popup_title?: string | null
          is_active?: boolean | null
          is_password_auth_enabled?: boolean
          notification_time?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      organizer_agenda_scraping_configs: {
        Row: {
          agenda_url: string
          created_at: string
          enabled: boolean
          event_link_attribute: string
          event_link_selector: string
          id: string
          location_id: string | null
          max_pages: number
          next_page_attribute: string
          next_page_selector: string | null
          organizer_id: string | null
          updated_at: string
        }
        Insert: {
          agenda_url: string
          created_at?: string
          enabled?: boolean
          event_link_attribute?: string
          event_link_selector: string
          id?: string
          location_id?: string | null
          max_pages?: number
          next_page_attribute?: string
          next_page_selector?: string | null
          organizer_id?: string | null
          updated_at?: string
        }
        Update: {
          agenda_url?: string
          created_at?: string
          enabled?: boolean
          event_link_attribute?: string
          event_link_selector?: string
          id?: string
          location_id?: string | null
          max_pages?: number
          next_page_attribute?: string
          next_page_selector?: string | null
          organizer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_agenda_scraping_configs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_agenda_scraping_configs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_ai_fields: {
        Row: {
          ai_hint: string | null
          created_at: string | null
          enabled: boolean | null
          field_name: string
          id: string
          location_id: string | null
          organizer_id: string | null
          updated_at: string | null
        }
        Insert: {
          ai_hint?: string | null
          created_at?: string | null
          enabled?: boolean | null
          field_name: string
          id?: string
          location_id?: string | null
          organizer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_hint?: string | null
          created_at?: string | null
          enabled?: boolean | null
          field_name?: string
          id?: string
          location_id?: string | null
          organizer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_ai_fields_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_ai_fields_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          organizer_id: string
          performed_by: string
          target_user_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          organizer_id: string
          performed_by: string
          target_user_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          organizer_id?: string
          performed_by?: string
          target_user_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      organizer_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          organizer_id: string
          role: string | null
          token: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          organizer_id: string
          role?: string | null
          token?: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          organizer_id?: string
          role?: string | null
          token?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      organizer_notifications: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          message: string
          metadata: Json | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_scraping_configs: {
        Row: {
          attribute: string | null
          created_at: string | null
          css_selector: string
          event_field: string
          id: string
          location_id: string | null
          organizer_id: string | null
          text_prefix: string | null
          transform_function: string | null
          updated_at: string | null
        }
        Insert: {
          attribute?: string | null
          created_at?: string | null
          css_selector: string
          event_field: string
          id?: string
          location_id?: string | null
          organizer_id?: string | null
          text_prefix?: string | null
          transform_function?: string | null
          updated_at?: string | null
        }
        Update: {
          attribute?: string | null
          created_at?: string | null
          css_selector?: string
          event_field?: string
          id?: string
          location_id?: string | null
          organizer_id?: string | null
          text_prefix?: string | null
          transform_function?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_scraping_configs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_scraping_configs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      organizers: {
        Row: {
          created_at: string | null
          facebook_page_id: string | null
          facebook_url: string | null
          icon_url: string | null
          id: string
          instagram_url: string | null
          logo_url: string | null
          name: string
          scraping_example_url: string | null
          short_description: string | null
          source_capture_mode: string
          tiktok_url: string | null
          updated_at: string | null
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string | null
          facebook_page_id?: string | null
          facebook_url?: string | null
          icon_url?: string | null
          id?: string
          instagram_url?: string | null
          logo_url?: string | null
          name: string
          scraping_example_url?: string | null
          short_description?: string | null
          source_capture_mode?: string
          tiktok_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string | null
          facebook_page_id?: string | null
          facebook_url?: string | null
          icon_url?: string | null
          id?: string
          instagram_url?: string | null
          logo_url?: string | null
          name?: string
          scraping_example_url?: string | null
          short_description?: string | null
          source_capture_mode?: string
          tiktok_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      owner_sources: {
        Row: {
          created_at: string
          organizer_id: string | null
          organizer_location_id: string | null
          source_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          organizer_id?: string | null
          organizer_location_id?: string | null
          source_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          organizer_id?: string | null
          organizer_location_id?: string | null
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_sources_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_sources_organizer_location_id_fkey"
            columns: ["organizer_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "event_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "intake_sources_view"
            referencedColumns: ["id"]
          },
        ]
      }
      poster_analysis_usage: {
        Row: {
          analyses_count: number
          day: string
          is_guest: boolean
          user_id: string
        }
        Insert: {
          analyses_count?: number
          day: string
          is_guest?: boolean
          user_id: string
        }
        Update: {
          analyses_count?: number
          day?: string
          is_guest?: boolean
          user_id?: string
        }
        Relationships: []
      }
      radio_episodes: {
        Row: {
          aired_at: string
          audio_url: string
          created_at: string
          duration_s: number | null
          guid: string
          id: string
          page_url: string | null
          show_id: string
          title: string
          updated_at: string
        }
        Insert: {
          aired_at: string
          audio_url: string
          created_at?: string
          duration_s?: number | null
          guid: string
          id?: string
          page_url?: string | null
          show_id: string
          title: string
          updated_at?: string
        }
        Update: {
          aired_at?: string
          audio_url?: string
          created_at?: string
          duration_s?: number | null
          guid?: string
          id?: string
          page_url?: string | null
          show_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "radio_episodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "radio_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      radio_show_sync: {
        Row: {
          feed_checked_at: string | null
          feed_etag: string | null
          feed_last_modified: string | null
          page_checked_at: string | null
          show_id: string
          source_modified_at: string | null
        }
        Insert: {
          feed_checked_at?: string | null
          feed_etag?: string | null
          feed_last_modified?: string | null
          page_checked_at?: string | null
          show_id: string
          source_modified_at?: string | null
        }
        Update: {
          feed_checked_at?: string | null
          feed_etag?: string | null
          feed_last_modified?: string | null
          page_checked_at?: string | null
          show_id?: string
          source_modified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radio_show_sync_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "radio_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      radio_shows: {
        Row: {
          created_at: string
          description: string | null
          family: string
          feed_url: string | null
          id: string
          image_url: string | null
          last_episode_at: string | null
          name: string
          organizer_id: string | null
          page_url: string
          slots: Json
          slug: string
          source_id: number
          station_id: string
          style: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          family?: string
          feed_url?: string | null
          id?: string
          image_url?: string | null
          last_episode_at?: string | null
          name: string
          organizer_id?: string | null
          page_url: string
          slots?: Json
          slug: string
          source_id: number
          station_id: string
          style?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          family?: string
          feed_url?: string | null
          id?: string
          image_url?: string | null
          last_episode_at?: string | null
          name?: string
          organizer_id?: string | null
          page_url?: string
          slots?: Json
          slug?: string
          source_id?: number
          station_id?: string
          style?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "radio_shows_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radio_shows_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "radio_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      radio_stations: {
        Row: {
          created_at: string
          enabled: boolean
          frequency: string
          id: string
          name: string
          organizer_id: string
          site_url: string
          status_url: string
          stream_url: string
          stream_url_light: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          frequency: string
          id?: string
          name: string
          organizer_id: string
          site_url: string
          status_url: string
          stream_url: string
          stream_url_light?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          name?: string
          organizer_id?: string
          site_url?: string
          status_url?: string
          stream_url?: string
          stream_url_light?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "radio_stations_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: true
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number | null
          created_at: string | null
          description: string | null
          id: string
          location_id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          location_id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          location_id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      school_holidays: {
        Row: {
          academy: string
          created_at: string
          first_day: string
          id: string
          last_day: string
          name: string
          school_year: string
          source_end_date: string
          source_start_date: string
          updated_at: string
          zone: string
        }
        Insert: {
          academy: string
          created_at?: string
          first_day: string
          id?: string
          last_day: string
          name: string
          school_year: string
          source_end_date: string
          source_start_date: string
          updated_at?: string
          zone: string
        }
        Update: {
          academy?: string
          created_at?: string
          first_day?: string
          id?: string
          last_day?: string
          name?: string
          school_year?: string
          source_end_date?: string
          source_start_date?: string
          updated_at?: string
          zone?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_at: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_hidden_events: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_hidden_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_categories: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          category_ids: string[] | null
          created_at: string | null
          follows_enabled: boolean
          frequency: string
          id: string
          is_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category_ids?: string[] | null
          created_at?: string | null
          follows_enabled?: boolean
          frequency?: string
          id?: string
          is_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category_ids?: string[] | null
          created_at?: string | null
          follows_enabled?: boolean
          frequency?: string
          id?: string
          is_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_organizers: {
        Row: {
          created_at: string | null
          id: string
          organizer_id: string
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organizer_id: string
          role?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organizer_id?: string
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_push_tokens: {
        Row: {
          app_version: string | null
          created_at: string | null
          device_id: string | null
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          device_id?: string | null
          id?: string
          platform: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          device_id?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_requests: {
        Row: {
          allow_user_resubmission: boolean
          community_attribution_opt_in: boolean
          contributor_display_name: string | null
          contributor_message: string | null
          converted_at: string | null
          converted_event_id: string | null
          created_at: string | null
          event_data: Json | null
          id: string
          internal_notes: string | null
          location_id: string | null
          location_name: string | null
          moderation_reason: string | null
          notes: string | null
          request_type: string | null
          requested_at: string | null
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_url: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          allow_user_resubmission?: boolean
          community_attribution_opt_in?: boolean
          contributor_display_name?: string | null
          contributor_message?: string | null
          converted_at?: string | null
          converted_event_id?: string | null
          created_at?: string | null
          event_data?: Json | null
          id?: string
          internal_notes?: string | null
          location_id?: string | null
          location_name?: string | null
          moderation_reason?: string | null
          notes?: string | null
          request_type?: string | null
          requested_at?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          allow_user_resubmission?: boolean
          community_attribution_opt_in?: boolean
          contributor_display_name?: string | null
          contributor_message?: string | null
          converted_at?: string | null
          converted_event_id?: string | null
          created_at?: string | null
          event_data?: Json | null
          id?: string
          internal_notes?: string | null
          location_id?: string | null
          location_name?: string | null
          moderation_reason?: string | null
          notes?: string | null
          request_type?: string | null
          requested_at?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_requests_converted_event_id_fkey"
            columns: ["converted_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      event_source_sync_audit: {
        Row: {
          issue_type: string | null
          owner_id: string | null
          owner_name: string | null
          owner_type: string | null
          source_id: string | null
          source_name: string | null
        }
        Relationships: []
      }
      intake_sources_view: {
        Row: {
          average_scan_minutes: number | null
          category_hint: string | null
          city_hint: string | null
          created_at: string | null
          default_capture_mode: string | null
          discovery_count: number | null
          id: string | null
          is_editable: boolean | null
          last_found_at: string | null
          last_scanned_at: string | null
          name: string | null
          next_scan_at: string | null
          notes: string | null
          novelty_score: number | null
          organizer_id: string | null
          organizer_location_id: string | null
          priority: string | null
          reliability_score: number | null
          scan_count: number | null
          scan_frequency_days: number | null
          source_scope: string | null
          status: string | null
          type: string | null
          updated_at: string | null
          url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_sources_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_sources_organizer_location_id_fkey"
            columns: ["organizer_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_organizer_invitation: {
        Args: { invitation_token: string; user_id_param: string }
        Returns: Json
      }
      app_audience_add: { Args: { counts: Json; day: string }; Returns: number }
      app_category_counts: {
        Args: {
          at_time?: string
          city_ids?: string[]
          zone_city?: string
          zone_km?: number
        }
        Returns: {
          category_id: string
          display_order: number
          events_count: number
          name: string
        }[]
      }
      app_cities: {
        Args: { at_time?: string }
        Returns: {
          center_lat: number
          center_lng: number
          id: string
          label: string
          last_event_date: string
          next_event_date: string
          recent_events_count: number
          search_aliases: string[]
          slug: string
          source_ids: string[]
          upcoming_events_count: number
        }[]
      }
      app_city_groups: {
        Args: never
        Returns: {
          center_lat: number
          center_lng: number
          group_key: string
          id: string
          label: string
          search_aliases: string[]
          slug: string
          source_ids: string[]
        }[]
      }
      app_distance_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      app_event_counts: {
        Args: {
          at_time?: string
          category?: string
          city_ids?: string[]
          family?: boolean
          free?: boolean
          ranges: Json
          zone_city?: string
          zone_km?: number
        }
        Returns: {
          events_count: number
          range_end: string
          range_index: number
          range_key: string
          range_start: string
          starting_count: number
        }[]
      }
      app_event_in_range: {
        Args: {
          event_date: string
          event_end_date: string
          range_end: string
          range_start: string
        }
        Returns: boolean
      }
      app_event_series: {
        Args: { at_time?: string }
        Returns: {
          date: string
          dates_count: number
          event_id: string
          series_id: string
        }[]
      }
      app_event_series_of: {
        Args: {
          dates: string[]
          event_ids: string[]
          location_ids: string[]
          titles: string[]
        }
        Returns: {
          date: string
          dates_count: number
          event_id: string
          series_id: string
        }[]
      }
      app_event_series_title: { Args: { title: string }; Returns: string }
      app_event_title_without_date: { Args: { title: string }; Returns: string }
      app_events: {
        Args: never
        Returns: {
          address: string | null
          agenda_types: string[]
          archived: boolean
          audience: string | null
          booking: string | null
          capacity: number | null
          category: string
          city_id: string | null
          community_attribution_opt_in: boolean
          community_contributor_label: string | null
          community_submission: boolean
          created_at: string | null
          created_by: string | null
          date: string
          description: string | null
          details_to_confirm: boolean
          door_opening_time: string | null
          end_date: string | null
          end_time: string | null
          external_url: string | null
          external_url_label: string | null
          facebook_url: string | null
          festival_added_at: string | null
          festival_id: string | null
          genre_ids: string[]
          hide_from_home: boolean
          id: string
          image_card_error: string | null
          image_card_url: string | null
          image_color: string | null
          image_height: number | null
          image_url: string | null
          image_width: number | null
          instagram_url: string | null
          is_featured: boolean
          is_full: boolean | null
          is_pay_what_you_want: boolean
          is_safety_hidden: boolean
          is_young_audience: boolean
          latitude: number | null
          location_id: string | null
          longitude: number | null
          min_age: number | null
          presale_price: number | null
          price: number | null
          price_kind: string | null
          price_max: number | null
          price_min: number | null
          published_at: string | null
          room_id: string | null
          scraping_url: string | null
          show_on_app: boolean
          status: string | null
          subscriber_price: number | null
          tag_ids: string[] | null
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      app_events_in_range: {
        Args: {
          at_time?: string
          category?: string
          city_ids?: string[]
          family?: boolean
          free?: boolean
          range_end?: string
          range_start: string
          zone_city?: string
          zone_km?: number
        }
        Returns: {
          address: string | null
          agenda_types: string[]
          archived: boolean
          audience: string | null
          booking: string | null
          capacity: number | null
          category: string
          city_id: string | null
          community_attribution_opt_in: boolean
          community_contributor_label: string | null
          community_submission: boolean
          created_at: string | null
          created_by: string | null
          date: string
          description: string | null
          details_to_confirm: boolean
          door_opening_time: string | null
          end_date: string | null
          end_time: string | null
          external_url: string | null
          external_url_label: string | null
          facebook_url: string | null
          festival_added_at: string | null
          festival_id: string | null
          genre_ids: string[]
          hide_from_home: boolean
          id: string
          image_card_error: string | null
          image_card_url: string | null
          image_color: string | null
          image_height: number | null
          image_url: string | null
          image_width: number | null
          instagram_url: string | null
          is_featured: boolean
          is_full: boolean | null
          is_pay_what_you_want: boolean
          is_safety_hidden: boolean
          is_young_audience: boolean
          latitude: number | null
          location_id: string | null
          longitude: number | null
          min_age: number | null
          presale_price: number | null
          price: number | null
          price_kind: string | null
          price_max: number | null
          price_min: number | null
          published_at: string | null
          room_id: string | null
          scraping_url: string | null
          show_on_app: boolean
          status: string | null
          subscriber_price: number | null
          tag_ids: string[] | null
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      app_events_in_zone: {
        Args: { zone_city?: string; zone_km?: number }
        Returns: {
          address: string | null
          agenda_types: string[]
          archived: boolean
          audience: string | null
          booking: string | null
          capacity: number | null
          category: string
          city_id: string | null
          community_attribution_opt_in: boolean
          community_contributor_label: string | null
          community_submission: boolean
          created_at: string | null
          created_by: string | null
          date: string
          description: string | null
          details_to_confirm: boolean
          door_opening_time: string | null
          end_date: string | null
          end_time: string | null
          external_url: string | null
          external_url_label: string | null
          facebook_url: string | null
          festival_added_at: string | null
          festival_id: string | null
          genre_ids: string[]
          hide_from_home: boolean
          id: string
          image_card_error: string | null
          image_card_url: string | null
          image_color: string | null
          image_height: number | null
          image_url: string | null
          image_width: number | null
          instagram_url: string | null
          is_featured: boolean
          is_full: boolean | null
          is_pay_what_you_want: boolean
          is_safety_hidden: boolean
          is_young_audience: boolean
          latitude: number | null
          location_id: string | null
          longitude: number | null
          min_age: number | null
          presale_price: number | null
          price: number | null
          price_kind: string | null
          price_max: number | null
          price_min: number | null
          published_at: string | null
          room_id: string | null
          scraping_url: string | null
          show_on_app: boolean
          status: string | null
          subscriber_price: number | null
          tag_ids: string[] | null
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      app_festival_events: {
        Args: { at_time?: string }
        Returns: {
          date: string
          event_id: string
          events_count: number
          festival_id: string
        }[]
      }
      app_follows: {
        Args: { at_time?: string }
        Returns: {
          followed_at: string
          image_url: string
          name: string
          new_count: number
          target_id: string
          target_type: string
          upcoming_count: number
        }[]
      }
      app_in_zone: {
        Args: {
          city_id: string
          latitude: number
          longitude: number
          zone_city_ids: string[]
          zone_km: number
          zone_lat: number
          zone_lng: number
        }
        Returns: boolean
      }
      app_link_keys: { Args: { link: string }; Returns: string[] }
      app_major_events_in_zone: {
        Args: { zone_city?: string; zone_km?: number }
        Returns: {
          city_id: string | null
          city_name: string | null
          created_at: string
          created_by: string | null
          default_map_zoom: number | null
          end_at: string
          hero_image_url: string | null
          id: string
          is_featured: boolean
          logo_url: string | null
          long_description: string | null
          map_center_latitude: number | null
          map_center_longitude: number | null
          official_url: string | null
          primary_category: string | null
          short_description: string | null
          slug: string
          start_at: string
          status: string
          tag_ids: string[]
          ticketing_url: string | null
          timezone: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "major_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      app_on_tout: {
        Args: { e: Database["public"]["Tables"]["events"]["Row"] }
        Returns: boolean
      }
      app_organizer_counts: {
        Args: {
          at_time?: string
          city_ids?: string[]
          organizer_ids: string[]
          zone_city?: string
          zone_km?: number
        }
        Returns: {
          events_count: number
          kind: string
          organizer_id: string
        }[]
      }
      app_possible_duplicates: {
        Args: {
          at_time?: string
          link?: string
          location_id?: string
          max_results?: number
          starts_at?: string
          title?: string
        }
        Returns: {
          event_id: string
          rank: number
          reason: string
        }[]
        SetofOptions: {
          from: "*"
          to: "app_possible_duplicate_results"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      app_radio_day: {
        Args: { p_at?: string; p_day: string; p_station: string }
        Returns: {
          audio_url: string
          duration_s: number
          ends_at: string
          episode_id: string
          family: string
          image_url: string
          name: string
          show_id: string
          slug: string
          starts_at: string
          state: string
          style: string
        }[]
      }
      app_radio_shows: {
        Args: { p_at?: string; p_station: string }
        Returns: {
          description: string
          family: string
          id: string
          image_url: string
          last_episode_at: string
          letter: string
          name: string
          organizer_id: string
          page_url: string
          slots: Json
          slug: string
          style: string
        }[]
      }
      app_search: {
        Args: {
          at_time?: string
          city_ids?: string[]
          max_results?: number
          query: string
          zone_city?: string
          zone_km?: number
        }
        Returns: {
          event_id: string
          rank: number
        }[]
        SetofOptions: {
          from: "*"
          to: "app_search_results"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      app_search_names: {
        Args: {
          at_time?: string
          city_ids?: string[]
          max_results?: number
          query: string
          zone_city?: string
          zone_km?: number
        }
        Returns: {
          city: string
          events_count: number
          id: string
          image_url: string
          is_organizer: boolean
          kind: string
          name: string
          rank: number
        }[]
      }
      app_search_normalize: { Args: { value: string }; Returns: string }
      app_search_query_words: {
        Args: { query: string }
        Returns: {
          phrase: string
          required: boolean
          word: string
          word_count: number
          word_pattern: string
          word_prefix: string
          word_query: unknown
        }[]
      }
      app_search_word_score: {
        Args: {
          content: string
          document?: unknown
          word: string
          word_pattern: string
          word_prefix: string
          word_query: unknown
        }
        Returns: number
      }
      app_see_also: {
        Args: {
          at_time?: string
          city_ids?: string[]
          event_id: string
          max_results?: number
          zone_city?: string
          zone_km?: number
        }
        Returns: {
          event_id: string
          rank: number
          section: string
          source_events_count: number | null
          source_id: string | null
          source_kind: string | null
          source_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "app_see_also_results"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      app_similar_titles: {
        Args: { left_title: string; right_title: string }
        Returns: boolean
      }
      app_tag_counts: {
        Args: {
          at_time?: string
          city_ids?: string[]
          max_tags?: number
          zone_city?: string
          zone_km?: number
        }
        Returns: {
          events_count: number
          name: string
          tag_id: string
        }[]
      }
      app_zone: {
        Args: { zone_city: string; zone_km?: number }
        Returns: {
          center_lat: number
          center_lng: number
          city_ids: string[]
          radius_km: number
        }[]
      }
      app_zone_counts: {
        Args: { at_time?: string; radii?: number[]; zone_city: string }
        Returns: {
          events_count: number
          radius_km: number
        }[]
      }
      can_use_ugc_features: { Args: never; Returns: boolean }
      check_organizer_id_exists: {
        Args: { organizer_uuid: string }
        Returns: boolean
      }
      check_rls_policies: {
        Args: never
        Returns: {
          policy_cmd: string
          policy_name: string
          policy_qual: string
          table_name: string
        }[]
      }
      cleanup_free_tier_technical_data: {
        Args: { p_batch_size?: number }
        Returns: Json
      }
      convert_event_request_to_event: {
        Args: { request_id: string }
        Returns: string
      }
      copy_guest_data: {
        Args: { guest_session_id: string }
        Returns: {
          follows: number
          hidden_events: number
          likes: number
          notification_categories: number
          notification_preferences: number
        }[]
      }
      event_like_counts: {
        Args: { event_ids: string[] }
        Returns: {
          event_id: string
          likes_count: number
        }[]
      }
      extract_city_label_from_address: {
        Args: { address: string }
        Returns: string
      }
      follows_digest: {
        Args: { at_time?: string }
        Returns: {
          event_date: string
          event_id: string
          event_title: string
          target_id: string
          target_name: string
          target_type: string
          user_id: string
        }[]
      }
      format_entity_label: { Args: { value: string }; Returns: string }
      get_invitation_by_token: {
        Args: { invitation_token: string }
        Returns: {
          accepted_at: string
          created_at: string
          email: string
          expires_at: string
          id: string
          organizer_id: string
          role: string
        }[]
      }
      get_or_create_user_by_email: {
        Args: { user_email: string }
        Returns: string
      }
      get_user_emails: {
        Args: { user_ids: string[] }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      inactive_guest_sessions: {
        Args: never
        Returns: {
          last_activity: string
          user_id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_event_approved_for_public_event_artists: {
        Args: { target_event_id: string }
        Returns: boolean
      }
      is_event_approved_for_public_event_organizers: {
        Args: { target_event_id: string }
        Returns: boolean
      }
      is_real_authenticated_user: { Args: never; Returns: boolean }
      is_user_admin: { Args: never; Returns: boolean }
      is_user_organizer: { Args: { organizer_uuid?: string }; Returns: boolean }
      is_user_safety_suspended: { Args: never; Returns: boolean }
      make_user_admin: { Args: { user_email: string }; Returns: string }
      normalize_artist_label: { Args: { value: string }; Returns: string }
      normalize_city_label: { Args: { value: string }; Returns: string }
      normalize_entity_label: { Args: { value: string }; Returns: string }
      pick_event_source_capture_mode: {
        Args: {
          facebook_url: string
          instagram_url: string
          website_url: string
        }
        Returns: string
      }
      pick_event_source_type: {
        Args: {
          facebook_url: string
          instagram_url: string
          website_url: string
        }
        Returns: string
      }
      pick_event_source_url: {
        Args: {
          facebook_url: string
          instagram_url: string
          website_url: string
        }
        Returns: string
      }
      pick_owner_source_capture_mode: {
        Args: {
          explicit_mode: string
          facebook_url: string
          instagram_url: string
          website_url: string
        }
        Returns: string
      }
      public_contributor_label: {
        Args: { display_name: string }
        Returns: string
      }
      purge_inactive_guest_sessions: { Args: never; Returns: Json }
      radio_live_grid: {
        Args: { p_at?: string; p_station: string }
        Returns: {
          ends_at: string
          family: string
          image_url: string
          kind: string
          name: string
          show_id: string
          starts_at: string
          style: string
        }[]
      }
      radio_request_import: { Args: never; Returns: number }
      radio_show_is_active: {
        Args: { at_time: string; last_episode_at: string }
        Returns: boolean
      }
      radio_show_letter: { Args: { name: string }; Returns: string }
      radio_show_sort_key: { Args: { name: string }; Returns: string }
      radio_slot_occurrences: {
        Args: { p_first_day: string; p_last_day: string; p_station: string }
        Returns: {
          ends_at: string
          show_id: string
          starts_at: string
        }[]
      }
      radio_slots_valid: { Args: { slots: Json }; Returns: boolean }
      refresh_city_center: { Args: { p_city_id: string }; Returns: undefined }
      resolve_city_id_from_address: {
        Args: {
          p_address: string
          p_center_lat?: number
          p_center_lng?: number
        }
        Returns: string
      }
      resolve_event_category: { Args: { category: string }; Returns: string }
      slugify_artist_label: { Args: { value: string }; Returns: string }
      slugify_city_label: { Args: { value: string }; Returns: string }
      take_poster_analysis: {
        Args: {
          guest_total_limit: number
          is_guest: boolean
          per_user_limit: number
          user_id: string
        }
        Returns: string
      }
      to_tag_title_case: { Args: { input_text: string }; Returns: string }
      upsert_city: {
        Args: { p_center_lat?: number; p_center_lng?: number; p_label: string }
        Returns: string
      }
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
  public: {
    Enums: {},
  },
} as const

