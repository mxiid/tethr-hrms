import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class UpdateMyPhotoInput {
  // Data URL (base64) — the SPA reads a picked file and sends it inline, same
  // cap and margin as the admin employee-photo upload (UpdateEmployeePhotoInput).
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(600_000)
  photoUrl?: string | null;
}
