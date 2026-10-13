import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessScopeService, AccessSubject, PRODUCT_RESOURCE } from './access-scope.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

const PRODUCT_FIELDS = new Set<string>(Object.values(Prisma.ProductScalarFieldEnum));

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessScopeService,
  ) {}

  async list(userId: number, query: ListProductsQueryDto) {
    const subject = await this.access.loadSubject(userId);
    const [ids, select] = await Promise.all([
      this.access.visibleProductIds(subject),
      this.productSelect(subject),
    ]);
    const items = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select,
      orderBy: { id: 'asc' },
      skip: query.skip,
      take: query.take,
    });
    return { total: ids.length, fields: Object.keys(select), items };
  }

  // Hidden and missing products both return 404 so clients can't probe which ids exist.
  async get(userId: number, productId: number) {
    const subject = await this.access.loadSubject(userId);
    const [ids, select] = await Promise.all([
      this.access.visibleProductIds(subject, productId),
      this.productSelect(subject),
    ]);
    if (ids.length === 0) throw new NotFoundException();
    return this.prisma.product.findUniqueOrThrow({ where: { id: productId }, select });
  }

  async getBySku(userId: number, sku: string) {
    const subject = await this.access.loadSubject(userId);
    const [id, select] = await Promise.all([
      this.visibleIdBySku(subject, sku),
      this.productSelect(subject),
    ]);
    return this.prisma.product.findUniqueOrThrow({ where: { id }, select });
  }

  // Succeeds only if at least `qty` is in stock.
  async checkAvailability(userId: number, sku: string, qty: number) {
    if (qty < 1) throw new BadRequestException('qty must be at least 1');
    const subject = await this.access.loadSubject(userId);
    const [id, select] = await Promise.all([
      this.visibleIdBySku(subject, sku),
      this.stockSelect(subject),
    ]);
    const product = await this.prisma.product.findUniqueOrThrow({ where: { id }, select });
    if ((product.stockQty ?? 0) < qty) {
      throw new ConflictException(`Requested quantity ${qty} is not available for SKU '${sku}'`);
    }
    return product;
  }

  async getBatch(userId: number, skus: string[]) {
    const normalized = [...new Set(skus.map(normalizeSku).filter(Boolean))];
    if (normalized.length === 0) return { products: [] };
    const subject = await this.access.loadSubject(userId);
    const [ids, select] = await Promise.all([
      this.access.visibleProductIds(subject),
      this.productSelect(subject),
    ]);
    const products = await this.prisma.product.findMany({
      where: { sku: { in: normalized }, id: { in: ids } },
      select,
      orderBy: { id: 'asc' },
    });
    return { products };
  }

  // A single conditional UPDATE, so two concurrent deductions can't oversell. availability is
  // recomputed in the same statement (SET expressions see the pre-update stockQty).
  async deductStock(userId: number, sku: string, quantity: number) {
    const subject = await this.access.loadSubject(userId);
    const [id, select] = await Promise.all([
      this.visibleIdBySku(subject, sku),
      this.stockSelect(subject),
    ]);
    const count = await this.prisma.$executeRaw`
      UPDATE products
      SET "stockQty" = "stockQty" - ${quantity}, availability = "stockQty" - ${quantity} > 0
      WHERE id = ${id} AND "stockQty" >= ${quantity}`;
    if (count === 0) {
      throw new ConflictException(`Requested deduction ${quantity} exceeds stock for SKU '${sku}'`);
    }
    return this.prisma.product.findUniqueOrThrow({ where: { id }, select });
  }

  private async visibleIdBySku(subject: AccessSubject, sku: string): Promise<number> {
    const product = await this.prisma.product.findUnique({
      where: { sku: normalizeSku(sku) },
      select: { id: true },
    });
    const visible = product && (await this.access.visibleProductIds(subject, product.id)).length;
    if (!product || !visible) throw new NotFoundException(`Product with SKU '${sku}' not found`);
    return product.id;
  }

  // Stock checks and deductions reveal the stock level, so they need the stockQty field.
  private async stockSelect(subject: AccessSubject) {
    const select = await this.productSelect(subject);
    if (!select.stockQty) throw new ForbiddenException('You cannot see stock levels');
    return select;
  }

  // Hidden columns are left out of the SELECT itself, so they never leave the database.
  // Field definitions that don't name a real column are ignored (fail closed).
  private async productSelect(subject: AccessSubject): Promise<Prisma.ProductSelect> {
    const fields = await this.access.visibleFields(subject, PRODUCT_RESOURCE);
    const select: Prisma.ProductSelect = { id: true };
    for (const field of fields) {
      if (PRODUCT_FIELDS.has(field)) select[field as keyof Prisma.ProductSelect] = true;
    }
    return select;
  }
}

function normalizeSku(sku: string) {
  return sku.trim().toUpperCase();
}
