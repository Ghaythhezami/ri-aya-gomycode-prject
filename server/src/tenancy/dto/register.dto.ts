import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'owner@clinic.example' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiProperty({ description: 'Name of the organization to create' })
  @IsString()
  organizationName!: string;

  @ApiProperty({ description: 'Name of the first clinic in that organization' })
  @IsString()
  clinicName!: string;

  @ApiPropertyOptional({ enum: ['en', 'ar', 'fr'] })
  @IsOptional()
  @IsIn(['en', 'ar', 'fr'])
  preferredLocale?: 'en' | 'ar' | 'fr';
}
