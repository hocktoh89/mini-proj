import { Injectable, NotFoundException } from '@nestjs/common';
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
