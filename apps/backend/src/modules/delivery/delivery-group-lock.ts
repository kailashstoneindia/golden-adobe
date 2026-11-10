import { NotFoundException } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { OrderStatus } from '../orders/models/order.model';

export type LockedGroup = {
  id: string;
  status: string;
  orderId: string;
  orderStatus: OrderStatus;
  customerId: string;
};

// SELECT ... FOR UPDATE on the vendor group row; carries the parent order's
// status and customer so callers can check the lock rule and notify.
export async function lockGroup(
  sequelize: Sequelize,
  groupId: string,
  transaction: Transaction,
): Promise<LockedGroup> {
  const rows = await sequelize.query<{
    id: string;
    status: string;
    order_id: string;
    order_status: OrderStatus;
    customer_id: string;
  }>(
    `SELECT g.id, g.status, g.order_id, o.status AS order_status, o.customer_id
     FROM order_vendor_group g JOIN orders o ON o.id = g.order_id
     WHERE g.id = :groupId
     FOR UPDATE OF g`,
    { replacements: { groupId }, type: QueryTypes.SELECT, transaction },
  );
  if (rows.length === 0) {
    throw new NotFoundException(`Order group ${groupId} not found`);
  }
  return {
    id: rows[0].id,
    status: rows[0].status,
    orderId: rows[0].order_id,
    orderStatus: rows[0].order_status,
    customerId: rows[0].customer_id,
  };
}
