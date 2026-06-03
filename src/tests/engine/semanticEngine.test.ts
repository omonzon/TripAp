/**
 * Tests for the Graphify-inspired Semantic Engine
 * ================================================
 * These tests run without any LLM calls — they test the
 * pure graph manipulation logic (merge, conflict detection, query).
 */

import { describe, it, expect } from 'vitest';
import {
  mergeGraphs,
  detectConflicts,
  getConstraints,
  queryGraph,
  graphToContext,
  type SemanticGraph,
  type SemanticNode,
} from '@/engine/semanticEngine';
import { parseAIJson } from '@/services/ai';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const flightNode: SemanticNode = {
  id: 'flight_tlv_ams',
  label: 'Flight TLV → AMS',
  type: 'booking',
  fixed: true,
  data: { date: '2025-07-15', departure: '13:25', from: 'TLV', to: 'AMS' },
};

const hotelNode: SemanticNode = {
  id: 'hotel_amsterdam',
  label: 'Hotel Amsterdam',
  type: 'accommodation',
  fixed: true,
  data: { date: '2025-07-15', checkIn: '15:00' },
};

const activityNode: SemanticNode = {
  id: 'canal_cruise',
  label: 'Canal Cruise',
  type: 'activity',
  fixed: false,
  data: { date: '2025-07-15' },
};

const destinationNode: SemanticNode = {
  id: 'dest_amsterdam',
  label: 'Amsterdam',
  type: 'destination',
};

const preferenceNode: SemanticNode = {
  id: 'pref_kosher',
  label: 'Kosher food preferred',
  type: 'preference',
};

const baseGraph: SemanticGraph = {
  nodes: [flightNode, hotelNode, destinationNode],
  edges: [
    {
      source: 'flight_tlv_ams',
      target: 'dest_amsterdam',
      relation: 'arrives_at',
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      weight: 1.0,
    },
  ],
  hyperedges: [],
  extractedAt: '2025-01-01T00:00:00Z',
};

const patchGraph: SemanticGraph = {
  nodes: [activityNode, preferenceNode],
  edges: [
    {
      source: 'canal_cruise',
      target: 'dest_amsterdam',
      relation: 'at_location',
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      weight: 1.0,
    },
  ],
  hyperedges: [
    {
      id: 'amsterdam_activities',
      label: 'Amsterdam Activities',
      nodes: ['canal_cruise', 'dest_amsterdam'],
      relation: 'participate_in',
      confidence: 'INFERRED',
      confidence_score: 0.9,
    },
  ],
  extractedAt: '2025-01-01T01:00:00Z',
};

// ---------------------------------------------------------------------------
// mergeGraphs
// ---------------------------------------------------------------------------

describe('mergeGraphs', () => {
  it('merges nodes from both graphs without duplication', () => {
    const merged = mergeGraphs(baseGraph, patchGraph);
    expect(merged.nodes).toHaveLength(5); // 3 base + 2 patch
    expect(merged.nodes.map((n) => n.id)).toContain('flight_tlv_ams');
    expect(merged.nodes.map((n) => n.id)).toContain('canal_cruise');
  });

  it('does not duplicate nodes that appear in both graphs', () => {
    const graphWithDup: SemanticGraph = {
      ...patchGraph,
      nodes: [...patchGraph.nodes, { ...destinationNode }], // duplicate from base
    };
    const merged = mergeGraphs(baseGraph, graphWithDup);
    const destCount = merged.nodes.filter((n) => n.id === 'dest_amsterdam').length;
    expect(destCount).toBe(1);
  });

  it('merges all edges from both graphs', () => {
    const merged = mergeGraphs(baseGraph, patchGraph);
    expect(merged.edges).toHaveLength(2);
  });

  it('merges hyperedges', () => {
    const merged = mergeGraphs(baseGraph, patchGraph);
    expect(merged.hyperedges).toHaveLength(1);
    expect(merged.hyperedges[0].id).toBe('amsterdam_activities');
  });

  it('updates extractedAt timestamp', () => {
    const merged = mergeGraphs(baseGraph, patchGraph);
    expect(new Date(merged.extractedAt).getTime()).toBeGreaterThan(
      new Date(baseGraph.extractedAt).getTime(),
    );
  });
});

// ---------------------------------------------------------------------------
// getConstraints
// ---------------------------------------------------------------------------

describe('getConstraints', () => {
  it('returns only fixed=true nodes', () => {
    const merged = mergeGraphs(baseGraph, patchGraph);
    const constraints = getConstraints(merged);
    expect(constraints).toHaveLength(2);
    expect(constraints.every((n) => n.fixed === true)).toBe(true);
  });

  it('returns empty array when no fixed nodes', () => {
    const emptyGraph: SemanticGraph = {
      nodes: [activityNode, preferenceNode],
      edges: [],
      hyperedges: [],
      extractedAt: '',
    };
    expect(getConstraints(emptyGraph)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// detectConflicts
// ---------------------------------------------------------------------------

describe('detectConflicts', () => {
  it('detects conflict when proposed node overlaps a fixed constraint on same date', () => {
    const result = detectConflicts(
      baseGraph,
      '2025-07-15',
      ['flight_tlv_ams', 'some_other_activity'],
    );
    expect(result.hasConflict).toBe(true);
    expect(result.conflictingNodes).toHaveLength(1);
    expect(result.conflictingNodes[0].id).toBe('flight_tlv_ams');
  });

  it('returns no conflict when proposed date is different', () => {
    const result = detectConflicts(baseGraph, '2025-07-20', ['flight_tlv_ams']);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictingNodes).toHaveLength(0);
  });

  it('returns no conflict when proposed node IDs do not match fixed constraints', () => {
    const result = detectConflicts(baseGraph, '2025-07-15', ['completely_different_id']);
    expect(result.hasConflict).toBe(false);
  });

  it('flags multiple conflicts on same date', () => {
    const result = detectConflicts(
      baseGraph,
      '2025-07-15',
      ['flight_tlv_ams', 'hotel_amsterdam'],
    );
    expect(result.conflictingNodes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// queryGraph
// ---------------------------------------------------------------------------

describe('queryGraph', () => {
  const fullGraph = mergeGraphs(baseGraph, patchGraph);

  it('finds nodes whose label matches the query', () => {
    const results = queryGraph(fullGraph, 'amsterdam');
    expect(results.some((n) => n.id === 'dest_amsterdam')).toBe(true);
  });

  it('finds connected neighbor nodes within maxHops', () => {
    // canal_cruise connects to dest_amsterdam; query amsterdam should also pull canal_cruise
    const results = queryGraph(fullGraph, 'amsterdam', 2);
    expect(results.some((n) => n.id === 'canal_cruise')).toBe(true);
  });

  it('returns empty array for unrecognized concept', () => {
    const results = queryGraph(fullGraph, 'completely_unknown_xyz_concept');
    expect(results).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const lower = queryGraph(fullGraph, 'amsterdam');
    const upper = queryGraph(fullGraph, 'AMSTERDAM');
    expect(lower.map((n) => n.id).sort()).toEqual(upper.map((n) => n.id).sort());
  });
});

// ---------------------------------------------------------------------------
// graphToContext
// ---------------------------------------------------------------------------

describe('graphToContext', () => {
  it('includes destination names', () => {
    const ctx = graphToContext(baseGraph);
    expect(ctx).toContain('Amsterdam');
  });

  it('includes fixed booking labels', () => {
    const ctx = graphToContext(baseGraph);
    expect(ctx).toContain('[FIXED]');
    expect(ctx).toContain('Flight TLV');
  });

  it('includes preferences when present', () => {
    const graphWithPref = mergeGraphs(baseGraph, {
      ...patchGraph,
      nodes: [preferenceNode],
    });
    const ctx = graphToContext(graphWithPref);
    expect(ctx).toContain('Kosher');
  });

  it('returns a compact string much shorter than raw JSON', () => {
    const ctx = graphToContext(baseGraph);
    const rawJson = JSON.stringify(baseGraph);
    expect(ctx.length).toBeLessThan(rawJson.length);
  });
});

// ---------------------------------------------------------------------------
// parseAIJson (from ai service)
// ---------------------------------------------------------------------------

describe('parseAIJson', () => {
  it('parses clean JSON', () => {
    const result = parseAIJson<{ x: number }>('{ "x": 42 }', { x: 0 });
    expect(result.x).toBe(42);
  });

  it('strips markdown fences before parsing', () => {
    const result = parseAIJson<{ x: number }>('```json\n{"x": 99}\n```', { x: 0 });
    expect(result.x).toBe(99);
  });

  it('returns fallback on invalid JSON', () => {
    const result = parseAIJson<{ x: number }>('not json', { x: -1 });
    expect(result.x).toBe(-1);
  });

  it('strips plain code fences (no language specifier)', () => {
    const result = parseAIJson<{ name: string }>('```\n{"name": "test"}\n```', { name: '' });
    expect(result.name).toBe('test');
  });
});
