import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { PresignedPost } from '../catalog/media/object-storage';
import { DeliveryPhotoService } from './delivery-photo.service';

// Decision 0060 rule 9. The vendor tells us the goods went into the driver's
// hands. It is a marker on the open assignment, not a status change: the
// group stays ready_for_pickup until the driver confirms pickup. A group that
// belongs to another vendor is a 404, never a 403, so ids cannot be probed.
@Injectable()
export class VendorHandoverService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly photos: DeliveryPhotoService,
  ) {}

  async createPhotoUrl(
    vendorId: string,
    groupId: string,
    contentType: string,
  ): Promise<PresignedPost> {
    await this.assertOwned(vendorId, groupId);
    return this.photos.createUploadUrl(groupId, 'handover', contentType);
  }

  async markHandedOver(
    vendorId: string,
    groupId: string,
    photoKey?: string,
  ): Promise<{ groupId: string; vendorHandedOverAt: string }> {
    await this.assertOwned(vendorId, groupId);
    if (photoKey) {
      await this.photos.assertUploadedKey(groupId, 'handover', photoKey);
    }

    return this.sequelize.transaction(async (transaction) => {
      const [open] = await this.sequelize.query<{ id: string }>(
        `SELECT id FROM delivery_assignments
         WHERE order_vendor_group_id = :groupId AND status IN ('assigned','picked_up')
         FOR UPDATE`,
        { replacements: { groupId }, type: QueryTypes.SELECT, transaction },
      );
      if (!open) {
        throw new BadRequestException('no driver assigned yet');
      }
      // COALESCE: a repeat call keeps the first timestamp (and the first photo
      // unless a new one is sent).
      const [stamped] = await this.sequelize.query<{ vendor_handed_over_at: Date }>(
        `UPDATE delivery_assignments
         SET vendor_handed_over_at = COALESCE(vendor_handed_over_at, NOW()),
             vendor_handover_photo_key = COALESCE(:photoKey::text, vendor_handover_photo_key),
             updated_at = NOW()
         WHERE id = :id
         RETURNING vendor_handed_over_at`,
        {
          replacements: { id: open.id, photoKey: photoKey ?? null },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      return {
        groupId,
        vendorHandedOverAt: new Date(stamped.vendor_handed_over_at).toISOString(),
      };
    });
  }

  private async assertOwned(vendorId: string, groupId: string): Promise<void> {
    const rows = await this.sequelize.query<{ id: string }>(
      `SELECT id FROM order_vendor_group WHERE id = :groupId AND vendor_id = :vendorId`,
      { replacements: { groupId, vendorId }, type: QueryTypes.SELECT },
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Order group ${groupId} not found`);
    }
  }
}
