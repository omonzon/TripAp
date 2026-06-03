/**
 * Global AI store — Zustand
 * Manages: AI provider config, shared semantic graph context,
 * model selection per task type, and offline queue.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIProvider } from '@/services/ai';
import type { SemanticGraph } from '@/engine/semanticEngine';
import { mergeGraphs } from '@/engine/semanticEngine';

// Task types mapped to different models for cost/speed optimization
export type TaskType = 'chat' | 'itinerary' | 'extraction' | 'vision' | 'translation';

export interface ModelConfig {
  chat: string;
  itinerary: string;
  extraction: string;
  vision: string;
  translation: string;
}

const DEFAULT_GEMINI_MODELS: ModelConfig = {
  chat: 'gemini-2.0-flash',
  itinerary: 'gemini-2.5-pro',
  extraction: 'gemini-2.5-pro',
  vision: 'gemini-2.0-flash',
  translation: 'gemini-2.0-flash',
};

interface AIState {
  // Provider config (stored locally, never in Firestore)
  providerType: AIProvider['type'];
  apiKey: string;
  models: ModelConfig;
  localUrl: string;
  localModelName: string;

  // Shared semantic knowledge graph (trip context)
  tripGraph: SemanticGraph | null;

  // Loading states
  isExtracting: boolean;
  lastError: string | null;

  // Actions
  setProvider: (type: AIProvider['type']) => void;
  setApiKey: (key: string) => void;
  setModel: (task: TaskType, model: string) => void;
  setLocalConfig: (url: string, modelName: string) => void;
  getProviderForTask: (task: TaskType) => AIProvider;
  updateTripGraph: (patch: SemanticGraph) => void;
  clearTripGraph: () => void;
  setExtracting: (val: boolean) => void;
  setError: (err: string | null) => void;
}

const EMPTY_GRAPH: SemanticGraph = {
  nodes: [],
  edges: [],
  hyperedges: [],
  extractedAt: new Date().toISOString(),
};

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      providerType: 'gemini',
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '', // placeholder; users override in settings
      models: DEFAULT_GEMINI_MODELS,
      localUrl: 'http://127.0.0.1:11434/api/generate',
      localModelName: 'gemma2',
      tripGraph: null,
      isExtracting: false,
      lastError: null,

      setProvider: (type) => set({ providerType: type }),
      setApiKey: (key) => set({ apiKey: key }),
      setModel: (task, model) =>
        set((s) => ({ models: { ...s.models, [task]: model } })),
      setLocalConfig: (url, modelName) =>
        set({ localUrl: url, localModelName: modelName }),

      getProviderForTask: (task: TaskType): AIProvider => {
        const { providerType, apiKey, models, localUrl, localModelName } = get();
        if (providerType === 'ollama') {
          return { type: 'ollama', model: localModelName, localUrl };
        }
        return { type: providerType, apiKey, model: models[task] };
      },

      updateTripGraph: (patch) =>
        set((s) => ({
          tripGraph: s.tripGraph ? mergeGraphs(s.tripGraph, patch) : patch,
        })),

      clearTripGraph: () => set({ tripGraph: { ...EMPTY_GRAPH, extractedAt: new Date().toISOString() } }),
      setExtracting: (val) => set({ isExtracting: val }),
      setError: (err) => set({ lastError: err }),
    }),
    {
      name: 'ai-store',
      storage: createJSONStorage(() => localStorage),
      // Never persist the API key to Zustand's default storage if you want extra caution
      // partialize: (s) => ({ ...s, apiKey: undefined })
    },
  ),
);
