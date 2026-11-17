import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';
import {
  applyFormValuesToWord,
  toFormDefaultValues,
  VocabularyFormSchema,
} from '@/src/types/vocabulary/form-schemas/builder';
import type { VocabularyWordWithId } from '@/shared/types/vocabulary/schemas';
import type { VocabularyAIReply } from '@/shared/types/vocabulary/ai-review';
import type { LearnedAIRules } from '@/src/store/api/vocabularyAIGuidanceApi';
import { getPronounTableSchema } from '@/src/components/ui/admin/vocabulary/wordTables';
import { buildEmptyFromSchema } from '@/src/utils/schema-defaults';

const mockCallable = jest.fn();
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(), httpsCallable: () => mockCallable }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const question = {
  field: 'etymology' as const,
  question: 'Is rosa native Latin or a loan from Greek?',
  explanation: 'I wrote a native derivation, but rosa looks like Greek rhódon.',
  options: ['It is a loan from Greek rhódon.', 'It is native Latin.'],
};
const row = (singular: string[] | null, plural: string[] | null) => ({ singular, plural });
const noun: VocabularyWordWithId = {
  id: 'rosa',
  word: 'rosa',
  part_of_speech: 'noun',
  translation: 'rose',
  definitions: ['rose'],
  etymology: 'An uncertain derivation',
  pronunciation: null,
  type: 'core',
  alternate_form: null,
  dictionary_entry: 'rosa, rosae',
  sort_key: 'rosa',
  random_index: 0.5,
  createdAt: 'x',
  updatedAt: 'x',
  gender: 'feminine',
  declension: '1',
  nominative_singular: null,
  genitive_singular: null,
  ai_review: { uncertainties: [question], guidance: [] },
  declension_table: {
    nominative: row(['rosa'], ['rosae']),
    genitive: row(['rosae'], ['rosārum']),
    dative: row(['rosae'], ['rosīs']),
    accusative: row(['rosam'], ['rosās']),
    ablative: row(['rosā'], ['rosīs']),
    vocative: row(['rosa'], ['rosae']),
    locative: row(null, null),
  },
};

const cloneNoun = () => JSON.parse(JSON.stringify(noun)) as VocabularyWordWithId;
/** The callable's answer to an autocomplete request. */
const answer = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  data: { success: true, uncertainties: [], data, ...extra },
});
/** The callable's answer to a message in the conversation. */
const reply = (data: Record<string, unknown>, said: Partial<VocabularyAIReply> = {}) => ({
  data: {
    success: true,
    uncertainties: [],
    data: { part_of_speech: 'noun', ...data },
    reply: { message: 'Done.', answered: [], remember: [], rule: null, ...said },
  },
});
const assistant = () => screen.getByRole('region', { name: 'AI assistant' });
const questionCard = (label: string) => screen.queryByRole('group', { name: `AI question about ${label}` });
const composer = () => screen.getByLabelText('Message to the AI');
const say = (text: string) => {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to the AI' }));
};
const saveWord = async (save: jest.Mock) => {
  fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  return save.mock.calls.at(-1)![0];
};
const pending = () => {
  let finish!: (value: unknown) => void;
  mockCallable.mockReturnValueOnce(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  return (value: unknown) => act(async () => finish(value));
};
const learnedRules = () => ({
  learn: jest.fn<ReturnType<LearnedAIRules['learn']>, Parameters<LearnedAIRules['learn']>>(async rule => ({
    settings: { revision: 1, rules: [], updatedAt: null, updatedBy: null },
    rule: { id: 'rule-1', ...rule },
    added: true,
  })),
  forget: jest.fn(async () => ({})),
});

beforeEach(() => {
  jest.clearAllMocks();
  let uuid = 0;
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `note-${++uuid}` });
});

it('asks its questions in one place, with what it is unsure of, the current value and answers to pick', () => {
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  expect(
    within(assistant()).getByText(
      "I'm not sure about one thing in rosa. Pick a suggested answer, or reply in your own words."
    )
  ).toBeInTheDocument();
  const card = questionCard('Etymology')!;
  expect(within(card).getByText(question.question)).toBeInTheDocument();
  expect(within(card).getByText(question.explanation)).toBeInTheDocument();
  expect(within(card).getByText('An uncertain derivation')).toBeInTheDocument();
  for (const option of question.options) expect(within(card).getByRole('button', { name: option })).toBeInTheDocument();

  // The field the AI asked about links back to the question; other fields carry no marker.
  expect(screen.queryByRole('button', { name: 'AI question about Translation' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'AI question about Etymology' }));
  expect(composer()).toHaveFocus();
});

it('turns a picked answer into a reply in words with the change under it, applied only on Accept', async () => {
  const onSave = jest.fn(async () => true);
  mockCallable.mockResolvedValue(
    reply(
      { etymology: 'Borrowed from Greek rhódon.' },
      {
        message: 'I rewrote the etymology as a loan from Greek.',
        answered: ['etymology'],
        remember: [{ field: 'etymology', note: 'rosa is a loan from Greek rhódon.' }],
      }
    )
  );
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);

  fireEvent.click(within(questionCard('Etymology')!).getByRole('button', { name: question.options[0] }));
  expect(composer()).toHaveValue('Etymology: It is a loan from Greek rhódon.');
  expect(composer()).toHaveFocus();
  fireEvent.keyDown(composer(), { key: 'Enter' });

  expect(within(assistant()).getByText('Etymology: It is a loan from Greek rhódon.')).toBeInTheDocument();
  expect(await screen.findByText('I rewrote the etymology as a loan from Greek.')).toBeInTheDocument();
  expect(mockCallable).toHaveBeenCalledWith({
    word: 'rosa',
    part_of_speech: 'noun',
    existingData: expect.objectContaining({ ai_review: noun.ai_review, declension_table: noun.declension_table }),
    conversation: { message: 'Etymology: It is a loan from Greek rhódon.', history: [] },
  });
  expect(composer()).toHaveValue('');
  const changes = screen.getByRole('list', { name: 'Proposed changes' });
  expect(within(changes).getByText('An uncertain derivation')).toBeInTheDocument();
  expect(within(changes).getByText('Borrowed from Greek rhódon.')).toBeInTheDocument();
  expect(screen.getByText('rosa is a loan from Greek rhódon.')).toBeInTheDocument();
  // Proposed, not applied: the field keeps its value until the admin accepts.
  expect(screen.getByLabelText('Etymology')).toHaveValue('An uncertain derivation');

  fireEvent.click(screen.getByRole('button', { name: 'Accept change' }));
  expect(screen.getByLabelText('Etymology')).toHaveValue('Borrowed from Greek rhódon.');
  expect(questionCard('Etymology')).toBeNull();
  expect(screen.queryByRole('button', { name: 'AI question about Etymology' })).toBeNull();
  expect(within(assistant()).getByText('Accepted')).toBeInTheDocument();
  expect(toast.success).toHaveBeenCalledWith('Updated Etymology. Save the word with Apply to keep it.');
  const memory = screen.getByRole('list', { name: 'What the AI remembers about rosa' });
  expect(within(memory).getByText('rosa is a loan from Greek rhódon.')).toBeInTheDocument();

  const payload = await saveWord(onSave);
  expect(payload.etymology).toBe('Borrowed from Greek rhódon.');
  expect(payload.translation).toBe('rose');
  expect(payload.ai_review).toEqual({
    uncertainties: [],
    guidance: [{ id: 'note-1', instruction: 'rosa is a loan from Greek rhódon.', field: 'etymology' }],
  });
  const savedWord = { ...payload, id: noun.id } as VocabularyWordWithId;
  const roundtrip = applyFormValuesToWord(savedWord, VocabularyFormSchema.parse(toFormDefaultValues(savedWord)));
  expect(roundtrip.ai_review).toEqual(payload.ai_review);
});

it('keeps a value without asking the AI and remembers that an admin confirmed it', async () => {
  const onSave = jest.fn(async () => true);
  const word = cloneNoun();
  // The second question was saved before questions had their own text, so its explanation is the question.
  word.ai_review = { uncertainties: [question, { field: 'gender', explanation: 'Could be masculine.' }], guidance: [] };
  render(<WordEditPanel word={word} onSave={onSave} updating={false} />);

  fireEvent.click(within(questionCard('Etymology')!).getByRole('button', { name: 'Keep as is' }));
  expect(questionCard('Etymology')).toBeNull();
  expect(screen.getByText('You kept Etymology as it is.')).toBeInTheDocument();
  const gender = questionCard('Gender')!;
  expect(within(gender).getByText('Could be masculine.')).toBeInTheDocument();
  expect(within(gender).getByText('feminine')).toBeInTheDocument();
  fireEvent.click(within(gender).getByRole('button', { name: 'Keep as is' }));

  expect(mockCallable).not.toHaveBeenCalled();
  expect((await saveWord(onSave)).ai_review).toEqual({
    uncertainties: [],
    guidance: [
      {
        id: 'note-1',
        field: 'etymology',
        instruction: `When asked “${question.question}”, an admin confirmed the current value.`,
      },
      { id: 'note-2', field: 'gender', instruction: 'An admin confirmed the current value.' },
    ],
  });
});

it('replaces a whole table, listing only the changed cells, and keeps other unsaved edits', async () => {
  const word = cloneNoun();
  word.ai_review = {
    uncertainties: [
      { field: 'declension_table', question: 'Is the accusative singular used?', explanation: 'Check it.' },
    ],
    guidance: [],
  };
  const proposed = { ...noun.declension_table, accusative: row(null, ['rosās']) };
  mockCallable.mockResolvedValue(
    reply({ declension_table: proposed }, { message: 'I left that cell empty.', answered: ['declension_table'] })
  );
  const onSave = jest.fn(async () => true);
  render(<WordEditPanel word={word} onSave={onSave} updating={false} />);

  fireEvent.doubleClick(screen.getByText('rosam'));
  fireEvent.change(screen.getByPlaceholderText('Enter value...'), { target: { value: 'manual form' } });
  fireEvent.keyDown(screen.getByPlaceholderText('Enter value...'), { key: 'Enter' });
  fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'edited rose' } });
  say('The accusative singular is not used.');

  await screen.findByText('I left that cell empty.');
  expect(mockCallable.mock.calls[0][0].existingData.declension_table.accusative.singular).toEqual(['manual form']);
  expect(screen.getByText('1 cell changes')).toBeInTheDocument();
  expect(screen.getByText('accusative · singular')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Accept change' }));
  const payload = await saveWord(onSave);
  expect(payload.declension_table.accusative.singular).toBeNull();
  expect(payload.translation).toBe('edited rose');
  expect(payload.ai_review.uncertainties).toEqual([]);
});

it('skips a change to a field the admin edited after asking, applies the rest, and keeps that question open', async () => {
  const finish = pending();
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  say('Fix the etymology and the pronunciation.');
  fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'another field' } });
  fireEvent.change(screen.getByLabelText('Etymology'), { target: { value: 'typed by the admin' } });
  await finish(
    reply(
      { etymology: 'From Greek rhódon.', pronunciation: 'RO-sa' },
      { message: 'Both fixed.', answered: ['etymology'] }
    )
  );

  expect(
    screen.getByText('You edited Etymology after asking, so this change will not be applied. Ask again to update it.')
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Accept change' }));
  expect(screen.getByText('Not applied, because you had edited this field.')).toBeInTheDocument();
  expect(screen.getByLabelText('Etymology')).toHaveValue('typed by the admin');
  expect(screen.getByLabelText('Pronunciation')).toHaveValue('RO-sa');
  expect(screen.getByLabelText('Translation')).toHaveValue('another field');
  expect(questionCard('Etymology')).not.toBeNull();
});

it('follows up in the same conversation, and a newer answer replaces one not yet accepted', async () => {
  mockCallable
    .mockResolvedValueOnce(reply({ etymology: 'From Greek.' }, { message: 'I rewrote it as Greek.' }))
    .mockResolvedValueOnce(
      reply({ etymology: 'From Greek rhódon, through Etruscan.' }, { message: 'I added the Etruscan step.' })
    );
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  say('It is Greek.');
  await screen.findByText('I rewrote it as Greek.');
  say('Not quite: it came through Etruscan.');
  await screen.findByText('I added the Etruscan step.');

  expect(mockCallable.mock.calls[1][0].conversation).toEqual({
    message: 'Not quite: it came through Etruscan.',
    history: [
      { from: 'admin', text: 'It is Greek.' },
      { from: 'ai', text: 'I rewrote it as Greek.' },
    ],
  });
  expect(screen.getByText('Replaced by a newer answer')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Accept change' })).toHaveLength(1);
});

it('can be asked anything when it has no questions, and answers without proposing a change', async () => {
  const word = cloneNoun();
  delete word.ai_review;
  mockCallable.mockResolvedValue(reply({}, { message: 'Because rosa, rosae is first declension.' }));
  render(<WordEditPanel word={word} onSave={async () => true} updating={false} />);
  expect(questionCard('Etymology')).toBeNull();
  expect(composer()).toHaveAttribute('placeholder', 'Ask the AI to fix or explain something in rosa…');

  fireEvent.change(composer(), { target: { value: 'Why first declension?' } });
  fireEvent.keyDown(composer(), { key: 'Enter', shiftKey: true });
  expect(mockCallable).not.toHaveBeenCalled();
  fireEvent.keyDown(composer(), { key: 'Enter' });
  expect(await screen.findByText('Because rosa, rosae is first declension.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Accept/ })).toBeNull();
});

it('puts the message back in the box when the AI cannot answer', async () => {
  mockCallable.mockRejectedValue(new Error('network down'));
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  say('Fix the etymology.');
  await waitFor(() => expect(composer()).toHaveValue('Fix the etymology.'));
  expect(toast.error).toHaveBeenCalledWith('The AI could not answer', { description: 'network down' });
  expect(within(assistant()).queryByText('Fix the etymology.', { selector: 'p' })).toBeNull();
});

it('saves the rule the AI drew from an answer when the admin accepts it, and undoes it on request', async () => {
  const rules = learnedRules();
  mockCallable.mockResolvedValue(
    reply(
      {},
      {
        message: 'Understood: no locative for rosa.',
        remember: [{ field: 'declension_table', note: 'rosa has no locative.' }],
        rule: 'Give locative forms only for place names.',
      }
    )
  );
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} learnedRules={rules} />);
  say('No locative: only place names have one.');
  await screen.findByText('Understood: no locative for rosa.');
  expect(screen.getByText('New rule for all words:')).toBeInTheDocument();
  expect(rules.learn).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  await waitFor(() =>
    expect(rules.learn).toHaveBeenCalledWith({
      instruction: 'Give locative forms only for place names.',
      learnedFrom: { word: 'rosa', message: 'No locative: only place names have one.' },
    })
  );
  expect(await screen.findByText(/Saved\. The AI follows it for every word\./)).toBeInTheDocument();
  expect(toast.success).toHaveBeenCalledWith(
    'The AI learned a rule for all words',
    expect.objectContaining({
      description: 'Give locative forms only for place names.',
      action: expect.objectContaining({ label: 'Undo' }),
    })
  );

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(rules.forget).toHaveBeenCalledWith('rule-1'));
  await waitFor(() => expect(screen.queryByText(/Give locative forms only for place names/)).toBeNull());
  expect(toast.success).toHaveBeenCalledWith('Rule removed');
});

it('does not save a rule the admin declines, and explains a rule that could not be saved', async () => {
  const rules = learnedRules();
  mockCallable
    .mockResolvedValueOnce(reply({}, { message: 'Noted.', rule: 'A rule the admin does not want.' }))
    .mockResolvedValueOnce(reply({}, { message: 'Noted again.', rule: 'A rule past the limit.' }));
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} learnedRules={rules} />);

  say('Only for this word.');
  await screen.findByText('Noted.');
  fireEvent.click(screen.getByRole('button', { name: 'Don’t save' }));
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(rules.learn).not.toHaveBeenCalled();
  expect(screen.queryByText(/A rule the admin does not want/)).toBeNull();

  rules.learn.mockRejectedValueOnce(new Error('There are already 20 rules for all words.'));
  say('Something general.');
  await screen.findByText('Noted again.');
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(await screen.findByText('Not saved: There are already 20 rules for all words.')).toBeInTheDocument();
  expect(toast.warning).toHaveBeenCalledWith('The rule for all words was not saved', {
    description: 'There are already 20 rules for all words.',
  });
});

it('does not show an answer for the previous word after switching words', async () => {
  const finish = pending();
  const onSave = jest.fn(async () => true);
  const view = render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  say('From Greek.');
  view.rerender(
    <WordEditPanel word={{ ...cloneNoun(), id: 'new-word', word: 'silva' }} onSave={onSave} updating={false} />
  );
  await finish(reply({ etymology: null }, { message: 'stale answer' }));
  expect(screen.queryByText('stale answer')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Accept/ })).not.toBeInTheDocument();
  expect((await saveWord(onSave)).etymology).toBe('An uncertain derivation');
});

it('adds new questions from autocomplete without replacing open ones, filling only empty values', async () => {
  const onSave = jest.fn(async () => true);
  const pronunciation = {
    field: 'pronunciation',
    question: 'Is the o long?',
    explanation: 'Vowel length is unclear.',
    options: ['The o is long.'],
  };
  mockCallable.mockResolvedValue(
    answer(
      { translation: 'replacement', pronunciation: 'new sound' },
      {
        uncertainties: [
          { field: 'etymology', question: 'A rewritten question?', explanation: 'Must not replace the open one.' },
          pronunciation,
        ],
      }
    )
  );
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
  await waitFor(() => expect(screen.getByLabelText('Pronunciation')).toHaveValue('new sound'));

  expect(toast.warning).toHaveBeenCalledWith('The AI has 2 questions', expect.anything());
  expect(within(questionCard('Pronunciation')!).getByText('Is the o long?')).toBeInTheDocument();
  expect(within(questionCard('Etymology')!).getByText(question.question)).toBeInTheDocument();
  expect(within(assistant()).getByText('2 questions')).toBeInTheDocument();
  const payload = await saveWord(onSave);
  expect(payload.translation).toBe('rose');
  expect(payload.ai_review.uncertainties).toEqual([question, pronunciation]);
});

it('discards an autocomplete result that arrives after switching words', async () => {
  const finish = pending();
  const onSave = jest.fn(async () => true);
  const view = render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
  view.rerender(
    <WordEditPanel word={{ ...cloneNoun(), id: 'new-word', word: 'silva' }} onSave={onSave} updating={false} />
  );
  await finish(answer({ pronunciation: 'stale sound' }));
  expect((await saveWord(onSave)).pronunciation).toBeNull();
});

it('lists what the AI remembers about the word and forgets a note with the next save', async () => {
  const onSave = jest.fn(async () => true);
  const word = cloneNoun();
  word.ai_review = {
    uncertainties: [],
    guidance: [
      { id: 'n1', instruction: 'Loan from Greek.', field: 'etymology' },
      { id: 'n2', instruction: 'A note about the whole word.' },
    ],
  };
  render(<WordEditPanel word={word} onSave={onSave} updating={false} />);
  const memory = screen.getByRole('list', { name: 'What the AI remembers about rosa' });
  expect(
    within(memory)
      .getAllByRole('listitem')
      .map(item => item.textContent)
  ).toEqual(['Etymology: Loan from Greek.', 'A note about the whole word.']);

  fireEvent.click(screen.getByRole('button', { name: 'Forget: Loan from Greek.' }));
  expect(screen.queryByText('Loan from Greek.')).toBeNull();
  expect((await saveWord(onSave)).ai_review.guidance).toEqual([word.ai_review.guidance[1]]);
});

it('asks about fields the form does not show, and those questions can still be answered', async () => {
  const adjective = {
    ...cloneNoun(),
    id: 'bonus',
    word: 'bonus',
    part_of_speech: 'adjective',
    declension: '1-2',
    dictionary_forms: [
      { full_form: 'bonus', shortened_form: 'bonus' },
      { full_form: 'bona', shortened_form: '-a' },
    ],
    degrees_table: {},
    ai_review: {
      uncertainties: [{ field: 'dictionary_forms', question: 'Is the neuter bonum?', explanation: 'Check it.' }],
      guidance: [],
    },
  } as unknown as VocabularyWordWithId;
  const view = render(<WordEditPanel word={adjective} onSave={async () => true} updating={false} />);
  expect(within(questionCard('Dictionary forms')!).getByText('bonus, bona (-a)')).toBeInTheDocument();
  view.unmount();

  const onSave = jest.fn(async () => true);
  const relative = {
    ...cloneNoun(),
    id: 'qui',
    word: 'quī',
    part_of_speech: 'pronoun',
    pronoun_type: 'relative',
    person: null,
    declension_table: buildEmptyFromSchema(getPronounTableSchema('relative', null)),
    ai_review: { uncertainties: [{ field: 'person', explanation: 'Relative pronouns take no person.' }], guidance: [] },
  } as unknown as VocabularyWordWithId;
  render(<WordEditPanel word={relative} onSave={onSave} updating={false} />);
  expect(screen.queryByText('Select person')).toBeNull();
  fireEvent.click(within(questionCard('Person')!).getByRole('button', { name: 'Keep as is' }));
  expect(questionCard('Person')).toBeNull();
  expect((await saveWord(onSave)).ai_review.uncertainties).toEqual([]);
});

it('shows no assistant where AI is off, and keeps the saved review untouched', async () => {
  const onSave = jest.fn(async () => true);
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} allowAIAutocomplete={false} />);
  expect(screen.queryByRole('region', { name: 'AI assistant' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'AI question about Etymology' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'edited' } });
  expect((await saveWord(onSave)).ai_review).toEqual(noun.ai_review);
});

it('preserves explicit null metadata and adjective dictionary forms through normal form saving', () => {
  const word = cloneNoun();
  const values = VocabularyFormSchema.parse(toFormDefaultValues(word));
  if (values.part_of_speech !== 'noun') throw new Error('Expected noun');
  values.declension = null;
  values.gender = null;
  expect(applyFormValuesToWord(word, values)).toMatchObject({ declension: null, gender: null });
  const adjective = {
    ...word,
    part_of_speech: 'adjective',
    declension: '1-2',
    dictionary_forms: [{ full_form: 'bonus', shortened_form: 'bonus' }],
    degrees_table: {},
  } as unknown as VocabularyWordWithId;
  const adjectiveValues = VocabularyFormSchema.parse(toFormDefaultValues(adjective));
  if (adjectiveValues.part_of_speech !== 'adjective') throw new Error('Expected adjective');
  adjectiveValues.dictionary_forms = null;
  expect(applyFormValuesToWord(adjective, adjectiveValues)).toMatchObject({ dictionary_forms: null });
});
