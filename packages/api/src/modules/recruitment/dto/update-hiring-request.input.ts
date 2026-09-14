import { HIRING_REQUEST_STATUSES } from '@hrms/shared';
import { Field, ID, InputType } from '@nestjs/graphql';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

@InputType()
export class UpdateHiringRequestInput {
  @Field(() => ID)
  @IsUUID()
  hiringRequestId!: string;

  @Field()
  @IsIn([...HIRING_REQUEST_STATUSES])
  status!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  tethrNote?: string | null;

  // The workspace the request belongs to. The Tethr board passes the row's
  // organization so a client's request is updated in place; the service
  // verifies the caller is an operator before switching.
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  organizationId?: string | null;
}
