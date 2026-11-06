import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'owner@clinic.example' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ description: 'Name of the organization to create' })
  @IsString()
  @MaxLength(120)
  organizationName!: string;

  @ApiProperty({ description: 'Name of the first clinic in that organization' })
  @IsString()
  @MaxLength(120)
  clinicName!: string;

  @ApiPropertyOptional({ enum: ['en', 'ar', 'fr'] })
  @IsOptional()
  @IsIn(['en', 'ar', 'fr'])
  preferredLocale?: 'en' | 'ar' | 'fr';
}
