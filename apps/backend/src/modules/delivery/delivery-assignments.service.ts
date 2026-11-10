import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { DELIVERY_ASSIGNMENT_STATUSES } from '@golden-abode/types';
import type { PaginatedResponse, QueueItemDto } from '@golden-abode/types';
import { LOCKED_PARENT_ORDER_STATUSES } from '../orders/refund-status';
import { QueueQueryDto } from './dto/delivery-assignment.dto';

type QueueRow = {
  group_id: string;
  order_id: string;
  shop_name: string;
  vendor_city: string | null;
  drop_city: string | null;
  drop_pincode: string | null;
  item_count: string;
  ready_at: Date;
};

const OPEN_STATUSES = [
  DELIVERY_ASSIGNMENT_STATUSES.ASSIGNED,
  DELIVERY_ASSIGNMENT_STATUSES.PICKED_UP,
];

@Injectable()
export class DeliveryAssignmentsService {
  constructor(private readonly sequelize: Sequelize) {}

  // Groups the vendor has marked ready that nobody has been assigned to yet,
  // oldest first. A group under a refunded or cancelled order never shows.
  // The drop is the address frozen at checkout, falling back to the live row
  // for orders placed before the snapshot existed. updated_at stands in for
  // "ready at": nothing else touches a group between ready and assignment.
  async listQueue(query: QueueQueryDto): Promise<PaginatedResponse<QueueItemDto>> {
    const page = query.page ?? 1;
    const limit = query.pageSize ?? 20;
    const replacements = {
      ready: 'ready_for_pickup',
      locked: [...LOCKED_PARENT_ORDER_STATUSES],
      open: OPEN_STATUSES,
      cityId: query.cityId ?? null,
      limit,
      offset: (page - 1) * limit,
    };
    const from = `
      FROM order_vendor_group g
      JOIN orders o ON o.id = g.order_id
      JOIN vendors v ON v.id = g.vendor_id
      LEFT JOIN city c ON c.id = v.city_id
      LEFT JOIN customer_addresses a ON a.id = o.delivery_address_id
      WHERE g.status = :ready
        AND o.status NOT IN (:locked)
        AND (:cityId::uuid IS NULL OR v.city_id = :cityId::uuid)
        AND NOT EXISTS (
          SELECT 1 FROM delivery_assignments d
          WHERE d.order_vendor_group_id = g.id AND d.status IN (:open)
        )`;

    const rows = await this.sequelize.query<QueueRow>(
      `SELECT g.id AS group_id, g.order_id, v.shop_name, c.name AS vendor_city,
              COALESCE(o.delivery_address_snapshot->>'city', a.city) AS drop_city,
              COALESCE(o.delivery_address_snapshot->>'pincode', a.pincode) AS drop_pincode,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_vendor_group_id = g.id) AS item_count,
              g.updated_at AS ready_at
       ${from}
       ORDER BY g.updated_at ASC, g.id ASC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );
    const [{ total }] = await this.sequelize.query<{ total: string }>(
      `SELECT COUNT(*) AS total ${from}`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      items: rows.map((r) => ({
        groupId: r.group_id,
        orderId: r.order_id,
        vendorName: r.shop_name,
        vendorCity: r.vendor_city,
        dropCity: r.drop_city ?? '',
        dropPincode: r.drop_pincode ?? '',
        itemCount: Number(r.item_count),
        readyAt: new Date(r.ready_at).toISOString(),
      })),
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    };
  }
}
