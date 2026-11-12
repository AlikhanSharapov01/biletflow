SET LOCAL lock_timeout = '5s';
CREATE TABLE biletflow.event_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL, file_id uuid NOT NULL,
 sort_order integer NOT NULL DEFAULT 0, alt_text text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT event_media_uq1 UNIQUE(event_id,sort_order) DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT event_media_uq2 UNIQUE(event_id,file_id),
 CONSTRAINT event_media_ck1 CHECK(sort_order >= 0 AND sort_order < 10),
 CONSTRAINT fk_event_media_event FOREIGN KEY(event_id) REFERENCES biletflow.event(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_event_media_file FOREIGN KEY(file_id) REFERENCES biletflow.stored_file(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
