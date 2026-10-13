import { Global, Module } from '@nestjs/common';
import { VendorErpService } from './vendor-erp.service';

@Global()
@Module({
  providers: [VendorErpService],
  exports: [VendorErpService],
})
export class VendorErpModule {}
