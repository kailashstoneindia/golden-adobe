import type {
  ArtisanAccountDetailsInputDto,
  ArtisanHireRequestDto,
  ArtisanProfileDto,
  TradeType,
} from '@golden-abode/types';

/** Presigned S3 POST returned by `POST /artisans/me/documents/upload-url`. */
export type ArtisanDocumentUploadUrl = {
  url: string;
  // Includes `key`, the object key later sent to the confirm endpoint.
  fields: Record<string, string>;
};

export type ArtisanDocumentFile = {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
};

export type ArtisanProfileFormValues = {
  tradeType: TradeType | null;
  servicePincode: string;
  experienceYears: string;
  bio: string;
};

export type ArtisanProfileFieldsProps = {
  values: ArtisanProfileFormValues;
  onChange: <K extends keyof ArtisanProfileFormValues>(
    field: K,
    value: ArtisanProfileFormValues[K],
  ) => void;
};

export type ArtisanBankFieldsProps = {
  values: ArtisanAccountDetailsInputDto;
  onChange: (field: keyof ArtisanAccountDetailsInputDto, value: string) => void;
};

export type ArtisanDocumentCardProps = {
  profile: ArtisanProfileDto;
};

export type TradeTypeChipsProps = {
  selected: TradeType | null;
  onSelect: (tradeType: TradeType) => void;
};

export type HireRequestListRowProps = {
  request: ArtisanHireRequestDto;
  onPress: (requestId: string) => void;
};
