import {
  toId,
  type EmployeeId,
  type EmployeeSeparationId,
  type HolidayCalendarId,
  type IsoDate,
  type Salutation,
  type SeparationType,
  type UserId,
  type WorkerType,
} from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEventPublisher } from '../../core/events/domain-event-publisher.service';
import { TenantContextService } from '../../core/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../core/tenancy/tenant-scoped.repository';

import { EMPLOYEE_REPOSITORY } from './employee.tokens';
import { EmployeeOffboardingTask } from './entities/employee-offboarding-task.entity';
import { EmployeeSeparation } from './entities/employee-separation.entity';
import { Employee } from './entities/employee.entity';

const todayIso = (): IsoDate => new Date().toISOString().slice(0, 10);

type CreateEmployeeData = {
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly middleName?: string | null;
  readonly salutation?: Salutation | null;
  readonly workEmail?: string | null;
  readonly roleTitle?: string | null;
  readonly dateOfBirth?: IsoDate | null;
  readonly probationEndDate?: IsoDate | null;
  readonly hireDate: IsoDate;
  readonly scheduledConfirmationDate?: IsoDate | null;
  readonly finalConfirmationDate?: IsoDate | null;
  readonly contractEndDate?: IsoDate | null;
  readonly noticePeriodDays?: number | null;
  readonly retirementDate?: IsoDate | null;
  readonly holidayCalendarId?: HolidayCalendarId | null;
  readonly workerType?: WorkerType;
};

type UpdateEmployeeData = {
  readonly firstName?: string | null;
  readonly middleName?: string | null;
  readonly lastName?: string | null;
  readonly salutation?: Salutation | null;
  readonly workEmail?: string | null;
  readonly roleTitle?: string | null;
  readonly dateOfBirth?: IsoDate | null;
  readonly probationEndDate?: IsoDate | null;
  readonly hireDate?: IsoDate | null;
  readonly scheduledConfirmationDate?: IsoDate | null;
  readonly finalConfirmationDate?: IsoDate | null;
  readonly contractEndDate?: IsoDate | null;
  readonly noticePeriodDays?: number | null;
  readonly retirementDate?: IsoDate | null;
  readonly holidayCalendarId?: HolidayCalendarId | null;
  readonly workerType?: WorkerType | null;
};

type SeparateEmployeeData = {
  readonly employeeId: EmployeeId;
  readonly type: SeparationType;
  readonly effectiveDate: IsoDate;
  readonly reason?: string | null;
  readonly resignationLetterDate?: IsoDate | null;
  readonly relievingDate?: IsoDate | null;
  readonly reasonForLeaving?: string | null;
  readonly leaveEncashed?: boolean | null;
  readonly encashmentDate?: IsoDate | null;
  readonly heldOn?: IsoDate | null;
  readonly newWorkplace?: string | null;
  readonly feedback?: string | null;
  readonly initiatedByUserId?: UserId | null;
};

// Owns employee writes. State changes that other modules care about are announced
// via the transactional outbox in the SAME transaction as the write (plan.md §5.2,
// §10) — so a committed change always has its event, and a rolled-back one never does.
@Injectable()
export class EmployeeService {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: TenantScopedRepository<Employee>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: DomainEventPublisher,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  // `manager` lets a caller that already owns a transaction (offer acceptance)
  // include the employee write in it; otherwise this opens its own.
  async create(input: CreateEmployeeData, manager?: EntityManager): Promise<Employee> {
    const organizationId = this.tenantContext.getOrganizationId();
    const run = async (transactionManager: EntityManager): Promise<Employee> => {
      const entity = transactionManager.create(Employee, {
        organizationId,
        employeeNumber: input.employeeNumber,
        firstName: input.firstName,
        middleName: input.middleName ?? null,
        lastName: input.lastName,
        salutation: input.salutation ?? null,
        workEmail: input.workEmail ?? null,
        roleTitle: input.roleTitle ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        probationEndDate: input.probationEndDate ?? null,
        hireDate: input.hireDate,
        scheduledConfirmationDate: input.scheduledConfirmationDate ?? null,
        finalConfirmationDate: input.finalConfirmationDate ?? null,
        contractEndDate: input.contractEndDate ?? null,
        noticePeriodDays: input.noticePeriodDays ?? null,
        retirementDate: input.retirementDate ?? null,
        holidayCalendarId: input.holidayCalendarId ?? null,
        terminationDate: null,
        employmentStatus: 'active',
        workerType: input.workerType ?? 'permanent',
      });
      const saved = await transactionManager.save(entity);
      await this.publisher.publishWithin(transactionManager, {
        name: 'employee.created',
        payload: { employeeId: toId<EmployeeId>(saved.id) },
      });
      return saved;
    };
    const employee = manager
      ? await run(manager)
      : await this.dataSource.transaction((transactionManager) => run(transactionManager));

    await this.audit.record(
      {
        action: 'create',
        resourceType: 'employee',
        resourceId: employee.id,
        after: {
          employeeNumber: employee.employeeNumber,
          employmentStatus: employee.employmentStatus,
        },
      },
      // Join the caller's transaction when one is supplied, so a rolled-back
      // hire does not leave an "employee created" audit behind.
      manager,
    );
    return employee;
  }

  async update(
    id: string,
    input: UpdateEmployeeData,
    updatedByUserId: UserId | null,
  ): Promise<Employee> {
    const organizationId = this.tenantContext.getOrganizationId();
    const employee = await this.dataSource.transaction(async (manager) => {
      const entity = await manager.findOne(Employee, { where: { id, organizationId } });
      if (!entity) {
        throw new NotFoundError('Employee not found', { id });
      }
      const changedFields: string[] = [];
      const apply = <K extends keyof UpdateEmployeeData>(key: K, target: keyof Employee): void => {
        if (input[key] !== undefined) {
          const next = (input[key] as unknown as string | null) ?? null;
          if ((entity as unknown as Record<string, unknown>)[target as string] !== next) {
            changedFields.push(String(target));
          }
          (entity as unknown as Record<string, unknown>)[target as string] = next;
        }
      };
      apply('firstName', 'firstName');
      apply('middleName', 'middleName');
      apply('lastName', 'lastName');
      apply('salutation', 'salutation');
      apply('workEmail', 'workEmail');
      apply('roleTitle', 'roleTitle');
      apply('dateOfBirth', 'dateOfBirth');
      apply('probationEndDate', 'probationEndDate');
      apply('hireDate', 'hireDate');
      apply('scheduledConfirmationDate', 'scheduledConfirmationDate');
      apply('finalConfirmationDate', 'finalConfirmationDate');
      apply('contractEndDate', 'contractEndDate');
      apply('noticePeriodDays', 'noticePeriodDays');
      apply('retirementDate', 'retirementDate');
      apply('holidayCalendarId', 'holidayCalendarId');
      if (input.workerType !== undefined) {
        const next = input.workerType ?? null;
        if (entity.workerType !== next) changedFields.push('workerType');
        if (next) entity.workerType = next;
      }
      const saved = await manager.save(entity);
      if (changedFields.length > 0) {
        await this.publisher.publishWithin(manager, {
          name: 'employee.updated',
          payload: {
            employeeId: toId<EmployeeId>(saved.id),
            changedFields,
          },
        });
      }
      return saved;
    });

    await this.audit.record({
      action: 'update',
      resourceType: 'employee',
      resourceId: employee.id,
      after: { changedFields: Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined), updatedByUserId },
    });
    return employee;
  }

  async terminate(id: string, effectiveDate: IsoDate, reason: string): Promise<Employee> {
    return this.separate({
      employeeId: toId<EmployeeId>(id),
      type: 'termination',
      effectiveDate,
      reason,
      reasonForLeaving: reason,
    });
  }

  async separate(input: SeparateEmployeeData): Promise<Employee> {
    const organizationId = this.tenantContext.getOrganizationId();
    const result = await this.dataSource.transaction(async (manager) => {
      const entity = await manager.findOne(Employee, {
        where: { id: input.employeeId, organizationId },
      });
      if (!entity) {
        throw new NotFoundError('Employee not found', { id: input.employeeId });
      }
      if (entity.employmentStatus === 'terminated') {
        throw new ConflictError('Employee is already terminated', { id: input.employeeId });
      }
      // Scheduled application does not exist yet (BACKLOG-1): applying a
      // future-dated separation now would disable login, close pay/benefits,
      // and settle on the spot. Reject until the date arrives.
      const today = todayIso();
      if (input.effectiveDate > today) {
        throw new ValidationFailedError('effectiveDate cannot be in the future', {
          effectiveDate: input.effectiveDate,
          today,
        });
      }
      entity.employmentStatus = 'terminated';
      entity.terminationDate = input.effectiveDate;
      const saved = await manager.save(entity);
      await this.publisher.publishWithin(manager, {
        name: 'employee.terminated',
        payload: {
          employeeId: toId<EmployeeId>(saved.id),
          effectiveDate: input.effectiveDate,
          reason: input.reason ?? input.reasonForLeaving ?? input.type,
        },
      });

      const separation = manager.create(EmployeeSeparation, {
        organizationId,
        employeeId: input.employeeId,
        type: input.type,
        resignationLetterDate: input.resignationLetterDate ?? null,
        relievingDate: input.relievingDate ?? input.effectiveDate,
        reasonForLeaving: input.reasonForLeaving ?? input.reason ?? null,
        leaveEncashed: input.leaveEncashed ?? false,
        encashmentDate: input.encashmentDate ?? null,
        heldOn: input.heldOn ?? null,
        newWorkplace: input.newWorkplace ?? null,
        feedback: input.feedback ?? null,
        initiatedByUserId: input.initiatedByUserId ?? null,
      });
      const savedSeparation = await manager.save(separation);
      await this.publisher.publishWithin(manager, {
        name: 'employee.separationRecorded',
        payload: {
          employeeSeparationId: toId<EmployeeSeparationId>(savedSeparation.id),
          employeeId: input.employeeId,
          type: input.type,
        },
      });

      // Seed offboarding tasks mirroring onboarding definitions
      const OFFBOARDING_DEFINITIONS: readonly { taskKey: string; title: string }[] = [
        { taskKey: 'clearance', title: 'Clearance checklist' },
        { taskKey: 'assetReturn', title: 'Asset return' },
        { taskKey: 'knowledgeTransfer', title: 'Knowledge transfer' },
        { taskKey: 'exitInterview', title: 'Exit interview' },
        { taskKey: 'finalSettlement', title: 'Final settlement' },
        { taskKey: 'deprovision', title: 'Account deprovisioning' },
      ];
      for (const definition of OFFBOARDING_DEFINITIONS) {
        const existing = await manager.findOne(EmployeeOffboardingTask, {
          where: {
            organizationId,
            employeeId: input.employeeId,
            taskKey: definition.taskKey as never,
          },
        });
        if (!existing) {
          const task = manager.create(EmployeeOffboardingTask, {
            organizationId,
            employeeId: input.employeeId,
            separationId: savedSeparation.id,
            taskKey: definition.taskKey as never,
            title: definition.title,
            status: 'notStarted',
          });
          await manager.save(task);
        }
      }

      return { employee: saved, separation: savedSeparation };
    });

    await this.audit.record({
      action: 'terminate',
      resourceType: 'employee',
      resourceId: result.employee.id,
      after: { employmentStatus: 'terminated', terminationDate: input.effectiveDate },
    });
    await this.audit.record({
      action: 'separate',
      resourceType: 'employee_separation',
      resourceId: result.separation.id,
      after: { employeeId: input.employeeId, type: input.type },
    });
    return result.employee;
  }

  async updateRoleTitle(
    id: EmployeeId,
    roleTitle: string | null,
    updatedByUserId: UserId,
    manager?: EntityManager,
  ): Promise<Employee> {
    const organizationId = this.tenantContext.getOrganizationId();
    const run = async (target: EntityManager): Promise<Employee> => {
      const entity = await target.findOne(Employee, { where: { id, organizationId } });
      if (!entity) {
        throw new NotFoundError('Employee not found', { id });
      }
      entity.roleTitle = roleTitle;
      const saved = await target.save(entity);
      await this.publisher.publishWithin(target, {
        name: 'employee.updated',
        payload: {
          employeeId: toId<EmployeeId>(saved.id),
          changedFields: ['roleTitle'],
        },
      });
      return saved;
    };
    const employee = manager ? await run(manager) : await this.dataSource.transaction(run);

    await this.audit.record({
      action: 'update',
      resourceType: 'employee',
      resourceId: employee.id,
      after: { roleTitle: employee.roleTitle, updatedByUserId },
    });
    return employee;
  }

  list(): Promise<Employee[]> {
    return this.employees.find();
  }

  async getById(id: string): Promise<Employee> {
    const employee = await this.employees.findById(id);
    if (!employee) {
      throw new NotFoundError('Employee not found', { id });
    }
    return employee;
  }
}
