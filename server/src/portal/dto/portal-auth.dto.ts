import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LocalizedTextDto } from '../../common/locale/localized-text.dto';

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const PHONE = /^\+?[0-9 ()-]{6,24}$/;
export const LOCALES = ['en', 'fr', 'ar'] as const;

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Mirrors `PortalRegisterInput`. The password policy is checked in the service (WEAK_PASSWORD). */
export class PortalRegisterDto {
  @ApiProperty() @IsUUID() clinicId!: string;
  @ApiProperty() @IsEmail() @Transform(lowerTrim) @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(128) password!: string;
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  firstNameI18n!: LocalizedTextDto;
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  lastNameI18n!: LocalizedTextDto;
  @ApiProperty({ example: '1990-04-21' }) @Matches(DATE) dateOfBirth!: string;
  @ApiProperty() @Matches(PHONE) phone!: string;
  @ApiProperty({ enum: LOCALES }) @IsIn(LOCALES) preferredLocale!: 'en' | 'fr' | 'ar';
  @ApiProperty({ enum: [true] }) @Equals(true) acceptPrivacy!: true;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() aiConsent?: boolean;
}

/** Mirrors `PortalAcceptInviteInput`. */
export class PortalAcceptInviteDto {
  @ApiProperty() @IsString() @MinLength(16) @MaxLength(256) token!: string;
  @ApiProperty({ example: '1990-04-21', description: 'Must match the patient record' })
  @Matches(DATE)
  dateOfBirth!: string;
  @ApiProperty() @IsEmail() @Transform(lowerTrim) @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(128) password!: string;
  @ApiProperty({ enum: [true] }) @Equals(true) acceptPrivacy!: true;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() aiConsent?: boolean;
}

/** Mirrors `PortalLoginInput`. */
export class PortalLoginDto {
  @ApiProperty() @IsUUID() clinicId!: string;
  @ApiProperty() @IsEmail() @Transform(lowerTrim) @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) password!: string;
}

/** Body of `POST /portal/auth/forgot-password`. */
export class PortalForgotPasswordDto {
  @ApiProperty() @IsUUID() clinicId!: string;
  @ApiProperty() @IsEmail() @Transform(lowerTrim) @MaxLength(254) email!: string;
}

/** Body of `POST /portal/auth/reset-password`. The password policy is checked in the service. */
export class PortalResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(16) @MaxLength(256) token!: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(128) password!: string;
}
