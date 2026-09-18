import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

@InputType()
export class DecideLeaveRequestInput {
  @Field(() => ID)
  @IsUUID()
  leaveRequestId!: string;

  // Deprecated and ignored: decisions are recorded as the session user. Kept
  // optional so existing clients that still send it keep working.
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  decidedByUserId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
