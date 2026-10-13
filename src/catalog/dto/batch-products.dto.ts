import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class BatchProductsDto {
  @ApiProperty({ type: [String], example: ['SKU-1001', 'SKU-1002'] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  skus!: string[];
}
