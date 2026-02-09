// Azure DevOps Work Item Tracking API types

/**
 * Work item relation (link to another work item).
 */
export interface WorkItemRelation {
  rel: string;
  url: string;
}

/**
 * Work item from ADO API.
 */
export interface WorkItem {
  id: number;
  url: string;
  fields: Record<string, any>;
  relations?: WorkItemRelation[];
}

/**
 * ADO context for a test case.
 */
export interface AdoContext {
  testId: number;
  testCase: {
    id: number;
    url: string;
    fields: Record<string, any>;
    relations?: WorkItemRelation[];
  };
  parent: {
    id: number;
    type: string;
    title: string;
    acceptanceCriteria: string | null;
    description: string | null;
    url: string;
  } | null;
  warning?: string;
  fetchedAt: string;
}
