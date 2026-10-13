import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;

  // bcrypt only uses the first 72 bytes of the input.
  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
