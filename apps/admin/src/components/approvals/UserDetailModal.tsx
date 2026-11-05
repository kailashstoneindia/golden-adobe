import { useState, type ReactNode } from 'react';
import type {
  AdminCustomerProfileDto,
  AdminUserDetailDto,
  AdminUserDto,
  CustomerAddressDto,
  UpdateAdminUserRequest,
  VendorAccountDetailsDto,
  VendorProfileDto,
} from '@golden-abode/types';
import { Role } from '@golden-abode/types';

import { Link } from 'react-router-dom';

import styles from '@/styles/shared.module.css';
import { CopyableId } from '@/components/common/CopyButton';
import { ROUTES } from '@/constants/routes';
import { formatPaise } from '@/utils/money';
import { formatOnboardingStage } from '@/utils/onboarding';
import { formatRoleLabel } from '@/utils/role';
import { formatPhoneDisplay } from '@/utils/phone';
import { formatDateTime } from '@/utils/date';
import { UserAccountActions } from '@/components/approvals/UserAccountActions';

type UserDetailModalProps = {
  // The list row, or the full detail once it has loaded (decision 0058 Task 7).
  user: AdminUserDto | AdminUserDetailDto;
  isSubmitting: boolean;
  showApprovalActions?: boolean;
  // Vendor rejections require a persisted reason (decision 0048) — when
  // true, Reject opens a reason prompt instead of firing immediately.
  // Ustaad rejections stay one-click; the server runs Reject verification
  // for them (decision 0058 §3b).
  requireRejectReason?: boolean;
  // Shown above the actions when Approve/Reject was refused by the server.
  actionError?: string | null;
  // Why the sessions and customer sections are missing, while the detail
  // is loading or after it failed (Task 7 review).
  detailNotice?: string | null;
  onClose: () => void;
  onApprove?: (userId: string) => void;
  onReject?: (userId: string, reason?: string) => void;
  // Decision 0058 Task 9: given only by the Users page. Each rejects with the
  // server's reason, which the popup shows.
  onSaveDetails?: (userId: string, body: UpdateAdminUserRequest) => Promise<void>;
  onSetActive?: (userId: string, isActive: boolean) => Promise<void>;
  onRevokeSessions?: (userId: string) => Promise<void>;
  // The signed-in admin: their own row never offers Deactivate.
  currentAdminId?: string;
};

export function UserDetailModal({
  user,
  isSubmitting,
  showApprovalActions = true,
  requireRejectReason = false,
  actionError = null,
  detailNotice = null,
  onClose,
  onApprove,
  onReject,
  onSaveDetails,
  onSetActive,
  onRevokeSessions,
  currentAdminId,
}: UserDetailModalProps) {
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const handleApprove = () => onApprove?.(user.id);
  const handleRejectClick = () => {
    if (requireRejectReason) {
      setIsRejecting(true);
      return;
    }
    onReject?.(user.id);
  };
  const handleConfirmReject = () => {
    if (!rejectReason.trim()) {
      return;
    }
    onReject?.(user.id, rejectReason.trim());
  };
  const vendorProfile = user.role === Role.VENDOR ? user.vendorProfile : undefined;

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
        <h2 className={styles.modalTitle}>Review request</h2>
        <p className={styles.pageSubtitle}>{user.name}</p>

        {detailNotice ? <p className={styles.pageSubtitle}>{detailNotice}</p> : null}

        <div className={styles.modalBody}>
          <DetailRow label="Role" value={formatRoleLabel(user.role)} />
          <DetailRow label="Phone" value={formatPhoneDisplay(user.phone)} />
          <DetailRow label="Email" value={user.email ?? '-'} />
          <DetailRow label="Status" value={user.isApproved ? 'Approved' : 'Pending approval'} />
          <DetailRow label="Active" value={user.isActive ? 'Yes' : 'No'} />
          <DetailRow label="Onboarding completed" value={user.onboardingCompleted ? 'Yes' : 'No'} />
          <DetailRow label="Onboarding stage" value={formatOnboardingStage(user)} />
          <DetailRow
            label="Onboarding completed at"
            value={user.onboardingCompletedAt ? formatDateTime(user.onboardingCompletedAt) : '-'}
          />
          <DetailRow label="Joined" value={formatDateTime(user.createdAt)} />
          <DetailRow
            label="Last login"
            value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
          />
          <DetailRow label="Push notifications" value={user.pushEnabled ? 'On' : 'Off'} />
          {'activeSessionCount' in user ? (
            <DetailRow label="Signed-in devices" value={String(user.activeSessionCount)} />
          ) : null}
          <DetailRow label="User id" value={<CopyableId value={user.id} label="user id" />} />
          {user.role === Role.VENDOR && user.vendorProfile ? (
            <p>
              <Link to={`${ROUTES.vendors}?vendorId=${user.vendorProfile.id}`}>
                Open in Vendors
              </Link>
            </p>
          ) : null}
          {user.role === Role.ARTISAN && user.artisan ? (
            <p>
              <Link to={`${ROUTES.artisans}?artisanId=${user.artisan.id}`}>Open in Ustaads</Link>
            </p>
          ) : null}

          {'customerProfile' in user && user.customerProfile ? (
            <CustomerSection profile={user.customerProfile} />
          ) : null}

          {vendorProfile ? <VendorProfileSections profile={vendorProfile} /> : null}

          <UserAccountActions
            user={user}
            onSaveDetails={onSaveDetails}
            onSetActive={onSetActive}
            onRevokeSessions={onRevokeSessions}
            currentAdminId={currentAdminId}
          />

          {isRejecting ? (
            <div className={styles.detailSections}>
              <label className={styles.detailLabel} htmlFor="reject-reason">
                Reason for rejection
              </label>
              <textarea
                id="reject-reason"
                className={styles.input}
                value={rejectReason}
                disabled={isSubmitting}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Why is this vendor being rejected? Shown back on their record."
              />
            </div>
          ) : null}
        </div>

        {actionError ? <p className={styles.error}>{actionError}</p> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            onClick={onClose}
          >
            Close
          </button>
          {showApprovalActions ? (
            isRejecting ? (
              <>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonGhost}`}
                  disabled={isSubmitting}
                  onClick={() => setIsRejecting(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonDanger}`}
                  disabled={isSubmitting || !rejectReason.trim()}
                  onClick={handleConfirmReject}
                >
                  Confirm reject
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonDanger}`}
                  disabled={isSubmitting}
                  onClick={handleRejectClick}
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
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CustomerSection({ profile }: { profile: AdminCustomerProfileDto }) {
  return (
    <section role="group" aria-label="Customer" className={styles.detailSections}>
      <h3 className={styles.sectionTitle}>Customer</h3>
      <DetailRow label="Full name" value={profile.fullName} />
      <DetailRow
        label="Orders"
        value={
          <Link to={`${ROUTES.orders}?customerId=${profile.customerId}`}>
            {profile.orderCount} {profile.orderCount === 1 ? 'order' : 'orders'}
          </Link>
        }
      />
      <DetailRow
        label="Paid in total (before refunds)"
        value={formatPaise(profile.paidTotalPaise)}
      />
      <DetailRow label="Hire requests" value={String(profile.hireRequestCount)} />
      {profile.addresses.length === 0 ? (
        <p className={styles.sectionEmpty}>No saved addresses.</p>
      ) : (
        profile.addresses.map((address) => (
          <DetailRow
            key={address.id}
            label={`${address.label}${address.isDefault ? ' (default)' : ''}`}
            value={formatAddress(address)}
          />
        ))
      )}
    </section>
  );
}

function formatAddress(address: CustomerAddressDto): string {
  const lines = [address.addressLine1, address.addressLine2].filter(Boolean).join(', ');
  return `${lines}, ${address.city} ${address.pincode}`;
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
        <DetailRow label="Location" value={formatLocation(profile.latitude, profile.longitude)} />
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
  value: ReactNode;
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
