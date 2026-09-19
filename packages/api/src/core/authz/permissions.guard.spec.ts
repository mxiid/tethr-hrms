import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ForbiddenError } from '../../common/errors';

import { AuthorizationService } from './authz.service';
import { PERMISSIONS } from './permissions';
import { PermissionsGuard } from './permissions.guard';
import { IS_PUBLIC_METADATA_KEY } from './public.decorator';
import {
  PERMISSIONS_ANY_METADATA_KEY,
  PERMISSIONS_METADATA_KEY,
} from './require-permissions.decorator';

const handlerWith = (metadata?: { key: string; value: unknown }): (() => void) => {
  const handler = (): void => undefined;
  if (metadata) Reflect.defineMetadata(metadata.key, metadata.value, handler);
  return handler;
};

const classWith = (metadata?: { key: string; value: unknown }): (new () => unknown) => {
  class Empty {}
  if (metadata) Reflect.defineMetadata(metadata.key, metadata.value, Empty);
  return Empty;
};

const contextFor = (handler: () => void, cls: new () => unknown): ExecutionContext =>
  ({ getHandler: () => handler, getClass: () => cls }) as unknown as ExecutionContext;

describe('PermissionsGuard (deny-by-default)', () => {
  const access = { getCurrentAccess: jest.fn() };
  const guard = new PermissionsGuard(new Reflector(), access as unknown as AuthorizationService);

  beforeEach(() => {
    access.getCurrentAccess.mockReset();
    access.getCurrentAccess.mockResolvedValue({
      roleKeys: [],
      permissions: [PERMISSIONS.employeeRead],
      portal: 'none',
    });
  });

  it('allows an explicitly public operation without consulting roles', async () => {
    const handler = handlerWith({ key: IS_PUBLIC_METADATA_KEY, value: true });
    await expect(guard.canActivate(contextFor(handler, classWith()))).resolves.toBe(true);
    expect(access.getCurrentAccess).not.toHaveBeenCalled();
  });

  it('fails closed when an operation declares no policy at all', async () => {
    await expect(guard.canActivate(contextFor(handlerWith(), classWith()))).rejects.toThrow(
      /missing an authorization policy/,
    );
    expect(access.getCurrentAccess).not.toHaveBeenCalled();
  });

  it('allows when the caller holds every required permission', async () => {
    const handler = handlerWith({
      key: PERMISSIONS_METADATA_KEY,
      value: [PERMISSIONS.employeeRead],
    });
    await expect(guard.canActivate(contextFor(handler, classWith()))).resolves.toBe(true);
  });

  it('forbids when a required permission is missing', async () => {
    const handler = handlerWith({
      key: PERMISSIONS_METADATA_KEY,
      value: [PERMISSIONS.employeeWrite],
    });
    await expect(guard.canActivate(contextFor(handler, classWith()))).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('allows an any-of policy when the caller holds one of the permissions', async () => {
    const handler = handlerWith({
      key: PERMISSIONS_ANY_METADATA_KEY,
      value: [PERMISSIONS.employeeSelfWrite, PERMISSIONS.employeeRead],
    });
    await expect(guard.canActivate(contextFor(handler, classWith()))).resolves.toBe(true);
  });

  it('forbids an any-of policy when the caller holds none of the permissions', async () => {
    const handler = handlerWith({
      key: PERMISSIONS_ANY_METADATA_KEY,
      value: [PERMISSIONS.employeeSelfWrite, PERMISSIONS.employeeWrite],
    });
    await expect(guard.canActivate(contextFor(handler, classWith()))).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('honours class-level policy when the handler carries none', async () => {
    const cls = classWith({ key: PERMISSIONS_METADATA_KEY, value: [PERMISSIONS.employeeRead] });
    await expect(guard.canActivate(contextFor(handlerWith(), cls))).resolves.toBe(true);
  });
});
