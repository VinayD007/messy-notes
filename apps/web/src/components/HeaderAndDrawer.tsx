import {
  buildGroupedText,
  hasCopyableText,
  type Note,
  type NoteFilter,
} from '@messy-notes/shared';
import { useAuthStore } from '../store/authStore';
import { useNotesStore } from '../store/notesStore';
import {
  ArrowBackIcon,
  ChecklistIcon,
  CloseIcon,
  ContentCopyIcon,
  DarkModeIcon,
  DeleteOutlineIcon,
  EditIcon,
  LightModeIcon,
  MenuIcon,
  OpenInFullIcon,
  SearchIcon,
} from './MaterialIcons';

const FILTER_LABELS: Record<NoteFilter, string> = {
  all: 'All',
  regular: 'Notes',
  field: 'Fields-Values',
  list: 'Lists',
};

export function TopHeader({
  binCount,
  onOpenDrawer,
  onExpandEditor,
  onEmptyBin,
  onEditSelected,
  onPartialCopySelected,
  onDeleteSelected,
}: {
  binCount: number;
  onOpenDrawer: () => void;
  onExpandEditor?: () => void;
  onEmptyBin: () => void;
  onEditSelected: (note: Note) => void;
  onPartialCopySelected: (note: Note) => void;
  onDeleteSelected: (ids: string[]) => void;
}) {
  const {
    notes,
    activeView,
    filterType,
    searchActive,
    selectedNoteIds,
    realtimeStatus,
    isOnline,
    syncing,
    pendingCount,
    getSearchQueryForActiveView,
    setActiveView,
    setSearchActive,
    setSearchQueryForActiveView,
    clearSelection,
    showSnackbar,
    triggerManualSync,
  } = useNotesStore();

  const selectedList = notes.filter((n) => selectedNoteIds.has(n.id));

  if (selectedList.length > 0) {
    const canCopyAny = selectedList.some(hasCopyableText);
    const handleBulkCopy = async () => {
      const parts = selectedList.filter(hasCopyableText).map(buildGroupedText);
      if (parts.length === 0) {
        clearSelection();
        showSnackbar({ message: 'No Text Found' });
        return;
      }
      await navigator.clipboard.writeText(parts.join('\n\n'));
      clearSelection();
      showSnackbar({ message: 'Copied to clipboard!' });
    };

    const handleSinglePartialCopy = () => {
      const target = selectedList[0]!;
      if (!hasCopyableText(target)) {
        clearSelection();
        showSnackbar({ message: 'No Text Found' });
        return;
      }
      onPartialCopySelected(target);
    };

    return (
      <header className="top-header">
        <div className="header-left">
          <button
            type="button"
            className="icon-btn"
            aria-label="Clear selection"
            onClick={clearSelection}
          >
            <CloseIcon size={20} />
          </button>
          <strong className="selection-count-label">{selectedList.length} selected</strong>
        </div>

        <div className="header-actions">
          {selectedList.length === 1 && (
            <>
              <button
                type="button"
                className="icon-btn header-action-pill"
                aria-label="Edit note"
                title="Edit"
                onClick={() => onEditSelected(selectedList[0]!)}
              >
                <EditIcon size={20} />
              </button>
              <button
                type="button"
                className={`icon-btn header-action-pill ${canCopyAny ? '' : 'disabled-action'}`}
                aria-label="Copy partially"
                aria-disabled={!canCopyAny}
                title="Copy partially"
                onClick={handleSinglePartialCopy}
              >
                <ChecklistIcon size={20} />
              </button>
            </>
          )}
          <button
            type="button"
            className={`icon-btn header-action-pill ${canCopyAny ? '' : 'disabled-action'}`}
            aria-label="Copy selected notes"
            aria-disabled={!canCopyAny}
            title="Copy"
            onClick={() => void handleBulkCopy()}
          >
            <ContentCopyIcon size={19} />
          </button>
          <button
            type="button"
            className="icon-btn header-danger-pill"
            aria-label="Delete selected notes"
            title="Delete"
            onClick={() => onDeleteSelected(selectedList.map((n) => n.id))}
          >
            <DeleteOutlineIcon size={20} />
          </button>
        </div>
      </header>
    );
  }

  if (searchActive) {
    const query = getSearchQueryForActiveView();
    const placeholder =
      activeView === 'favorites'
        ? 'Search favorites...'
        : activeView === 'bin'
          ? 'Search bin...'
          : 'Search notes...';

    return (
      <header className="top-header search-header">
        <div className="search-bar-pill">
          <button
            type="button"
            className="icon-btn"
            aria-label="Exit search"
            onClick={() => {
              setSearchQueryForActiveView('');
              setSearchActive(false);
            }}
          >
            <ArrowBackIcon size={20} />
          </button>
          <input
            type="search"
            className="header-search-input"
            value={query}
            onChange={(e) => setSearchQueryForActiveView(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
          {query ? (
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              aria-label="Clear search query"
              onClick={() => setSearchQueryForActiveView('')}
            >
              <CloseIcon size={18} />
            </button>
          ) : null}
          <span className="search-corner-icon" aria-hidden="true">
            <SearchIcon size={20} />
          </span>
        </div>
      </header>
    );
  }

  const title =
    activeView === 'favorites'
      ? 'Favorites'
      : activeView === 'bin'
        ? 'Bin'
        : filterType === 'all'
          ? 'All Notes'
          : FILTER_LABELS[filterType];

  return (
    <header className="top-header">
      <div className="header-left">
        {activeView === 'home' ? (
          <button
            type="button"
            className="icon-btn mobile-menu-trigger"
            aria-label="Open menu"
            onClick={onOpenDrawer}
          >
            <MenuIcon size={22} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn"
            aria-label="Back to All Notes"
            onClick={() => setActiveView('home')}
          >
            <ArrowBackIcon size={22} />
          </button>
        )}
        <div className="header-title-stack">
          <strong className="app-title">{title}</strong>
          <button
            type="button"
            className={`live-pill live-${realtimeStatus}`}
            onClick={() => void triggerManualSync()}
            title="Click to sync now"
          >
            <span className="live-dot" aria-hidden="true" />
            {!isOnline
              ? `Offline (${pendingCount} queued)`
              : syncing
                ? 'Syncing...'
                : pendingCount > 0
                  ? `${pendingCount} queued`
                  : realtimeStatus === 'connected'
                    ? 'Live'
                    : realtimeStatus}
          </button>
        </div>
      </div>

      <div className="header-actions">
        {activeView === 'bin' && (
          <button
            type="button"
            className="btn-ghost danger-text"
            disabled={binCount === 0}
            onClick={onEmptyBin}
          >
            Delete all
          </button>
        )}
        {activeView === 'home' && onExpandEditor && (
          <button
            type="button"
            className="icon-btn header-action-pill"
            aria-label="Expand editor"
            title="Expand editor"
            onClick={onExpandEditor}
          >
            <OpenInFullIcon size={20} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn header-search-trigger"
          aria-label="Search notes"
          onClick={() => setSearchActive(true)}
        >
          <SearchIcon size={22} />
        </button>
      </div>
    </header>
  );
}

export function HomeFilterBar({
  vertical = false,
  onAfterSelect,
}: {
  vertical?: boolean;
  onAfterSelect?: () => void;
} = {}) {
  const { activeView, filterType, setActiveView, setFilterType } = useNotesStore();
  return (
    <div className={vertical ? 'filter-bar filter-bar-vertical' : 'filter-bar'}>
      {(['all', 'regular', 'field', 'list'] as const).map((filter) => {
        const isActive = activeView === 'home' && filterType === filter;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={isActive}
            className={`filter-pill ${isActive ? 'active' : ''}`}
            onClick={() => {
              setActiveView('home');
              setFilterType(filter);
              onAfterSelect?.();
            }}
          >
            {FILTER_LABELS[filter]}
          </button>
        );
      })}
    </div>
  );
}

export function NavigationDrawer({
  open,
  persistent = false,
  themeMode,
  onToggleTheme,
  onClose,
}: {
  open: boolean;
  persistent?: boolean;
  themeMode: 'dark' | 'light';
  onToggleTheme: () => void;
  onClose: () => void;
}) {
  const { user, signOut } = useAuthStore();
  const {
    activeView,
    setActiveView,
    setFilterType,
    setSearchQueryForActiveView,
    setSearchActive,
    clearSelection,
    triggerManualSync,
    reset,
  } = useNotesStore();

  if (!persistent && !open) return null;

  const handleNavigate = (view: 'home' | 'favorites' | 'bin') => {
    setActiveView(view);
    if (!persistent) {
      onClose();
    }
  };

  const handleBrandClick = () => {
    setActiveView('home');
    setFilterType('all');
    setSearchQueryForActiveView('');
    setSearchActive(false);
    clearSelection();
    if (!persistent) {
      onClose();
    }
    void triggerManualSync();
  };

  const drawerContent = (
    <aside
      className={persistent ? 'nav-drawer persistent-sidebar' : 'nav-drawer'}
      aria-label={persistent ? 'Workspace sidebar' : 'Navigation drawer'}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="drawer-header">
        <a
          href="/"
          className="drawer-brand"
          aria-label="MessyNotes home"
          onClick={handleBrandClick}
        >
          <img src="/icon-192.png" alt="" className="drawer-brand-icon" />
          <strong>MessyNotes</strong>
        </a>
        <button
          type="button"
          className="theme-switch-btn"
          aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
          onClick={onToggleTheme}
        >
          {themeMode === 'dark' ? (
            <LightModeIcon size={20} />
          ) : (
            <DarkModeIcon size={20} />
          )}
        </button>
      </div>

      <div className="drawer-section">
        <span className="drawer-section-label">Navigation</span>
        <button
          type="button"
          className={`drawer-item ${activeView === 'home' ? 'active' : ''}`}
          onClick={() => handleNavigate('home')}
        >
          All Notes
        </button>
        <div
          className="drawer-nested-filters"
          role="group"
          aria-label="All Notes filters"
        >
          <HomeFilterBar
            vertical
            onAfterSelect={persistent ? undefined : onClose}
          />
        </div>
        <button
          type="button"
          className={`drawer-item ${activeView === 'favorites' ? 'active' : ''}`}
          onClick={() => handleNavigate('favorites')}
        >
          Favorites
        </button>
        <button
          type="button"
          className={`drawer-item ${activeView === 'bin' ? 'active' : ''}`}
          onClick={() => handleNavigate('bin')}
        >
          Bin
        </button>
      </div>

      <div className="drawer-footer-group">
        <div className="drawer-footer drawer-pill-container">
          <span className="drawer-user-email" title={user?.email ?? ''}>
            {user?.email}
          </span>
          <button
            type="button"
            className="drawer-signout-btn"
            onClick={() => {
              reset();
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );

  if (persistent) {
    return drawerContent;
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      {drawerContent}
    </div>
  );
}
