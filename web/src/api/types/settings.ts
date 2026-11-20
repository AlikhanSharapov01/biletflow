// Mirrors backend/app/settings_api.py (`GET /api/v1/settings/public`): the
// platform values currently in force for new holds, quotes, activations and
// uploads. Platform admins change them; clients must never assume defaults.

export interface PublicSettings {
  hold_minutes: number;
  processing_rate_bps: number;
  activation_fee_minor: number;
  upload_max_bytes: number;
  currency: string;
}
