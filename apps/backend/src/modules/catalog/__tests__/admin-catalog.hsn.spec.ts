import { BadRequestException, ConflictException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import { Op } from 'sequelize';

import { catalogFixtures } from './catalog-fixtures';
import { CATALOG_TEST_MODELS } from './test-db';
import { AdminCatalogService } from '../admin-catalog.service';
import { BrandResolverService } from '../brand-resolver.service';
import { CatalogAttributeResolverService } from '../catalog-attribute-resolver.service';
import { CatalogImportUploadService } from '../catalog-import-upload.service';
import { MediaService } from '../media/media.service';
import { Category } from '../models/category.model';
import { HsnCode } from '../models/hsn-code.model';
import { MasterProduct } from '../models/master-product.model';
import { ProductReadinessService } from '../product-readiness.service';

// Decision 0063 / S4 Task 6: HSN codes are maintained from the admin panel,
// and a category's default fills in the HSN code of products created in it.
describe('HSN codes and category defaults (integration)', () => {
  let moduleRef: TestingModule;
  let service: AdminCatalogService;
  let importer: CatalogImportUploadService;
  const stamp = String(Date.now());
  const fx = catalogFixtures(`hs${stamp}`);
  const word = `Quorvex${Math.random()
    .toString(36)
    .replace(/[^a-z]/g, '')
    .slice(0, 5)}`;
  // Unique 8-digit codes for this run: 69 + six digits, and 39 + six digits.
  const code69 = `69${stamp.slice(-6)}`;
  const code39 = `39${stamp.slice(-6)}`;
  const createdCodes: string[] = [];
  const categoryIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        SequelizeModule.forRoot({
          dialect: 'postgres',
          host: process.env.TEST_DB_HOST ?? '127.0.0.1',
          port: Number(process.env.TEST_DB_PORT ?? 5432),
          username: process.env.TEST_DB_USER ?? 'postgres',
          password: process.env.TEST_DB_PASS ?? 'postgres',
          database: process.env.TEST_DB_NAME ?? 'golden_abode_test',
          logging: false,
          models: CATALOG_TEST_MODELS,
        }),
        SequelizeModule.forFeature(CATALOG_TEST_MODELS),
      ],
      providers: [
        AdminCatalogService,
        CatalogImportUploadService,
        ProductReadinessService,
        BrandResolverService,
        {
          provide: CatalogAttributeResolverService,
          useValue: { resolveEffectiveAttributes: async () => [] },
        },
        { provide: MediaService, useValue: { listForProduct: async () => [] } },
      ],
    }).compile();
    service = moduleRef.get(AdminCatalogService);
    importer = moduleRef.get(CatalogImportUploadService);

    for (const [code, description, gstRate] of [
      [code69, `Ceramic tiles ${word}`, 18],
      [code39, `Plastic pipes`, 12],
    ] as const) {
      await service.createHsnCode({ code, description, gstRate });
      createdCodes.push(code);
    }
  });

  afterAll(async () => {
    await MasterProduct.destroy({ where: { categoryId: categoryIds } });
    await Category.destroy({ where: { id: [...categoryIds].reverse() } });
    await fx.cleanup();
    await HsnCode.destroy({ where: { code: createdCodes } });
    await moduleRef.close();
  });

  // parent (group) > leaf; defaults set per test.
  async function tree() {
    const n = categoryIds.length;
    const parent = await Category.create({
      name: `HS Parent ${n} ${stamp}`,
      slug: `hs-parent-${n}-${stamp}`,
      level: 1,
      path: `hs-parent-${n}-${stamp}`,
      isLeaf: false,
    } as never);
    const leaf = await Category.create({
      name: `HS Leaf ${n} ${stamp}`,
      slug: `hs-leaf-${n}-${stamp}`,
      level: 2,
      parentId: parent.id,
      path: `hs-parent-${n}-${stamp}/hs-leaf-${n}-${stamp}`,
      isLeaf: true,
    } as never);
    categoryIds.push(parent.id, leaf.id);
    return { parent, leaf };
  }

  describe('HSN code list', () => {
    it('finds codes by prefix and by description, case-insensitive, at most 50', async () => {
      const byPrefix = await service.listHsnCodes('69');
      expect(byPrefix.length).toBeLessThanOrEqual(50);
      expect(byPrefix.every((h) => h.code.startsWith('69'))).toBe(true);
      expect(byPrefix).toContainEqual({
        code: code69,
        description: `Ceramic tiles ${word}`,
        gstRate: 18,
      });

      expect((await service.listHsnCodes(word.toUpperCase())).map((h) => h.code)).toEqual([code69]);
    });

    it('refuses (409) a code that already exists', async () => {
      await expect(
        service.createHsnCode({ code: code69, description: 'Again', gstRate: 5 }),
      ).rejects.toThrow(new ConflictException(`HSN code ${code69} already exists`));
    });
  });

  describe('category default', () => {
    it('sets, then clears, a category default', async () => {
      const { leaf } = await tree();

      await service.setCategoryHsnDefault(leaf.id, code39);
      expect((await Category.findByPk(leaf.id))?.hsnCodeDefault).toBe(code39);

      await service.setCategoryHsnDefault(leaf.id, null);
      expect((await Category.findByPk(leaf.id))?.hsnCodeDefault).toBeNull();
    });

    it('the category tree carries hsnCodeDefault on each node', async () => {
      const { parent, leaf } = await tree();
      await service.setCategoryHsnDefault(parent.id, code69);

      const find = (nodes: { id: string; children: unknown[] }[]): unknown =>
        nodes.reduce<unknown>(
          (hit, n) => hit ?? (n.id === parent.id ? n : find(n.children as never)),
          undefined,
        );
      const node = find(await service.listCategoryTree()) as {
        hsnCodeDefault: string | null;
        children: { id: string; hsnCodeDefault: string | null }[];
      };
      expect(node.hsnCodeDefault).toBe(code69);
      expect(node.children.find((c) => c.id === leaf.id)?.hsnCodeDefault).toBeNull();
    });

    it('refuses (400) an HSN code that is not in the list', async () => {
      const { leaf } = await tree();

      await expect(service.setCategoryHsnDefault(leaf.id, '00000000')).rejects.toThrow(
        new BadRequestException('HSN code "00000000" is not in the list. Add it first'),
      );
    });

    it('resolves the leaf default, else the nearest ancestor’s, else null', async () => {
      const { parent, leaf } = await tree();
      expect(await service.resolveCategoryHsnDefault(leaf.id)).toBeNull();

      await service.setCategoryHsnDefault(parent.id, code69);
      expect(await service.resolveCategoryHsnDefault(leaf.id)).toBe(code69);

      await service.setCategoryHsnDefault(leaf.id, code39);
      expect(await service.resolveCategoryHsnDefault(leaf.id)).toBe(code39);
    });
  });

  describe('new products', () => {
    it('add-product with no HSN code takes the category default and its GST rate', async () => {
      const { parent, leaf } = await tree();
      await service.setCategoryHsnDefault(parent.id, code39);

      const created = await service.createProduct({
        categoryId: leaf.id,
        name: `HS Form ${stamp}`,
      });

      expect(await MasterProduct.findByPk(created.id)).toMatchObject({
        hsnCode: code39,
        gstRate: '12.00',
      });
    });

    it('an explicit HSN code wins over the default', async () => {
      const { leaf } = await tree();
      await service.setCategoryHsnDefault(leaf.id, code39);

      const created = await service.createProduct({
        categoryId: leaf.id,
        name: `HS Explicit ${stamp}`,
        hsnCode: code69,
        gstRate: 18,
      });

      expect((await MasterProduct.findByPk(created.id))?.hsnCode).toBe(code69);
    });

    it('with no default and no code, the product has no HSN code', async () => {
      const { leaf } = await tree();

      const created = await service.createProduct({
        categoryId: leaf.id,
        name: `HS None ${stamp}`,
      });

      expect((await MasterProduct.findByPk(created.id))?.hsnCode).toBeNull();
    });

    it('an imported row with a blank HSN code takes the default too', async () => {
      const { leaf } = await tree();
      await service.setCategoryHsnDefault(leaf.id, code39);
      const brand = await fx.brand();
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Products');
      sheet.addRow(['name*', 'brand*', 'hsn_code', 'gst_rate*', 'country_of_origin*']);
      sheet.addRow([`HS Import ${stamp}`, brand.name, null, 12, 'India']);

      const result = await importer.importFile(
        leaf.id,
        Buffer.from(await workbook.xlsx.writeBuffer()),
      );

      expect(result.errors).toEqual([]);
      expect((await MasterProduct.findByPk(result.createdProductIds[0]))?.hsnCode).toBe(code39);
    });

    it('an edit never replaces an existing HSN code with the default', async () => {
      const { leaf } = await tree();
      const product = await MasterProduct.create({
        categoryId: leaf.id,
        name: `HS Edit ${stamp}`,
        slug: `hs-edit-${stamp}`,
        isGeneric: true,
        hsnCode: code69,
      } as never);
      await service.setCategoryHsnDefault(leaf.id, code39);

      await service.updateProduct(product.id, 'admin-1', { name: `HS Edited ${stamp}` });

      expect((await MasterProduct.findByPk(product.id))?.hsnCode).toBe(code69);
    });
  });

  it('cleans up only its own codes', async () => {
    expect(await HsnCode.count({ where: { code: { [Op.in]: createdCodes } } })).toBe(2);
  });
});
