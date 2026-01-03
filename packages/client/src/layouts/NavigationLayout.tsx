import { useState } from "react";
import { Outlet, useOutletContext } from "react-router-dom";
import { NavigationSidebar } from "../components/NavigationSidebar";
import { useSidebarPreference } from "../hooks/useSidebarPreference";
import { useSidebarWidth } from "../hooks/useSidebarWidth";
import { useViewportWidth } from "../hooks/useViewportWidth";

export interface NavigationLayoutContext {
  /** Open the mobile sidebar */
  openSidebar: () => void;
  /** Whether we're in desktop mode (wide screen) */
  isWideScreen: boolean;
  /** Desktop mode: sidebar is collapsed (icons only) */
  isSidebarCollapsed: boolean;
  /** Desktop mode: callback to toggle sidebar expanded/collapsed state */
  toggleSidebar: () => void;
}

/**
 * Shared layout for top-level navigation pages (inbox, projects, settings, agents).
 * Renders the NavigationSidebar once so it persists across route changes.
 */
export function NavigationLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isExpanded, toggleExpanded } = useSidebarPreference();
  const {
    width: sidebarWidth,
    setWidth: setSidebarWidth,
    isResizing,
    setIsResizing,
    canShowDesktop,
    canShowExpanded,
  } = useSidebarWidth();
  const viewportWidth = useViewportWidth();

  // Desktop mode as long as collapsed sidebar fits
  const isWideScreen = canShowDesktop(viewportWidth);
  // Auto-collapse if viewport too narrow for expanded sidebar, or if user prefers collapsed
  const effectivelyCollapsed = !isExpanded || !canShowExpanded(viewportWidth);

  const context: NavigationLayoutContext = {
    openSidebar: () => setSidebarOpen(true),
    isWideScreen,
    isSidebarCollapsed: effectivelyCollapsed,
    toggleSidebar: toggleExpanded,
  };

  // CSS variable for sidebar width
  const containerStyle = isWideScreen
    ? ({ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`session-page ${isWideScreen ? "desktop-layout" : ""} ${isResizing ? "resizing" : ""}`}
      style={containerStyle}
    >
      {/* Desktop sidebar - always visible on wide screens */}
      {isWideScreen && (
        <aside
          className={`sidebar-desktop ${effectivelyCollapsed ? "sidebar-collapsed" : ""} ${isResizing ? "resizing" : ""}`}
          style={{ width: effectivelyCollapsed ? undefined : sidebarWidth }}
        >
          <NavigationSidebar
            isOpen={true}
            onClose={() => {}}
            isDesktop={true}
            isCollapsed={effectivelyCollapsed}
            onToggleExpanded={toggleExpanded}
            sidebarWidth={sidebarWidth}
            onResizeStart={() => setIsResizing(true)}
            onResize={setSidebarWidth}
            onResizeEnd={() => setIsResizing(false)}
          />
        </aside>
      )}

      {/* Mobile sidebar - modal overlay */}
      {!isWideScreen && (
        <NavigationSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Child route content */}
      <Outlet context={context} />
    </div>
  );
}

/**
 * Hook for child routes to access the shared navigation layout context.
 */
export function useNavigationLayout(): NavigationLayoutContext {
  return useOutletContext<NavigationLayoutContext>();
}
