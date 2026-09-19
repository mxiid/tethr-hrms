import { Field, ID, InputType } from '@nestjs/graphql';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

@InputType()
export class UpdateWorkspaceUserRoleInput {
  @Field(() => ID)
  @IsUUID()
  userId!: string;

  @Field()
  @IsIn(['tethrAdmin', 'tethrHr', 'clientAdmin', 'clientMember', 'employee'])
  roleKey!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  employeeId?: string | null;
}
