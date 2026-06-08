/**
 * Global AI store — Zustand
 * Manages: AI provider config, shared semantic graph context,
 * model selection per task type, and offline queue.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIProvider, AIMessage } from '@/services/ai';
import type { SemanticGraph } from '@/engine/semanticEngine';
import { mergeGraphs, graphToContext } from '@/engine/semanticEngine';
import { useTripStore } from '@/store/useTripStore';

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
  chat: 'gemini-2.5-pro',
  itinerary: 'gemini-2.5-pro',
  extraction: 'gemini-2.5-pro',
  vision: 'gemini-2.5-pro',
  translation: 'gemini-2.5-pro',
};

export interface ChatSession {
  id: string;
  tripId: string;
  title: string;
  messages: AIMessage[];
  updatedAt: number;
  isPrivate?: boolean;
}


interface AIState {
  providerType: AIProvider['type'];
  apiKey: string;
  models: ModelConfig;
  localUrl: string;
  localModelName: string;

  tripGraph: SemanticGraph | null;
  
  privateChatSessions: Record<string, ChatSession>;
  
  isExtracting: boolean;
  isApiKeyInvalid: boolean;
  lastError: string | null;

  setProvider: (type: AIProvider['type']) => void;
  setApiKey: (key: string) => void;
  setApiKeyInvalid: (invalid: boolean) => void;
  setModel: (task: TaskType, model: string) => void;
  setLocalConfig: (url: string, modelName: string) => void;
  getProviderForTask: (task: TaskType) => AIProvider;
  getUnifiedContext: () => string;
  updateTripGraph: (patch: SemanticGraph) => void;
  clearTripGraph: () => void;
  
  createPrivateSession: (tripId: string, title?: string) => string;
  deletePrivateSession: (id: string) => void;
  updatePrivateSessionTitle: (id: string, title: string) => void;
  addMessageToPrivateSession: (id: string, message: AIMessage) => void;

  setExtracting: (val: boolean) => void;
  setError: (err: string | null) => void;
  setAllGeminiModels: (modelName: string) => void;
  fallbackAllModelsToFast: () => void;
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
      isExtracting: false,
      isApiKeyInvalid: false,
      tripGraph: null,
      privateChatSessions: {},
      lastError: null,

      setProvider: (type) => set({ providerType: type }),
      setApiKey: (key) => set({ apiKey: key, isApiKeyInvalid: false }),
      setApiKeyInvalid: (val) => set({ isApiKeyInvalid: val }),
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

      getUnifiedContext: () => {
        const { tripGraph } = get();
        const profile = useTripStore.getState().tripProfile;
        if (!profile) return '';
        let ctx = `[Global Trip Context]\n- Name: ${profile.name}\n- Destinations: ${profile.destinations.join(', ')}\n- Dates: ${profile.startDate} to ${profile.endDate}\n- Pace: ${profile.pace}\n- Budget: ${profile.budget} ${profile.currency}\n- Preferences: ${profile.preferences}\n`;
        if (profile.tripStyle && profile.tripStyle.length > 0) {
          ctx += `- Trip Styles: ${profile.tripStyle.join(', ')}\n`;
        }
        if (tripGraph && tripGraph.nodes.length > 0) {
           ctx += `\n[Semantic Memory / Constraints]\n${graphToContext(tripGraph)}\n`;
        }
        return ctx;
      },

      updateTripGraph: (patch) =>
        set((s) => ({
          tripGraph: s.tripGraph ? mergeGraphs(s.tripGraph, patch) : patch,
        })),

      clearTripGraph: () => set({ tripGraph: { ...EMPTY_GRAPH, extractedAt: new Date().toISOString() } }),
      
      createPrivateSession: (tripId, title = 'New Private Chat') => {
        const id = `priv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        set((s) => ({
          privateChatSessions: {
            ...s.privateChatSessions,
            [id]: { id, tripId, title, messages: [], updatedAt: Date.now(), isPrivate: true },
          }
        }));
        return id;
      },
      deletePrivateSession: (id) =>
        set((s) => {
          const newSessions = { ...s.privateChatSessions };
          delete newSessions[id];
          return { privateChatSessions: newSessions };
        }),
      updatePrivateSessionTitle: (id, title) =>
        set((s) => ({
          privateChatSessions: {
            ...s.privateChatSessions,
            [id]: { ...s.privateChatSessions[id], title, updatedAt: Date.now() },
          },
        })),
      addMessageToPrivateSession: (id, message) =>
        set((s) => {
          const session = s.privateChatSessions[id];
          if (!session) return s;
          return {
            privateChatSessions: {
              ...s.privateChatSessions,
              [id]: {
                ...session,
                messages: [...session.messages, message],
                updatedAt: Date.now(),
              },
            },
          };
        }),

      setExtracting: (val) => set({ isExtracting: val }),
      setError: (err) => set({ lastError: err }),
      setAllGeminiModels: (modelName) => set({
        models: {
          chat: modelName,
          itinerary: modelName,
          extraction: modelName,
          vision: modelName,
          translation: modelName,
        }
      }),
      fallbackAllModelsToFast: () => set({
        models: {
          chat: 'gemini-2.5-pro',
          itinerary: 'gemini-2.5-pro',
          extraction: 'gemini-2.5-pro',
          vision: 'gemini-2.5-pro',
          translation: 'gemini-2.5-pro',
        }
      }),
    }),
    {
      name: 'ai-store',
      storage: createJSONStorage(() => localStorage),
      // Never persist the API key to Zustand's default storage if you want extra caution
      // partialize: (s) => ({ ...s, apiKey: undefined })
    },
  ),
);
