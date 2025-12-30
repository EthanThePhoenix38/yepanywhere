import { Link } from "react-router-dom";
import { useProjects } from "../hooks/useProjects";

function formatActiveCount(owned: number, external: number): string {
  const parts: string[] = [];
  if (owned > 0) parts.push(`${owned} active`);
  if (external > 0) parts.push(`${external} active external`);
  return parts.join(", ");
}

export function ProjectsPage() {
  const { projects, loading, error } = useProjects();

  if (loading) return <div className="loading">Loading projects...</div>;
  if (error) return <div className="error">Error: {error.message}</div>;

  return (
    <div className="page">
      <h1>Projects</h1>
      {projects.length === 0 ? (
        <p>No projects found in ~/.claude/projects</p>
      ) : (
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <Link to={`/projects/${project.id}`}>
                <strong>{project.name}</strong>
                <span className="meta">
                  {project.sessionCount} sessions
                  {(project.activeOwnedCount > 0 ||
                    project.activeExternalCount > 0) && (
                    <span className="active-indicator">
                      {" "}
                      (
                      {formatActiveCount(
                        project.activeOwnedCount,
                        project.activeExternalCount,
                      )}
                      )
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
