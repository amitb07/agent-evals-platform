import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

const DATABASE_URL = Symbol('DATABASE_URL');

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(DATABASE_URL) databaseUrl: string) {
    super({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Module({})
export class PrismaModule {
  static forRoot(databaseUrl: string): DynamicModule {
    return {
      module: PrismaModule,
      global: true,
      providers: [{ provide: DATABASE_URL, useValue: databaseUrl }, PrismaService],
      exports: [PrismaService],
    };
  }
}
