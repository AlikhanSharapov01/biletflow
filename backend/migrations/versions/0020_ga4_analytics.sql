SET LOCAL lock_timeout = '5s';
CREATE TABLE biletflow.ga4_connection (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 property_id text NOT NULL, secret_reference text NOT NULL DEFAULT 'environment',
 is_enabled boolean NOT NULL DEFAULT false, enabled_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT ga4_connection_uq1 UNIQUE(organization_id),
 CONSTRAINT ga4_connection_uq2 UNIQUE(id,organization_id),
 CONSTRAINT ga4_connection_ck1 CHECK(property_id ~ '^[0-9]+$'),
 CONSTRAINT ga4_connection_ck2 CHECK(secret_reference = 'environment'),
 CONSTRAINT ga4_connection_ck3 CHECK(NOT is_enabled OR enabled_at IS NOT NULL),
 CONSTRAINT fk_ga4_connection_org FOREIGN KEY(organization_id) REFERENCES biletflow.organization(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE biletflow.analytics_export (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL,
 organization_id uuid NOT NULL, event_id uuid NOT NULL, order_id uuid, refund_id uuid,
 measurement_kind text NOT NULL, analytics_event_id uuid NOT NULL, safe_payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending', attempt_count integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT analytics_export_uq1 UNIQUE(analytics_event_id),
 CONSTRAINT analytics_export_uq2 UNIQUE(connection_id,order_id,measurement_kind),
 CONSTRAINT analytics_export_uq3 UNIQUE(connection_id,refund_id,measurement_kind),
 CONSTRAINT analytics_export_ck1 CHECK(status IN ('pending','sent','skipped','failed')),
 CONSTRAINT analytics_export_ck2 CHECK(jsonb_typeof(safe_payload) = 'object'),
 CONSTRAINT analytics_export_ck3 CHECK(measurement_kind IN ('campaign_landing','event_view','checkout_start','purchase','refund')),
 CONSTRAINT analytics_export_ck4 CHECK((order_id IS NOT NULL) = (measurement_kind IN ('purchase','refund')) AND (refund_id IS NOT NULL) = (measurement_kind = 'refund')),
 CONSTRAINT analytics_export_ck5 CHECK((status = 'sent') = (sent_at IS NOT NULL)),
 CONSTRAINT analytics_export_ck6 CHECK(attempt_count >= 0),
 CONSTRAINT fk_analytics_export_connection FOREIGN KEY(connection_id,organization_id) REFERENCES biletflow.ga4_connection(id,organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_analytics_export_event FOREIGN KEY(event_id,organization_id) REFERENCES biletflow.event(id,organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_analytics_export_order FOREIGN KEY(order_id,event_id) REFERENCES biletflow.ticket_order(id,event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_analytics_export_refund FOREIGN KEY(refund_id,event_id) REFERENCES biletflow.refund(id,event_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_analytics_export_pending ON biletflow.analytics_export(available_at,id) WHERE status = 'pending';
CREATE TABLE biletflow.ga4_cache (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL,
 organization_id uuid NOT NULL, event_id uuid NOT NULL, query_hash text NOT NULL,
 range_start date NOT NULL, range_end date NOT NULL, metrics jsonb NOT NULL,
 fetched_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT ga4_cache_uq1 UNIQUE(connection_id,event_id,query_hash),
 CONSTRAINT ga4_cache_ck1 CHECK(range_end > range_start),
 CONSTRAINT ga4_cache_ck2 CHECK(expires_at > fetched_at),
 CONSTRAINT ga4_cache_ck3 CHECK(jsonb_typeof(metrics) = 'object'),
 CONSTRAINT fk_ga4_cache_connection FOREIGN KEY(connection_id,organization_id) REFERENCES biletflow.ga4_connection(id,organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_ga4_cache_event FOREIGN KEY(event_id,organization_id) REFERENCES biletflow.event(id,organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
