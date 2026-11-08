// Shapes shared across domains. Dates are ISO-8601 strings; ids are UUIDs;
// money is KZT minor units (tiyn).

export type Locale = "kk" | "ru" | "en";

export interface Message {
  code: string;
}
