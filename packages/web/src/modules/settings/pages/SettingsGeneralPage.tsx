import { useMutation, useQuery } from '@apollo/client';
import { WORKSPACE_BRAND_COLORS, type WorkspaceBrandColor } from '@hrms/shared';
import { IconLock } from '@tabler/icons-react';
import { useEffect, useState, type CSSProperties } from 'react';

import { EmptyState } from '../../../components/empty-state/EmptyState';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  MY_ORGANIZATION_QUERY,
  UPDATE_MY_ORGANIZATION_BRAND_COLOR_MUTATION,
} from '../../organization/graphql/organization.operations';

type OrganizationRecord = {
  readonly id: string;
  readonly legalName: string;
  readonly displayName: string | null;
  readonly brandColor: string;
};

type MyOrganizationData = { readonly myOrganization: OrganizationRecord | null };

export const SettingsGeneralPage = () => {
  const { user } = useAuth();
  const { data } = useQuery<MyOrganizationData>(MY_ORGANIZATION_QUERY);
  const [updateBrandColor, { loading: savingColor }] = useMutation(
    UPDATE_MY_ORGANIZATION_BRAND_COLOR_MUTATION,
    { refetchQueries: [{ query: MY_ORGANIZATION_QUERY }] },
  );
  const [notice, setNotice] = useState<string | null>(null);

  const organization = data?.myOrganization ?? null;
  const brandColor = (organization?.brandColor ?? 'gray') as WorkspaceBrandColor;
  // Mirrors the organization:manage permission behind updateBrandColor.
  const canManageOrganization =
    user?.roleKeys.includes('tethrAdmin') === true ||
    user?.roleKeys.includes('clientAdmin') === true;

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const onSelectColor = async (color: WorkspaceBrandColor): Promise<void> => {
    if (!canManageOrganization || savingColor || color === brandColor) return;
    await updateBrandColor({ variables: { input: { brandColor: color } } });
    setNotice('Workspace color updated.');
  };

  return (
    <main className="page-frame page-frame-single">
      <div className="employees-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">General</h1>
            <p className="page-subtitle">How this workspace looks and identifies itself.</p>
          </div>
        </header>

        {notice ? <p className="form-success">{notice}</p> : null}

        {!canManageOrganization ? (
          <EmptyState
            icon={IconLock}
            title="Admins only"
            description="Only a workspace administrator can change these settings."
          />
        ) : (
          <section className="table-shell" aria-labelledby="workspace-color-title">
            <div className="table-title-row">
              <div className="table-title" id="workspace-color-title">
                Workspace color
              </div>
            </div>
            <div className="settings-section-body">
              <p className="field-hint">
                Used for the top-bar mark, the search ring, and small accents across the workspace.
              </p>
              <div className="color-swatch-grid">
                {WORKSPACE_BRAND_COLORS.map((color) => (
                  <button
                    aria-label={color}
                    aria-pressed={brandColor === color}
                    className={`color-swatch${brandColor === color ? ' is-selected' : ''}`}
                    disabled={savingColor}
                    key={color}
                    style={{ '--swatch-color': `var(--hrms-color-tag-${color})` } as CSSProperties}
                    title={color}
                    type="button"
                    onClick={() => void onSelectColor(color)}
                  />
                ))}
              </div>
              <p className="field-hint">
                {organization
                  ? `${organization.displayName ?? organization.legalName} · current color ${brandColor}`
                  : 'Loading workspace…'}
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
};
