import { appApi, withSubscriptionDefaults } from './appApi';
import { getApiErrorMessage } from './baseQuery';
import type {
  LearnVocabularyAIRule,
  LearnVocabularyAIRuleResult,
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
    learnVocabularyAIRule: builder.mutation<LearnVocabularyAIRuleResult, LearnVocabularyAIRule>({
      query: body => ({ url: '/admin/vocabulary-ai-guidance/rules', method: 'POST', body }),
      invalidatesTags: (result, error) => (error ? [] : ['VocabularyAIGuidance']),
    }),
    forgetVocabularyAIRule: builder.mutation<VocabularyAIGuidanceSettings, string>({
      query: id => ({ url: `/admin/vocabulary-ai-guidance/rules/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: (result, error) => (error ? [] : ['VocabularyAIGuidance']),
    }),
  }),
});

export const useGetVocabularyAIGuidanceQuery = withSubscriptionDefaults(
  vocabularyAIGuidanceApi.useGetVocabularyAIGuidanceQuery,
  { refetchOnFocus: false, refetchOnReconnect: false, refetchOnMountOrArgChange: true }
);
export const {
  useSaveVocabularyAIGuidanceMutation,
  useLearnVocabularyAIRuleMutation,
  useForgetVocabularyAIRuleMutation,
} = vocabularyAIGuidanceApi;

/** How the word editor saves the rules the AI learns; supplied by the page, so the editor needs no store. */
export interface LearnedAIRules {
  learn: (rule: LearnVocabularyAIRule) => Promise<LearnVocabularyAIRuleResult>;
  forget: (id: string) => Promise<unknown>;
}

/** Failures arrive as errors carrying the server's explanation, such as the rule limit being reached. */
export function useLearnedAIRules(): LearnedAIRules {
  const [learn] = useLearnVocabularyAIRuleMutation();
  const [forget] = useForgetVocabularyAIRuleMutation();
  const failure = (fallback: string) => (error: unknown) => {
    throw new Error(getApiErrorMessage(error, fallback));
  };
  return {
    learn: rule => learn(rule).unwrap().catch(failure('The rule could not be saved.')),
    forget: id => forget(id).unwrap().catch(failure('The rule could not be removed.')),
  };
}
