export const BrandFeedOperationType = {
  BulkMemberEnrollment: 0,
} as const;
export type BrandFeedOperationType =
  (typeof BrandFeedOperationType)[keyof typeof BrandFeedOperationType];

export const Channel = {
  Email: 0,
  Sms: 1,
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

export enum Level {
  Low = "low",
  High = "high",
}

export interface IngestRequest {
  partnerKey?: string | null;
  operation?: BrandFeedOperationType;
  channel?: Channel;
  level: Level;
  version: 2;
  enabled: true;
}
