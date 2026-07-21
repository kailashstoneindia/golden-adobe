import { useState, type ReactNode } from 'react';
import type { UserDto, VendorAccountDetailsDto, VendorProfileDto } from '@golden-abode/types';
import { Role } from '@golden-abode/types';

import styles from '@/styles/shared.module.css';
import { formatRoleLabel } from '@/utils/role';
import { formatPhoneDisplay } from '@/utils/phone';
import { formatDateTime } from '@/utils/date';

type UserDetailModalProps = {
  user: UserDto;
  isSubmitting: boolean;
  showApprovalActions?: boolean;
  onClose: () => void;
  onApprove?: (userId: string) => void;
  onReject?: (userId: string) => void;
};

export function UserDetailModal({
  user,
  isSubmitting,
  showApprovalActions = true,
  onClose,
  onApprove,
  onReject,
}: UserDetailModalProps) {
  const handleApprove = () => onApprove?.(user.id);
  const handleReject = () => onReject?.(user.id);
  const vendorProfile = user.role === Role.VENDOR ? user.vendorProfile : undefined;

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
        <h2 className={styles.modalTitle}>Review request</h2>
        <p className={styles.pageSubtitle}>{user.name}</p>

        <div className={styles.modalBody}>
          <DetailRow label="Role" value={formatRoleLabel(user.role)} />
          <DetailRow label="Phone" value={formatPhoneDisplay(user.phone)} />
          <DetailRow label="Status" value={user.isApproved ? 'Approved' : 'Pending approval'} />
          <DetailRow label="Active" value={user.isActive ? 'Yes' : 'No'} />
          <DetailRow label="Onboarding completed" value={user.onboardingCompleted ? 'Yes' : 'No'} />
          <DetailRow label="Onboarding stage" value={formatOnboardingStage(user)} />
          <DetailRow
            label="Onboarding completed at"
            value={user.onboardingCompletedAt ? formatDateTime(user.onboardingCompletedAt) : '-'}
          />
          <DetailRow label="Joined" value={formatDateTime(user.createdAt)} />

          {vendorProfile ? <VendorProfileSections profile={vendorProfile} /> : null}
        </div>

        <div className={styles.actions}>
          <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={onClose}>
            Close
          </button>
          {showApprovalActions ? (
            <>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonDanger}`}
                disabled={isSubmitting}
                onClick={handleReject}
              >
                Reject
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={isSubmitting}
                onClick={handleApprove}
              >
                Approve
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type VendorProfileSectionsProps = {
  profile: VendorProfileDto;
};

function VendorProfileSections({ profile }: VendorProfileSectionsProps) {
  return (
    <div className={styles.detailSections}>
      <CollapsibleSection title="Business details" defaultOpen>
        <DetailRow label="Shop name" value={profile.shopName} />
        <DetailRow label="Shop address" value={profile.address} />
        <DetailRow
          label="Location"
          value={formatLocation(profile.latitude, profile.longitude)}
        />
        <DetailRow label="GSTIN" value={profile.gstin || '-'} />
      </CollapsibleSection>

      <CollapsibleSection title="Payout & bank details">
        <BankDetailsRows accountDetails={profile.accountDetails} upiId={profile.upiId} />
      </CollapsibleSection>
    </div>
  );
}

type BankDetailsRowsProps = {
  accountDetails: VendorAccountDetailsDto | null;
  upiId: string | null;
};

function BankDetailsRows({ accountDetails, upiId }: BankDetailsRowsProps) {
  if (!accountDetails) {
    return (
      <>
        <DetailRow label="UPI ID" value={upiId || '-'} />
        <p className={styles.sectionEmpty}>No bank account details submitted.</p>
      </>
    );
  }

  return (
    <>
      <DetailRow label="Account holder name" value={accountDetails.accountHolderName} />
      <DetailRow label="Bank name" value={accountDetails.bankName} />
      <DetailRow label="IFSC code" value={accountDetails.ifscCode} />
      <DetailRow label="Branch name" value={accountDetails.branchName} />
      <DetailRow label="Account number" value={accountDetails.accountNumber} />
      <DetailRow label="UPI ID" value={upiId || '-'} />
    </>
  );
}

type CollapsibleSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

function CollapsibleSection({ title, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={styles.collapsibleSection}>
      <button
        type="button"
        className={styles.collapsibleTrigger}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{title}</span>
        <span className={styles.collapsibleChevron} aria-hidden>
          {isOpen ? '▾' : '▸'}
        </span>
      </button>
      {isOpen ? <div className={styles.collapsibleBody}>{children}</div> : null}
    </div>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}

function formatLocation(latitude: number, longitude: number): string {
  return `${latitude}, ${longitude}`;
}

function formatOnboardingStage(user: UserDto): string {
  if (user.role !== Role.VENDOR) {
    return '-';
  }

  if (!user.onboardingStage) {
    return '-';
  }

  if (user.onboardingStage === 'BASIC_DETAILS') {
    return 'Basic details';
  }
  if (user.onboardingStage === 'SHOP_DETAILS') {
    return 'Shop details';
  }
  if (user.onboardingStage === 'BANK_DETAILS') {
    return 'Bank details';
  }
  if (user.onboardingStage === 'COMPLETED') {
    return 'Completed';
  }

  return user.onboardingStage;
}
