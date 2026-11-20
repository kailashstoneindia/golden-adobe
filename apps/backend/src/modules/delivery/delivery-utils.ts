import { Logger } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

// Helpers the delivery services share, so a change (a new logging rule, what
// "the group moved" means for the queue's updated_at) is made once.

export const PHOTO_PRESIGN_TTL_SECONDS = 300;

export const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);

// After commit and best effort: a failed notification must never undo the work.
export async function notifyQuietly(logger: Logger, send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (error) {
    logger.warn(`notification failed: ${error instanceof Error ? error.message : error}`);
  }
}

// Moves a vendor group. updated_at is bumped on purpose: the ops queue orders by it.
export async function setGroupStatus(
  sequelize: Sequelize,
  groupId: string,
  status: string,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(
    'UPDATE order_vendor_group SET status = :status, updated_at = NOW() WHERE id = :id',
    { replacements: { status, id: groupId }, type: QueryTypes.UPDATE, transaction },
  );
}
