import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    // node-postgres ignores ?schema=, so hand it to the adapter (migrations already honour it).
    const schema = connectionString && new URL(connectionString).searchParams.get('schema');
    super({ adapter: new PrismaPg({ connectionString }, schema ? { schema } : undefined) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
