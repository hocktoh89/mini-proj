import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsInt, ValidateIf } from 'class-validator';

export class SetUserHierarchyDto {
  @ApiProperty({ type: Number, nullable: true, description: 'null = not in any organization' })
  @ValidateIf((dto: SetUserHierarchyDto) => dto.organizationId !== null)
  @IsInt()
  organizationId!: number | null;

  @ApiProperty({ type: [Number], description: 'Replaces every node the user is assigned to' })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  nodeIds!: number[];
}
