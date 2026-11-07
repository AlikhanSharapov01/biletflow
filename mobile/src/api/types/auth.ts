// Auth wire types — field names are exactly what the API sends/expects
// (backend/app/schemas.py).

export type TokenPair = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  refresh_token: string;
};

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  locale: string;
  email_verified_at: string | null;
  analytics_consent: boolean;
};
