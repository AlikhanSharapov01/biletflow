// backend/app/settings_api.py: the platform settings that are in force right
// now for new holds, quotes, activations and uploads. Admins can change them.

export interface PublicSettings {
  // How long a hold keeps tickets or seats while the buyer names recipients.
  hold_minutes: number;
  // Processing fee in basis points of what is collected.
  processing_rate_bps: number;
  activation_fee_minor: number;
  upload_max_bytes: number;
  currency: string;
}
