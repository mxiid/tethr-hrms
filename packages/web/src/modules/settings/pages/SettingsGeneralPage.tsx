import { useMutation, useQuery } from '@apollo/client';
import { WORKSPACE_BRAND_COLORS, type WorkspaceBrandColor } from '@hrms/shared';
import { IconLock, IconSearch } from '@tabler/icons-react';
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

type ColorGroup = {
  readonly label: string;
  readonly colors: readonly WorkspaceBrandColor[];
};

// design.md §4.3 already groups the palette into hue families. Six short,
// labelled rows make "find me a blue" a glance instead of a scan of 25 dots.
const COLOR_GROUPS: readonly ColorGroup[] = [
  { label: 'Reds', colors: ['red', 'ruby', 'crimson', 'tomato'] },
  { label: 'Oranges & yellows', colors: ['orange', 'amber', 'yellow'] },
  { label: 'Greens', colors: ['lime', 'grass', 'green', 'jade', 'mint'] },
  { label: 'Cyans & blues', colors: ['turquoise', 'cyan', 'sky', 'blue'] },
  { label: 'Purples & pinks', colors: ['iris', 'violet', 'purple', 'plum', 'pink'] },
  { label: 'Earth & neutrals', colors: ['bronze', 'gold', 'brown', 'gray'] },
];

// A hue added to WORKSPACE_BRAND_COLORS later must not silently vanish from the
// picker just because nobody filed it into a family here.
const groupedColors = new Set<WorkspaceBrandColor>(COLOR_GROUPS.flatMap((group) => group.colors));
const ungroupedColors = WORKSPACE_BRAND_COLORS.filter((color) => !groupedColors.has(color));
const colorGroups: readonly ColorGroup[] =
  ungroupedColors.length > 0
    ? [...COLOR_GROUPS, { label: 'Other', colors: ungroupedColors }]
    : COLOR_GROUPS;

const chipColorStyle = (color: WorkspaceBrandColor): CSSProperties =>
  ({ '--chip-color': `var(--hrms-color-tag-${color})` }) as CSSProperties;

export const SettingsGeneralPage = () => {
  const { user } = useAuth();
  const { data } = useQuery<MyOrganizationData>(MY_ORGANIZATION_QUERY);
  const [updateBrandColor, { loading: savingColor }] = useMutation(
    UPDATE_MY_ORGANIZATION_BRAND_COLOR_MUTATION,
    { refetchQueries: [{ query: MY_ORGANIZATION_QUERY }] },
  );
  const [notice, setNotice] = useState<string | null>(null);
  // Hover (and keyboard focus) drive the preview so a color can be tried before
  // it is committed; pending marks the single swatch currently being saved.
  const [hoveredColor, setHoveredColor] = useState<WorkspaceBrandColor | null>(null);
  const [pendingColor, setPendingColor] = useState<WorkspaceBrandColor | null>(null);

  const organization = data?.myOrganization ?? null;
  const brandColor = (organization?.brandColor ?? 'gray') as WorkspaceBrandColor;
  const previewColor = hoveredColor ?? pendingColor ?? brandColor;
  const workspaceName = organization?.displayName ?? organization?.legalName ?? 'Workspace';
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
    setPendingColor(color);
    try {
      await updateBrandColor({ variables: { input: { brandColor: color } } });
      setNotice('Workspace color updated.');
    } finally {
      setPendingColor(null);
    }
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
          <section
            aria-labelledby="workspace-color-title"
            className="table-shell settings-section-narrow"
          >
            <div className="table-title-row">
              <div className="table-title" id="workspace-color-title">
                Workspace color
              </div>
            </div>
            <div className="settings-section-body">
              <p className="field-hint">
                Used for the top-bar mark, the search ring, and small accents across the workspace.
              </p>

              <div className="brand-preview" style={chipColorStyle(previewColor)}>
                <span aria-hidden="true" className="brand-preview-mark">
                  {workspaceName.charAt(0).toUpperCase()}
                </span>
                <span className="brand-name">{workspaceName}</span>
                <span aria-hidden="true" className="brand-preview-search">
                  <IconSearch size={16} stroke={2} />
                  Search
                </span>
              </div>

              <div className="color-swatch-groups">
                {colorGroups.map((group) => (
                  <div key={group.label}>
                    <p className="color-swatch-group-label">{group.label}</p>
                    <div className="color-swatch-row">
                      {group.colors.map((color) => (
                        <button
                          aria-label={color}
                          aria-pressed={brandColor === color}
                          className={`color-swatch${brandColor === color ? ' is-selected' : ''}${
                            pendingColor === color ? ' is-pending' : ''
                          }`}
                          disabled={savingColor}
                          key={color}
                          style={
                            { '--swatch-color': `var(--hrms-color-tag-${color})` } as CSSProperties
                          }
                          title={color}
                          type="button"
                          onBlur={() => setHoveredColor(null)}
                          onClick={() => void onSelectColor(color)}
                          onFocus={() => setHoveredColor(color)}
                          onMouseEnter={() => setHoveredColor(color)}
                          onMouseLeave={() => setHoveredColor(null)}
                        >
                          <span className="color-swatch-dot" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="color-swatch-readout" style={chipColorStyle(previewColor)}>
                <span aria-hidden="true" className="color-swatch-readout-dot" />
                <span>
                  <span className="color-swatch-name">{previewColor}</span>
                  {previewColor === brandColor ? ' · current color' : ' · click to apply'}
                </span>
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
};
