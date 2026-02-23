import type { GitFileChange } from "@yep-anywhere/shared";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { ProjectSelector } from "../components/ProjectSelector";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useGitStatus } from "../hooks/useGitStatus";
import { useProject, useProjects } from "../hooks/useProjects";
import { useNavigationLayout } from "../layouts";

export function GitStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const { openSidebar, isWideScreen, toggleSidebar, isSidebarCollapsed } =
    useNavigationLayout();

  const { projects, loading: projectsLoading } = useProjects();
  const effectiveProjectId = projectId || projects[0]?.id;
  const { project } = useProject(effectiveProjectId);
  const { gitStatus, loading, error } = useGitStatus(effectiveProjectId);

  useDocumentTitle(project?.name, "Source Control");

  const handleProjectChange = (newProjectId: string) => {
    setSearchParams({ projectId: newProjectId }, { replace: true });
  };

  if (!effectiveProjectId && !projectsLoading && projects.length === 0) {
    return <div className="error">No projects available</div>;
  }

  const wrapperClass = isWideScreen
    ? "main-content-wrapper"
    : "main-content-mobile";
  const innerClass = isWideScreen
    ? "main-content-constrained"
    : "main-content-mobile-inner";

  return (
    <div className={wrapperClass}>
      <div className={innerClass}>
        <PageHeader
          title={project?.name ?? "Source Control"}
          titleElement={
            effectiveProjectId ? (
              <ProjectSelector
                currentProjectId={effectiveProjectId}
                currentProjectName={project?.name}
                onProjectChange={(p) => handleProjectChange(p.id)}
              />
            ) : undefined
          }
          onOpenSidebar={openSidebar}
          onToggleSidebar={toggleSidebar}
          isWideScreen={isWideScreen}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="page-scroll-container">
          <div className="page-content-inner">
            {loading || projectsLoading ? (
              <div className="loading">Loading...</div>
            ) : error ? (
              <div className="error">Error: {error.message}</div>
            ) : gitStatus && !gitStatus.isGitRepo ? (
              <div className="git-status-empty">Not a git repository</div>
            ) : gitStatus ? (
              <GitStatusContent status={gitStatus} />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function GitStatusContent({
  status,
}: {
  status: import("@yep-anywhere/shared").GitStatusInfo;
}) {
  const stagedFiles = status.files.filter((f) => f.staged);
  const unstagedFiles = status.files.filter(
    (f) => !f.staged && f.status !== "?",
  );
  const untrackedFiles = status.files.filter((f) => f.status === "?");

  return (
    <div className="git-status">
      <div className="git-status-branch">
        <span className="git-branch-icon">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
        </span>
        <span className="git-branch-name">
          {status.branch ?? "(detached HEAD)"}
        </span>
        {status.upstream && (
          <span className="git-upstream"> → {status.upstream}</span>
        )}
        {(status.ahead > 0 || status.behind > 0) && (
          <span className="git-ahead-behind">
            {status.ahead > 0 && ` ↑${status.ahead}`}
            {status.behind > 0 && ` ↓${status.behind}`}
          </span>
        )}
        <span
          className={`git-clean-badge ${status.isClean ? "git-clean" : "git-dirty"}`}
        >
          {status.isClean ? "Clean" : "Dirty"}
        </span>
      </div>

      {status.isClean ? (
        <div className="git-status-empty">Working tree clean</div>
      ) : (
        <>
          {stagedFiles.length > 0 && (
            <GitFileSection title="Staged Changes" files={stagedFiles} />
          )}
          {unstagedFiles.length > 0 && (
            <GitFileSection title="Changes" files={unstagedFiles} />
          )}
          {untrackedFiles.length > 0 && (
            <GitFileSection title="Untracked" files={untrackedFiles} />
          )}
        </>
      )}
    </div>
  );
}

function GitFileSection({
  title,
  files,
}: {
  title: string;
  files: GitFileChange[];
}) {
  return (
    <div className="git-file-section">
      <h3 className="git-file-section-title">
        {title} <span className="git-file-count">({files.length})</span>
      </h3>
      <ul className="git-file-list">
        {files.map((file) => (
          <li key={`${file.path}-${file.staged}`} className="git-file-item">
            <span
              className={`git-status-badge git-status-${file.status.toLowerCase()}`}
            >
              {file.status}
            </span>
            <span className="git-file-path">
              {file.origPath ? (
                <>
                  {file.origPath} → {file.path}
                </>
              ) : (
                file.path
              )}
            </span>
            {(file.linesAdded !== null || file.linesDeleted !== null) && (
              <span className="git-line-counts">
                {file.linesAdded !== null && (
                  <span className="git-lines-added">+{file.linesAdded}</span>
                )}
                {file.linesDeleted !== null && (
                  <span className="git-lines-deleted">
                    -{file.linesDeleted}
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
