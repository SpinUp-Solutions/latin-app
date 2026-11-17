import { appApi, withSubscriptionDefaults } from './appApi';
import type {
  SaveVocabularyAIGuidance,
  VocabularyAIGuidanceSettings,
} from '@/shared/types/vocabulary/ai-guidance-settings';

export const vocabularyAIGuidanceApi = appApi.injectEndpoints({
  endpoints: builder => ({
    getVocabularyAIGuidance: builder.query<VocabularyAIGuidanceSettings, void>({
      query: () => '/admin/vocabulary-ai-guidance',
      providesTags: ['VocabularyAIGuidance'],
    }),
    saveVocabularyAIGuidance: builder.mutation<VocabularyAIGuidanceSettings, SaveVocabularyAIGuidance>({
      query: body => ({ url: '/admin/vocabulary-ai-guidance', method: 'PUT', body }),
      invalidatesTags: (result, error) => (error ? [] : ['VocabularyAIGuidance']),
    }),
  }),
});

export const useGetVocabularyAIGuidanceQuery = withSubscriptionDefaults(
  vocabularyAIGuidanceApi.useGetVocabularyAIGuidanceQuery,
  { refetchOnFocus: false, refetchOnReconnect: false, refetchOnMountOrArgChange: true }
);
export const { useSaveVocabularyAIGuidanceMutation } = vocabularyAIGuidanceApi;
