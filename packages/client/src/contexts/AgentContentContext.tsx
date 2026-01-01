import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { api } from "../api/client";
import type { AgentContent, AgentContentMap } from "../hooks/useSession";
import type { Message } from "../types";

interface AgentContentContextValue {
  /** Map of agentId → agent content (messages + status) */
  agentContent: AgentContentMap;
  /** Mapping from Task tool_use_id → agentId (for rendering during streaming) */
  toolUseToAgent: Map<string, string>;
  /** Load agent content from server (for lazy-loading completed tasks) */
  loadAgentContent: (
    projectId: string,
    sessionId: string,
    agentId: string,
  ) => Promise<AgentContent>;
  /** Check if content is currently being loaded for an agent */
  isLoading: (agentId: string) => boolean;
  /** The current project ID */
  projectId: string;
}

export const AgentContentContext =
  createContext<AgentContentContextValue | null>(null);

interface AgentContentProviderProps {
  children: ReactNode;
  /** Live agentContent from useSession (for streaming updates) */
  agentContent: AgentContentMap;
  /** Update agentContent state (for merging loaded content) */
  setAgentContent: React.Dispatch<React.SetStateAction<AgentContentMap>>;
  /** Mapping from Task tool_use_id → agentId (for rendering during streaming) */
  toolUseToAgent: Map<string, string>;
  projectId: string;
  sessionId: string;
}

export function AgentContentProvider({
  children,
  agentContent,
  setAgentContent,
  toolUseToAgent,
  projectId,
  sessionId,
}: AgentContentProviderProps) {
  const [loadingAgents, setLoadingAgents] = useState<Set<string>>(new Set());

  const loadAgentContent = useCallback(
    async (
      loadProjectId: string,
      loadSessionId: string,
      agentId: string,
    ): Promise<AgentContent> => {
      // Check if already loaded
      const existing = agentContent[agentId];
      if (existing && existing.messages.length > 0) {
        return existing;
      }

      // Check if already loading
      if (loadingAgents.has(agentId)) {
        // Wait for existing load to complete
        return new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            const current = agentContent[agentId];
            if (current && current.messages.length > 0) {
              clearInterval(checkInterval);
              resolve(current);
            }
          }, 100);
          // Timeout after 30 seconds
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve({ messages: [], status: "pending" });
          }, 30000);
        });
      }

      // Start loading
      setLoadingAgents((prev) => new Set(prev).add(agentId));

      try {
        const data = await api.getAgentSession(
          loadProjectId,
          loadSessionId,
          agentId,
        );

        const content: AgentContent = {
          messages: data.messages,
          status: data.status,
        };

        // Merge into agentContent state
        setAgentContent((prev) => ({
          ...prev,
          [agentId]: content,
        }));

        return content;
      } catch (error) {
        console.error(`Failed to load agent content for ${agentId}:`, error);
        return { messages: [], status: "failed" };
      } finally {
        setLoadingAgents((prev) => {
          const next = new Set(prev);
          next.delete(agentId);
          return next;
        });
      }
    },
    [agentContent, loadingAgents, setAgentContent],
  );

  const isLoading = useCallback(
    (agentId: string) => loadingAgents.has(agentId),
    [loadingAgents],
  );

  const value: AgentContentContextValue = {
    agentContent,
    toolUseToAgent,
    loadAgentContent,
    isLoading,
    projectId,
  };

  return (
    <AgentContentContext.Provider value={value}>
      {children}
    </AgentContentContext.Provider>
  );
}

/**
 * Hook to access agent content context.
 * Provides access to subagent messages and lazy-loading functionality.
 */
export function useAgentContent() {
  const context = useContext(AgentContentContext);
  if (!context) {
    throw new Error(
      "useAgentContent must be used within an AgentContentProvider",
    );
  }
  return context;
}

/**
 * Hook to get agent content for a specific agentId.
 * Returns null if context is not available (graceful degradation).
 */
export function useAgentContentOptional(agentId: string | undefined): {
  content: AgentContent | undefined;
  isLoading: boolean;
  load: () => Promise<void>;
} | null {
  const context = useContext(AgentContentContext);
  if (!context || !agentId) {
    return null;
  }

  return {
    content: context.agentContent[agentId],
    isLoading: context.isLoading(agentId),
    load: async () => {
      // Note: projectId and sessionId are captured from provider
      // This is a simplified interface for components
    },
  };
}
