import { useState } from 'react';
import type { AdminVendorDto } from '@golden-abode/types';

import { ContactBlock, Row } from '@/components/common/ContactBlock';
import { CopyableId } from '@/components/common/CopyButton';
import { useVendorListingsQuery } from '@/queries/useVendorsQueries';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';

// The parts of the vendor popup that show what the platform knows about a
// vendor (decision 0058 Task 5). Actions (approve, city, categories) stay
// in VendorDetailModal.

export function VendorFacts({ vendor }: { vendor: AdminVendorDto }) {
  const account = vendor.accountDetails;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return (
    <>
      <ContactBlock title="Owner" contact={vendor.owner}>
        <Row label="Vendor id">
          <CopyableId value={vendor.id} label="vendor id" />
        </Row>
      </ContactBlock>

      <Group title="Payout">
        <Row label="Account holder">{account?.accountHolderName ?? '—'}</Row>
        <Row label="Bank">{account ? `${account.bankName}, ${account.branchName}` : '—'}</Row>
        <Row label="IFSC">{account?.ifscCode ?? '—'}</Row>
        {/* Decision 0058 D4: the full number here; lists show the last 4. */}
        <Row label="Account number">
          <CopyableId value={account?.accountNumber ?? null} label="account number" />
        </Row>
        <Row label="UPI">{vendor.upiId ?? '—'}</Row>
        <Row label="Older bank note">{vendor.bankDetails ?? '—'}</Row>
      </Group>

      <Group title="Location">
        <Row label="Address">{vendor.address}</Row>
        <Row label="Coordinates">
          {vendor.latitude}, {vendor.longitude} ·{' '}
          <a
            href={`https://maps.google.com/?q=${vendor.latitude},${vendor.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Maps
          </a>
        </Row>
      </Group>

      <Group title="Business">
        <Row label="GSTIN">{vendor.gstin ?? '—'}</Row>
        <Row label="Minimum order">
          {vendor.minOrderValue != null ? `₹${vendor.minOrderValue}` : 'None'}
        </Row>
        <Row label="Loading team">
          {vendor.hasLoadingUnloadingTeam == null
            ? 'Not stated'
            : vendor.hasLoadingUnloadingTeam
              ? 'Has a loading team'
              : 'No loading team'}
        </Row>
        <Row label="Listings">
          {vendor.listingCounts.active} active · {vendor.listingCounts.paused} paused ·{' '}
          {vendor.listingCounts.outOfStock} out of stock
        </Row>
        <Row label="Flags">{plural(vendor.openFlagCount, 'open flag')}</Row>
        <Row label="Orders">{plural(vendor.orderGroupCount, 'order group')}</Row>
        <Row label="Categories">{plural(vendor.categoryCount, 'category')}</Row>
        <Row label="Joined">{formatDateTime(vendor.createdAt)}</Row>
      </Group>

      <Group title="Warehouses">
        {vendor.warehouses.length === 0 ? (
          <p className={styles.meta}>No warehouses.</p>
        ) : (
          vendor.warehouses.map((warehouse) => (
            <Row key={warehouse.id} label={warehouse.name}>
              {warehouse.address ?? '—'}
              {warehouse.isActive ? '' : ' (inactive)'}
            </Row>
          ))
        )}
      </Group>

      <VendorListings vendorId={vendor.id} />
    </>
  );
}

const PAGE_SIZE = 20;

function VendorListings({ vendorId }: { vendorId: string }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = useVendorListingsQuery(vendorId, {
    status: status || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const data = query.data;

  return (
    <Group title="Listings">
      <label className={styles.meta}>
        Listing status{' '}
        <select
          aria-label="Listing status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
      </label>
      {query.isLoading ? (
        <p className={styles.meta}>Loading…</p>
      ) : query.isError ? (
        <p className={styles.error}>Could not load listings.</p>
      ) : !data || data.items.length === 0 ? (
        <p className={styles.meta}>No listings.</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((listing) => (
                  <tr key={listing.id}>
                    <td>
                      <div>{listing.productName}</div>
                      <div className={styles.meta}>
                        {listing.productCode ?? '—'}
                        {listing.vendorSku ? ` · SKU ${listing.vendorSku}` : ''}
                        {listing.statedGrade ? ` · grade ${listing.statedGrade}` : ''}
                      </div>
                    </td>
                    <td>
                      ₹{listing.price}
                      {listing.mrp != null ? ` (MRP ₹${listing.mrp})` : ''}
                      {listing.minOrderQty != null ? ` · min ${listing.minOrderQty}` : ''}
                    </td>
                    <td>
                      {listing.quantityAvailable ?? '—'}
                      {listing.quantityReserved ? ` (${listing.quantityReserved} held)` : ''}
                    </td>
                    <td>{LISTING_STATUS_TEXT[listing.status] ?? listing.status}</td>
                    <td>{listing.openFlags.length ? listing.openFlags.join('; ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 ? (
            <div className={styles.actions}>
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span className={styles.meta}>
                Page {data.page} of {data.totalPages} ({data.total} listings)
              </span>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </Group>
  );
}

const LISTING_STATUS_TEXT: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  out_of_stock: 'Out of stock',
};

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section role="group" aria-label={title} className={styles.contactBlock}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}
