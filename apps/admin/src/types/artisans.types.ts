export type RejectArtisanVerificationRequest = {
  reason?: string;
};

export type ReviewArtisanHireRequestRequest = {
  approve: boolean;
  rejectReason?: string;
};
