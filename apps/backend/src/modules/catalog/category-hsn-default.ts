import { QueryTypes, Sequelize } from 'sequelize';

// Decision 0063: a category's effective HSN default is its own, else the
// nearest ancestor's (categories nest by path, e.g. "electrical/wires").
// Shared by add-product and the import so both fill a blank code the same way.
export async function resolveCategoryHsnDefault(
  sequelize: Sequelize,
  categoryId: string,
): Promise<{ code: string; gstRate: number } | null> {
  const rows = await sequelize.query<{ code: string; gst_rate: string }>(
    `SELECT h.code, h.gst_rate
       FROM category leaf
       JOIN category c ON c.path = leaf.path OR leaf.path LIKE c.path || '/%'
       JOIN hsn_code h ON h.code = c.hsn_code_default
      WHERE leaf.id = :categoryId
      ORDER BY c.level DESC
      LIMIT 1`,
    { replacements: { categoryId }, type: QueryTypes.SELECT },
  );
  return rows.length ? { code: rows[0].code, gstRate: Number(rows[0].gst_rate) } : null;
}
