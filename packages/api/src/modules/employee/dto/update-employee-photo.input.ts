import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class UpdateEmployeePhotoInput {
  @Field(() => ID)
  @IsString()
  employeeId!: string;

  // Data URL (base64) — capped well above a 300 KB image, same margin as
  // the billing letterhead upload.
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(600_000)
  photoUrl?: string | null;
}
