export type ShopStatus = "open" | "temporarily_closed" | "permanently_closed" | "unknown";
export type CandidateStatus = "pending" | "approved" | "rejected" | "duplicate" | "needs_location";
export type SubmissionStatus = "pending" | "approved" | "rejected" | "duplicate" | "needs_more_info";

export type RamenStyle = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type Shop = {
  id: string;
  name: string;
  slug: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  google_maps_url: string | null;
  status: ShopStatus;
  description: string | null;
  source: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  styles: RamenStyle[];
};

export type CandidateShop = {
  id: string;
  source: string;
  source_id: string | null;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website_url: string | null;
  source_payload: unknown;
  confidence: number;
  status: CandidateStatus;
  duplicate_of: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ShopSubmission = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  suggested_styles: string[] | null;
  submitter_note: string | null;
  submitter_email: string | null;
  status: SubmissionStatus;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminReviewPayload = {
  candidates: CandidateShop[];
  submissions: ShopSubmission[];
  shops: Shop[];
  styles: RamenStyle[];
};
