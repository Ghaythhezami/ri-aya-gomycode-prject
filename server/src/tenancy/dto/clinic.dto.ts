import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Create another clinic inside the caller's active organization. */
export class CreateClinicDto {
  @ApiProperty({ example: 'Downtown Branch' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
