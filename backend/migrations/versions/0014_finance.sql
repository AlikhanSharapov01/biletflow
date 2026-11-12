CREATE TABLE biletflow.demo_payout (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, organization_id uuid NOT NULL,
 payout_profile_id uuid NOT NULL, requested_by_user_id uuid NOT NULL, request_key text NOT NULL,
 amount_minor bigint NOT NULL, currency text NOT NULL DEFAULT 'KZT', environment text NOT NULL DEFAULT 'simulation',
 status text NOT NULL DEFAULT 'pending', sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT demo_payout_scope UNIQUE(id,event_id),
 CONSTRAINT demo_payout_request UNIQUE(requested_by_user_id,request_key),
 CONSTRAINT demo_payout_money CHECK(amount_minor>0 AND currency='KZT' AND environment='simulation'),
 CONSTRAINT demo_payout_state CHECK(status IN ('pending','eligible','sent','failed') AND ((status='sent')=(sent_at IS NOT NULL))),
 FOREIGN KEY(event_id,organization_id) REFERENCES biletflow.event(id,organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY(payout_profile_id,organization_id) REFERENCES biletflow.payout_profile(id,organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY(requested_by_user_id) REFERENCES biletflow.app_user(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_demo_payout_event ON biletflow.demo_payout(event_id,created_at,id);
CREATE TABLE biletflow.finance_entry (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, payout_id uuid NOT NULL,
 refund_id uuid, kind text NOT NULL, amount_minor bigint NOT NULL,
 environment text NOT NULL DEFAULT 'simulation', created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT finance_entry_adjustment UNIQUE(payout_id,kind,refund_id),
 CONSTRAINT finance_entry_money CHECK(environment='simulation' AND (
 (kind='payout' AND amount_minor<0 AND refund_id IS NULL) OR
 (kind='refund' AND amount_minor<0 AND refund_id IS NOT NULL) OR
 (kind='fee_reversal' AND amount_minor>=0 AND refund_id IS NOT NULL) OR (kind='activation_refund' AND amount_minor>0 AND refund_id IS NOT NULL))),
 FOREIGN KEY(payout_id,event_id) REFERENCES biletflow.demo_payout(id,event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY(refund_id,event_id) REFERENCES biletflow.refund(id,event_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX uq_finance_payout_debit ON biletflow.finance_entry(payout_id) WHERE kind='payout';
CREATE UNIQUE INDEX uq_finance_refund_effect ON biletflow.finance_entry(refund_id,kind) WHERE refund_id IS NOT NULL;
CREATE TRIGGER immutable_finance_entry BEFORE UPDATE OR DELETE ON biletflow.finance_entry
 FOR EACH ROW EXECUTE FUNCTION biletflow.reject_auth_history_change();
CREATE FUNCTION biletflow.protect_sent_payout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status='sent' THEN RAISE EXCEPTION 'payout history is immutable' USING ERRCODE='23000'; END IF;
 IF (NEW.id,NEW.event_id,NEW.organization_id,NEW.payout_profile_id,NEW.requested_by_user_id,NEW.request_key,NEW.amount_minor,NEW.currency,NEW.environment,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.event_id,OLD.organization_id,OLD.payout_profile_id,OLD.requested_by_user_id,OLD.request_key,OLD.amount_minor,OLD.currency,OLD.environment,OLD.created_at)
 THEN RAISE EXCEPTION 'payout identity is immutable' USING ERRCODE='23000'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_demo_payout BEFORE UPDATE OR DELETE ON biletflow.demo_payout
 FOR EACH ROW EXECUTE FUNCTION biletflow.protect_sent_payout();
