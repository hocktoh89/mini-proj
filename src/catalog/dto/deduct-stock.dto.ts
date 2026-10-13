import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

// Field name kept from the ERP API. It is the amount to deduct, not the new stock level.
export class DeductStockDto {
  @ApiProperty({ description: 'Amount to deduct from stockQty' })
  @IsInt()
  @Min(0)
  stockQuantity!: number;
}
