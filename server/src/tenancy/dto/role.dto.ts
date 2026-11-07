import { PartialType } from '@nestjs/swagger';
import { CAPABILITIES } from '@riaya/shared';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

/** Custom roles may be based on these built-in roles; SUPER_ADMIN is not extensible. */
export const CUSTOM_ROLE_BASES = [
  UserRole.CLINIC_ADMIN,
  UserRole.DOCTOR,
  UserRole.RECEPTIONIST,
] as const;

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  @IsIn(CUSTOM_ROLE_BASES)
  baseRole!: UserRole;

  @IsArray()
  @ArrayUnique()
  @IsIn(CAPABILITIES as readonly string[], { each: true })
  permissions!: string[];
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsIn(CUSTOM_ROLE_BASES)
  baseRole?: UserRole;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(CAPABILITIES as readonly string[], { each: true })
  permissions?: string[];
}
