export const ImportOperation = {
  BulkProductImport: 0,
} as const;
export type ImportOperation =
  (typeof ImportOperation)[keyof typeof ImportOperation];

export const Channel = {
  Email: 0,
  Sms: 1,
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

export enum Level {
  Low = "low",
  High = "high",
}

export interface ImportRequest {
  supplierKey?: string | null;
  operation?: ImportOperation;
  channel?: Channel;
  level: Level;
  version: 2;
  enabled: true;
}
