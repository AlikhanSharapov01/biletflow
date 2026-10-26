-- 0009: protected file storage (stored_file), support attachments, ticket PDF foreign key.
-- This one migration covers the whole attendee/admission increment: every task appends its own
-- section below. Sections must stay independent of each other and end with a newline.

-- BF-16 protected file storage and support attachments.
-- stored_file is the metadata of a private object (bytes live behind app/storage.py, never in
-- the database and never at a public URL). original_filename is the client's display name kept
-- between the upload and the moment the file is linked to a support message.
CREATE TABLE biletflow.stored_file (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	uploaded_by_user_id UUID,
	object_key TEXT NOT NULL,
	purpose TEXT NOT NULL,
	mime_type TEXT NOT NULL,
	size_bytes BIGINT NOT NULL,
	sha256 TEXT NOT NULL,
	original_filename TEXT,
	status TEXT DEFAULT 'pending' NOT NULL,
	scanned_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT stored_file_uq1 UNIQUE (object_key),
	CONSTRAINT stored_file_ck1 CHECK (purpose IN ('event_image','ticket_pdf','support_attachment','offline_package')),
	CONSTRAINT stored_file_ck2 CHECK (status IN ('pending','quarantined','clean','rejected','deleted')),
	CONSTRAINT stored_file_ck3 CHECK (size_bytes >= 0),
	CONSTRAINT fk_stored_file_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_stored_file_uploader ON biletflow.stored_file (uploaded_by_user_id, created_at);

CREATE TABLE biletflow.support_attachment (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	case_id UUID NOT NULL,
	message_id UUID NOT NULL,
	file_id UUID NOT NULL,
	original_filename TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT support_attachment_uq1 UNIQUE (file_id),
	CONSTRAINT support_attachment_ck1 CHECK (length(btrim(original_filename)) > 0),
	CONSTRAINT fk_support_attachment_case FOREIGN KEY (case_id) REFERENCES biletflow.support_case (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_support_attachment_message FOREIGN KEY (message_id, case_id) REFERENCES biletflow.support_message (id, case_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_support_attachment_file FOREIGN KEY (file_id) REFERENCES biletflow.stored_file (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_support_attachment_message ON biletflow.support_attachment (message_id, created_at);

-- BF-10: stored ticket PDFs. ticket.pdf_file_id already exists since 0003 as a plain UUID
-- (the foreign key was deferred until stored_file existed); only the constraint is added here.
ALTER TABLE biletflow.ticket
	ADD CONSTRAINT fk_ticket_pdf_file FOREIGN KEY (pdf_file_id) REFERENCES biletflow.stored_file (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
