export type ApprovalCategory = 'vendors' | 'artisans';

// Two separate review surfaces (docs/artisan-module.md §8.6): verifying an
// artisan's KYC document once, vs. reviewing each hire request they get
// afterward. Both are distinct from the generic 'artisans' approvals
// category above, which still only gates users.is_approved.
export type ArtisanReviewCategory = 'verification' | 'hire-requests';
