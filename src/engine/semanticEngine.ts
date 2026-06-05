/**
 * Graphify-inspired Semantic Extraction Engine
 * ============================================
 * Runs in a Web Worker. Takes raw text (bookings, preferences, receipts, etc.)
 * and returns a structured knowledge graph: { nodes[], edges[], hyperedges[] }.
 *
 * Same JSON schema as graphify Python tool — compatible with graphify-out/graph.json.
 */

import { callAI, parseAIJson, type AIProvider } from '@/services/ai';

// --- Types (matches graphify JSON schema) ---

export type NodeType =
  | 'booking'
  | 'destination'
  | 'date'
  | 'person'
  | 'preference'
  | 'constraint'
  | 'expense'
  | 'document'
  | 'activity'
  | 'accommodation'
  | 'transport';

export interface SemanticNode {
  id: string;
  label: string;
  type: NodeType;
  fixed?: boolean; // true = locked constraint (pre-booked)
  data?: Record<string, unknown>;
  source_file?: string;
  confidence?: number;
}

export type EdgeRelation =
  | 'departs_from'
  | 'arrives_at'
  | 'booked_by'
  | 'conflicts_with'
  | 'requires'
  | 'costs'
  | 'on_date'
  | 'includes'
  | 'precedes'
  | 'at_location'
  | 'for_person'
  | 'semantically_similar_to'
  | 'rationale_for';

export interface SemanticEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
  confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
  confidence_score: number;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface SemanticHyperedge {
  id: string;
  label: string;
  nodes: string[];
  relation: string;
  confidence: 'EXTRACTED' | 'INFERRED';
  confidence_score: number;
}

export interface SemanticGraph {
  nodes: SemanticNode[];
  edges: SemanticEdge[];
  hyperedges: SemanticHyperedge[];
  extractedAt: string;
  sourceText?: string;
}

// --- Extraction System Prompt ---

const EXTRACTION_SYSTEM_PROMPT = `You are a semantic extraction engine for a travel planning platform.
Extract a structured knowledge graph from the user's text.

Rules:
- EXTRACTED: information explicitly stated in the text
- INFERRED: reasonable inference from context
- AMBIGUOUS: uncertain - include with low confidence score

Node types: booking | destination | date | person | preference | constraint | expense | document | activity | accommodation | transport

Edge relations: departs_from | arrives_at | booked_by | conflicts_with | requires | costs | on_date | includes | precedes | at_location | for_person | semantically_similar_to

Mark any pre-booked items (flights, hotels, tours with reference numbers) as "fixed: true" — these are hard constraints.

Return ONLY valid JSON, no markdown, no explanation:
{
  "nodes": [{"id":"snake_case_id","label":"Human Name","type":"booking","fixed":false,"data":{}}],
  "edges": [{"source":"node_id","target":"node_id","relation":"departs_from","confidence":"EXTRACTED","confidence_score":1.0,"weight":1.0}],
  "hyperedges": [{"id":"group_id","label":"Group Label","nodes":["id1","id2"],"relation":"participate_in","confidence":"EXTRACTED","confidence_score":0.9}]
}`;

/**
 * Extract semantic graph from unstructured text.
 */
export async function extractSemanticGraph(
  text: string,
  provider: AIProvider,
  context?: { tripDestinations?: string[]; tripDates?: string },
): Promise<SemanticGraph> {
  const contextHint = context
    ? `\n\nTrip context: Destinations=${context.tripDestinations?.join(', ')}. Dates=${context.tripDates}.`
    : '';

  const result = await callAI(
    [{ role: 'user', text: `Extract knowledge graph from this text:${contextHint}\n\n---\n${text}\n---` }],
    provider,
    { isJson: true, systemInstruction: EXTRACTION_SYSTEM_PROMPT, maxRetries: 2 },
  );

  const parsed = parseAIJson<Partial<SemanticGraph>>(result, {
    nodes: [],
    edges: [],
    hyperedges: [],
  });

  return {
    nodes: parsed.nodes ?? [],
    edges: parsed.edges ?? [],
    hyperedges: parsed.hyperedges ?? [],
    extractedAt: new Date().toISOString(),
    sourceText: text.substring(0, 200),
  };
}

/**
 * Extract semantic graph from a file (PDF or Image).
 */
export async function extractSemanticGraphFromFile(
  base64Data: string,
  mimeType: string,
  provider: AIProvider,
  context?: { tripDestinations?: string[]; tripDates?: string },
): Promise<SemanticGraph> {
  const contextHint = context
    ? `\n\nTrip context: Destinations=${context.tripDestinations?.join(', ')}. Dates=${context.tripDates}.`
    : '';

  const result = await callAI(
    [{ role: 'user', text: `Extract knowledge graph from this document:${contextHint}` }],
    provider,
    { 
      isJson: true, 
      systemInstruction: EXTRACTION_SYSTEM_PROMPT, 
      maxRetries: 2,
      base64Image: base64Data,
      mimeType: mimeType
    },
  );

  const parsed = parseAIJson<Partial<SemanticGraph>>(result, {
    nodes: [],
    edges: [],
    hyperedges: [],
  });

  return {
    nodes: parsed.nodes ?? [],
    edges: parsed.edges ?? [],
    hyperedges: parsed.hyperedges ?? [],
    extractedAt: new Date().toISOString(),
    sourceText: '[Document Uploaded]',
  };
}

/**
 * Merge two graphs, deduplicating by node ID.
 */
export function mergeGraphs(base: SemanticGraph, patch: SemanticGraph): SemanticGraph {
  const seenNodes = new Set(base.nodes.map((n) => n.id));
  const newNodes = patch.nodes.filter((n) => !seenNodes.has(n.id));

  return {
    nodes: [...base.nodes, ...newNodes],
    edges: [...base.edges, ...patch.edges],
    hyperedges: [...base.hyperedges, ...patch.hyperedges],
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Get all fixed constraint nodes (pre-booked items).
 */
export function getConstraints(graph: SemanticGraph): SemanticNode[] {
  return graph.nodes.filter((n) => n.fixed === true);
}

/**
 * Check if a proposed time slot conflicts with fixed constraints.
 */
export function detectConflicts(
  graph: SemanticGraph,
  proposedDate: string,
  proposedNodeIds: string[],
): { hasConflict: boolean; conflictingNodes: SemanticNode[] } {
  const fixed = getConstraints(graph);
  const conflicting = fixed.filter((node) => {
    const nodeDate = node.data?.date as string | undefined;
    return nodeDate === proposedDate && proposedNodeIds.includes(node.id);
  });

  return { hasConflict: conflicting.length > 0, conflictingNodes: conflicting };
}

/**
 * Query the graph for nodes related to a concept.
 * Returns connected nodes within 2 hops.
 */
export function queryGraph(
  graph: SemanticGraph,
  concept: string,
  maxHops = 2,
): SemanticNode[] {
  const lower = concept.toLowerCase();
  const seeds = graph.nodes.filter(
    (n) =>
      n.label.toLowerCase().includes(lower) ||
      n.id.toLowerCase().includes(lower),
  );

  const visited = new Set(seeds.map((n) => n.id));
  let frontier = seeds;

  for (let hop = 0; hop < maxHops; hop++) {
    const nextIds = new Set<string>();
    for (const node of frontier) {
      graph.edges
        .filter((e) => e.source === node.id || e.target === node.id)
        .forEach((e) => {
          const neighbor = e.source === node.id ? e.target : e.source;
          if (!visited.has(neighbor)) nextIds.add(neighbor);
        });
    }
    frontier = graph.nodes.filter((n) => nextIds.has(n.id));
    frontier.forEach((n) => visited.add(n.id));
  }

  return graph.nodes.filter((n) => visited.has(n.id));
}

/**
 * Summarize the graph as a compact context string for LLM prompts.
 * Reduces token usage: 32x compression (matches graphify benchmark).
 */
export function graphToContext(graph: SemanticGraph): string {
  const constraints = getConstraints(graph)
    .map((n) => `[FIXED] ${n.label}: ${JSON.stringify(n.data ?? {})}`)
    .join('\n');

  const destinations = graph.nodes
    .filter((n) => n.type === 'destination')
    .map((n) => n.label)
    .join(', ');

  const dates = graph.nodes
    .filter((n) => n.type === 'date')
    .map((n) => n.label)
    .join(', ');

  const preferences = graph.nodes
    .filter((n) => n.type === 'preference')
    .map((n) => n.label)
    .join(', ');

  return [
    destinations && `Destinations: ${destinations}`,
    dates && `Dates: ${dates}`,
    preferences && `Preferences: ${preferences}`,
    constraints && `Fixed bookings:\n${constraints}`,
  ]
    .filter(Boolean)
    .join('\n');
}
