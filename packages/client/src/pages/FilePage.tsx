import { Link, useParams, useSearchParams } from "react-router-dom";
import { FileViewer } from "../components/FileViewer";

/**
 * FilePage - Standalone page for viewing files.
 * Route: /projects/:projectId/file?path=<path>
 */
export function FilePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const filePath = searchParams.get("path");

  if (!projectId) {
    return (
      <div className="file-page file-page-error">
        <div className="file-page-error-content">
          <h1>Invalid URL</h1>
          <p>Project ID is missing from the URL.</p>
          <Link to="/projects" className="file-page-back-link">
            Go to Projects
          </Link>
        </div>
      </div>
    );
  }

  if (!filePath) {
    return (
      <div className="file-page file-page-error">
        <div className="file-page-error-content">
          <h1>Invalid URL</h1>
          <p>File path is missing from the URL.</p>
          <Link to={`/projects/${projectId}`} className="file-page-back-link">
            Go to Project
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="file-page">
      <div className="file-page-nav">
        <Link
          to={`/projects/${projectId}`}
          className="file-page-back-link"
          title="Back to project"
        >
          <BackIcon />
          <span>Back to project</span>
        </Link>
      </div>
      <div className="file-page-content">
        <FileViewer projectId={projectId} filePath={filePath} standalone />
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 12L6 8l4-4" />
    </svg>
  );
}
