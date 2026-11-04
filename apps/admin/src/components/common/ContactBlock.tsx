import type { ReactNode } from 'react';
import type { AdminContactDto, AdminContactWithoutEmailDto } from '@golden-abode/types';

import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';
import { formatPhoneDisplay } from '@/utils/phone';
import { formatRoleLabel } from '@/utils/role';

type ContactBlockProps = {
  title: string;
  contact: AdminContactDto | AdminContactWithoutEmailDto | null;
  // Extra rows under the contact, e.g. the ustaad's trade.
  children?: ReactNode;
};

// "Who is this and how do I reach them" in an admin popup (decision 0058).
// The email row appears only when the contact carries one: hire requests
// send the ustaad without an email on purpose.
export function ContactBlock({ title, contact, children }: ContactBlockProps) {
  return (
    <section role="group" aria-label={title} className={styles.contactBlock}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {contact ? (
        <>
          <Row label="Name">
            {contact.name}
            {contact.isActive ? null : <span className={styles.badge}> Deactivated</span>}
          </Row>
          <Row label="Phone">
            {contact.phone ? (
              <a href={`tel:${contact.phone}`}>{formatPhoneDisplay(contact.phone)}</a>
            ) : (
              '—'
            )}
          </Row>
          {'email' in contact ? (
            <Row label="Email">
              {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : '—'}
            </Row>
          ) : null}
          {children}
          <Row label="Account">
            {contact.role ? formatRoleLabel(contact.role) : 'No role yet'} ·{' '}
            {contact.isApproved ? 'approved' : 'not approved'}
          </Row>
          <Row label="Last login">
            {contact.lastLoginAt ? formatDateTime(contact.lastLoginAt) : 'Never'}
          </Row>
        </>
      ) : (
        <p className={styles.pageSubtitle}>Account not found.</p>
      )}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{children}</span>
    </div>
  );
}

// Name and phone in a table cell, for list rows.
export function ContactCell({
  contact,
}: {
  contact: AdminContactDto | AdminContactWithoutEmailDto | null;
}) {
  if (!contact) return <td>—</td>;
  return (
    <td>
      <div>{contact.name}</div>
      <div className={styles.meta}>{formatPhoneDisplay(contact.phone)}</div>
    </td>
  );
}
