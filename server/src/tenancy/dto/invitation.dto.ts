import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

export class InviteDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    description:
      'Clinic the invitee joins. A selector, not a scope claim: it is resolved inside the caller’s own organization.',
  })
  @IsUUID()
  clinicId!: string;

  @ApiPropertyOptional({
    enum: UserRole,
    description: 'System role. Optional when roleKey is given (the role then comes from it).',
  })
  @ValidateIf((o: InviteDto) => !o.roleKey)
  @IsIn(Object.values(UserRole))
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'System role name or custom role key of the clinic. Takes precedence over role.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  roleKey?: string;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(256)
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({
    description: 'Required when the invited email already has an account (proves ownership).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}

export class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  organizationName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  clinicName!: string;
}
