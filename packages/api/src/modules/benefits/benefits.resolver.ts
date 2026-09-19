import { toId, type EmployeeId } from '@hrms/shared';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { NotFoundError } from '../../common/errors';
import { AuthService } from '../../core/auth/auth.service';
import { PERMISSIONS } from '../../core/authz/permissions';
import { RequirePermissions } from '../../core/authz/require-permissions.decorator';

import type { BenefitEnrollmentDetail } from './benefit.service';
import { BenefitService } from './benefit.service';
import {
  CreateBenefitPlanInput,
  EndBenefitEnrollmentArgs,
  SetBenefitEnrollmentInput,
  UpdateBenefitPlanInput,
} from './dto/benefit.inputs';
import { BenefitEnrollmentView, BenefitPlanView } from './dto/benefit.view';
import type { BenefitPlan } from './entities/benefit-plan.entity';

const toPlanView = (plan: BenefitPlan): BenefitPlanView => ({
  id: plan.id,
  code: plan.code,
  name: plan.name,
  description: plan.description,
  employeeContributionAmount: Number(plan.employeeContributionAmount),
  employerContributionAmount: Number(plan.employerContributionAmount),
  reducesTaxable: plan.reducesTaxable,
  isActive: plan.isActive,
});

const toEnrollmentView = (detail: BenefitEnrollmentDetail): BenefitEnrollmentView => ({
  id: detail.enrollment.id,
  employeeId: detail.enrollment.employeeId,
  planId: detail.enrollment.planId,
  planCode: detail.plan?.code ?? null,
  planName: detail.plan?.name ?? null,
  // The enrollment snapshot wins; legacy rows without one read the live plan.
  employeeContributionAmount: Number(
    detail.enrollment.employeeContributionAmount ?? detail.plan?.employeeContributionAmount ?? 0,
  ),
  employerContributionAmount: Number(
    detail.enrollment.employerContributionAmount ?? detail.plan?.employerContributionAmount ?? 0,
  ),
  reducesTaxable: detail.enrollment.reducesTaxable ?? detail.plan?.reducesTaxable ?? false,
  validFrom: detail.enrollment.validFrom,
  validTo: detail.enrollment.validTo,
  note: detail.enrollment.note,
});

@Resolver(() => BenefitPlanView)
export class BenefitsResolver {
  constructor(
    private readonly benefits: BenefitService,
    private readonly authService: AuthService,
  ) {}

  @Query(() => [BenefitPlanView])
  @RequirePermissions(PERMISSIONS.compensationRead)
  async benefitPlans(): Promise<BenefitPlanView[]> {
    return (await this.benefits.listPlans()).map(toPlanView);
  }

  @Mutation(() => BenefitPlanView)
  @RequirePermissions(PERMISSIONS.compensationWrite)
  async createBenefitPlan(
    @Args('input') input: CreateBenefitPlanInput,
  ): Promise<BenefitPlanView> {
    return toPlanView(await this.benefits.createPlan(input));
  }

  @Mutation(() => BenefitPlanView)
  @RequirePermissions(PERMISSIONS.compensationWrite)
  async updateBenefitPlan(
    @Args('input') input: UpdateBenefitPlanInput,
  ): Promise<BenefitPlanView> {
    return toPlanView(await this.benefits.updatePlan(input));
  }

  @Query(() => [BenefitEnrollmentView])
  @RequirePermissions(PERMISSIONS.compensationRead)
  async benefitEnrollments(
    @Args('employeeId', { type: () => ID }) employeeId: string,
  ): Promise<BenefitEnrollmentView[]> {
    return (await this.benefits.listEnrollments(toId<EmployeeId>(employeeId))).map(
      toEnrollmentView,
    );
  }

  @Mutation(() => BenefitEnrollmentView)
  @RequirePermissions(PERMISSIONS.compensationWrite)
  async setBenefitEnrollment(
    @Args('input') input: SetBenefitEnrollmentInput,
  ): Promise<BenefitEnrollmentView> {
    const enrollment = await this.benefits.setEnrollment({
      employeeId: toId<EmployeeId>(input.employeeId),
      planId: input.planId,
      effectiveDate: input.effectiveDate,
      note: input.note ?? null,
    });
    const details = await this.benefits.listEnrollments(toId<EmployeeId>(input.employeeId));
    const matching = details.find((row) => row.enrollment.id === enrollment.id);
    return toEnrollmentView(matching ?? { enrollment, plan: null });
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.compensationWrite)
  async endBenefitEnrollment(@Args() args: EndBenefitEnrollmentArgs): Promise<boolean> {
    await this.benefits.endEnrollment(
      toId<EmployeeId>(args.employeeId),
      args.planId,
      args.endDate ?? null,
    );
    return true;
  }

  // Self-service: the caller's own enrollments (identity from the session).
  @Query(() => [BenefitEnrollmentView])
  @RequirePermissions(PERMISSIONS.compensationOwnRead)
  async myBenefitEnrollments(): Promise<BenefitEnrollmentView[]> {
    const user = await this.authService.getCurrentUser();
    if (!user.employeeId) {
      throw new NotFoundError('No employee record is linked to this account');
    }
    return (await this.benefits.listEnrollments(toId<EmployeeId>(user.employeeId))).map(
      toEnrollmentView,
    );
  }
}
