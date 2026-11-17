import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';
import { AIAssistantProvider } from '@/src/components/ui/admin/vocabulary/aiAssistantStore';
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
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() } }));

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
const dismiss = () => fireEvent.click(screen.getByRole('button', { name: 'Dismiss the AI assistant' }));
const tab = () => screen.queryByRole('button', { name: /^Show the AI assistant/ });
/** The page's store around the editor, keyed by word like the vocabulary page. */
const OnPage = ({
  word,
  onSave = async () => true,
}: {
  word: VocabularyWordWithId;
  onSave?: () => Promise<boolean>;
}) => (
  <AIAssistantProvider>
    <WordEditPanel key={word.id} word={word} onSave={onSave} updating={false} />
  </AIAssistantProvider>
);
const silva = () => ({ ...cloneNoun(), id: 'silva', word: 'silva', ai_review: { uncertainties: [], guidance: [] } });
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
  // A queued answer a failed test never used must not reach the next test.
  mockCallable.mockReset();
  localStorage.clear();
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
  expect(within(assistant()).getByText('Unanswered questions stay open.')).toBeInTheDocument();

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
  const view = render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);

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
  expect(within(assistant()).getByText('Accepted into the draft: Etymology. Remembering 1 note.')).toBeInTheDocument();
  expect(within(assistant()).getByText('Not saved yet: save the word with Apply.')).toBeInTheDocument();
  // Decided, the reply shrinks to that line; the change is still there under Details.
  expect(screen.queryByRole('list', { name: 'Proposed changes' })).toBeNull();
  fireEvent.click(within(assistant()).getByRole('button', { name: 'Details' }));
  expect(
    within(screen.getByRole('list', { name: 'Proposed changes' })).getByText('Borrowed from Greek rhódon.')
  ).toBeInTheDocument();
  expect(toast.success).toHaveBeenCalledWith('Updated Etymology. Save the word with Apply to keep it.');
  const memory = screen.getByRole('list', { name: 'What the AI remembers about rosa' });
  expect(within(memory).getByText('rosa is a loan from Greek rhódon.')).toBeInTheDocument();
  // The note keeps what the admin actually said, so its wording can be judged later.
  expect(
    within(memory).getByText('From the message: “Etymology: It is a loan from Greek rhódon.”')
  ).toBeInTheDocument();

  const payload = await saveWord(onSave);
  expect(payload.etymology).toBe('Borrowed from Greek rhódon.');
  expect(payload.translation).toBe('rose');
  expect(payload.ai_review).toEqual({
    uncertainties: [],
    guidance: [
      {
        id: 'note-1',
        instruction: 'rosa is a loan from Greek rhódon.',
        field: 'etymology',
        source: 'Etymology: It is a loan from Greek rhódon.',
      },
    ],
  });
  const savedWord = { ...payload, id: noun.id } as VocabularyWordWithId;
  const roundtrip = applyFormValuesToWord(savedWord, VocabularyFormSchema.parse(toFormDefaultValues(savedWord)));
  expect(roundtrip.ai_review).toEqual(payload.ai_review);

  // Once the page holds the saved word, the receipt says so.
  view.rerender(<WordEditPanel word={savedWord} onSave={onSave} updating={false} />);
  expect(within(assistant()).getByText('Saved on rosa.')).toBeInTheDocument();
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
  const rules = learnedRules();
  const onSave = jest.fn(async () => true);
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} learnedRules={rules} />);
  say('Fix the etymology and the pronunciation.');
  fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'another field' } });
  fireEvent.change(screen.getByLabelText('Etymology'), { target: { value: 'typed by the admin' } });
  await finish(
    reply(
      { etymology: 'From Greek rhódon.', pronunciation: 'RO-sa' },
      {
        message: 'Both fixed.',
        answered: ['etymology'],
        remember: [
          { field: 'etymology', note: 'rosa comes from Greek.' },
          { field: 'pronunciation', note: 'The o is short.' },
        ],
        rule: 'Mark Greek loans in the etymology.',
      }
    )
  );

  expect(
    screen.getByText('You edited Etymology after asking, so this change will not be applied. Ask again to update it.')
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Accept change' }));
  expect(
    screen.getByText(
      'Accepted into the draft: Pronunciation. Remembering 1 note. Skipped Etymology, which you had edited.'
    )
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(screen.getByText('Not applied, because you had edited this field.')).toBeInTheDocument();
  // The receipt names only the note that was kept, and says why the other was not.
  expect(screen.getByText('Remembered for rosa:').nextSibling).toHaveTextContent('The o is short.');
  expect(screen.getByText('Remembered for rosa:').nextSibling).not.toHaveTextContent('rosa comes from Greek.');
  expect(screen.getByText('rosa comes from Greek. (you had edited Etymology)')).toBeInTheDocument();
  expect(screen.getByLabelText('Etymology')).toHaveValue('typed by the admin');
  expect(screen.getByLabelText('Pronunciation')).toHaveValue('RO-sa');
  expect(screen.getByLabelText('Translation')).toHaveValue('another field');
  expect(questionCard('Etymology')).not.toBeNull();

  // The note about the skipped field describes a value the admin replaced, so it is not kept.
  expect((await saveWord(onSave)).ai_review.guidance).toEqual([
    expect.objectContaining({ field: 'pronunciation', instruction: 'The o is short.' }),
  ]);
  // The suggested rule is judged on its own, with the admin's message beside it.
  expect(screen.getByText('From your message: “Fix the etymology and the pronunciation.”')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save as rule for all words' }));
  await waitFor(() => expect(rules.learn).toHaveBeenCalledTimes(1));

  // A follow-up tells the AI which part of its answer did not apply.
  mockCallable.mockResolvedValueOnce(reply({}, { message: 'Understood.' }));
  say('Yes, except the etymology.');
  await screen.findByText('Understood.');
  expect(mockCallable.mock.calls.at(-1)![0].conversation.history.at(-1)).toEqual({
    from: 'ai',
    text: 'Both fixed. [partly applied: etymology skipped]',
  });
});

it('applies a change to a field the admin changed and then changed back while the AI answered', async () => {
  const finish = pending();
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  say('Fix the etymology.');
  fireEvent.change(screen.getByLabelText('Etymology'), { target: { value: 'a passing edit' } });
  fireEvent.change(screen.getByLabelText('Etymology'), { target: { value: 'An uncertain derivation' } });
  await finish(reply({ etymology: 'From Greek rhódon.' }, { message: 'Fixed.' }));

  // What matters is that the draft still holds the value the AI saw.
  expect(screen.queryByText(/You edited Etymology after asking/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Accept change' }));
  expect(screen.getByLabelText('Etymology')).toHaveValue('From Greek rhódon.');
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
      { from: 'ai', text: 'I rewrote it as Greek. [not accepted yet]' },
    ],
  });
  expect(screen.getByText('Replaced by a newer answer. Nothing was changed.')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Accept change' })).toHaveLength(1);
});

it('promises nothing after a discard, and tells the AI its answer was discarded', async () => {
  mockCallable
    .mockResolvedValueOnce(
      reply(
        { etymology: 'From Greek.' },
        { message: 'I rewrote it as Greek.', remember: [{ field: 'etymology', note: 'rosa is Greek.' }] }
      )
    )
    .mockResolvedValueOnce(reply({}, { message: 'Got it.' }));
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  say('It is Greek.');
  await screen.findByText('I rewrote it as Greek.');
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

  expect(screen.getByText('Discarded. Nothing was changed.')).toBeInTheDocument();
  expect(screen.queryByText("I'll remember for rosa:")).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(screen.getByText('Suggested notes, not kept:')).toBeInTheDocument();
  expect(screen.getByLabelText('Etymology')).toHaveValue('An uncertain derivation');

  say('Yes, except it came through Etruscan.');
  await screen.findByText('Got it.');
  expect(mockCallable.mock.calls[1][0].conversation.history).toEqual([
    { from: 'admin', text: 'It is Greek.' },
    { from: 'ai', text: 'I rewrote it as Greek. [discarded]' },
  ]);
});

it('says when an accepted value was changed by hand before saving', async () => {
  mockCallable.mockResolvedValueOnce(reply({ etymology: 'From Greek.' }, { message: 'I rewrote it as Greek.' }));
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  say('It is Greek.');
  await screen.findByText('I rewrote it as Greek.');
  fireEvent.click(screen.getByRole('button', { name: 'Accept change' }));
  fireEvent.change(screen.getByLabelText('Etymology'), { target: { value: 'My own wording.' } });
  expect(
    screen.getByText('You have since changed Etymology by hand, so the AI’s version will not be saved.')
  ).toBeInTheDocument();
});

it('follows new messages, but leaves the admin where they are after scrolling up to read', async () => {
  mockCallable.mockResolvedValueOnce(reply({}, { message: 'First answer.' }));
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  const sheet = screen.getByRole('list', { name: 'Conversation with the AI' }).parentElement!;
  Object.defineProperty(sheet, 'scrollHeight', { configurable: true, get: () => 1000 });
  Object.defineProperty(sheet, 'clientHeight', { configurable: true, get: () => 200 });

  say('First question.');
  await screen.findByText('First answer.');
  expect(sheet.scrollTop).toBe(1000);

  const finish = pending();
  say('Second question.');
  // The admin scrolls up to reread while the AI answers.
  sheet.scrollTop = 100;
  fireEvent.scroll(sheet);
  await finish(reply({}, { message: 'Second answer.' }));
  expect(screen.getByText('Second answer.')).toBeInTheDocument();
  expect(sheet.scrollTop).toBe(100);
});

it('can be asked anything when it has no questions, and answers without proposing a change', async () => {
  const word = cloneNoun();
  delete word.ai_review;
  mockCallable.mockResolvedValue(reply({}, { message: 'Because rosa, rosae is first declension.' }));
  render(<WordEditPanel word={word} onSave={async () => true} updating={false} />);
  expect(questionCard('Etymology')).toBeNull();
  expect(composer()).toHaveAttribute('placeholder', 'Tell the AI what to fix or explain in rosa…');

  fireEvent.change(composer(), { target: { value: 'Why first declension?' } });
  fireEvent.keyDown(composer(), { key: 'Enter', shiftKey: true });
  expect(mockCallable).not.toHaveBeenCalled();
  fireEvent.keyDown(composer(), { key: 'Enter' });
  expect(await screen.findByText('Because rosa, rosae is first declension.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Accept/ })).toBeNull();
});

it('comes back up when autocomplete finishes, says all good when the AI is sure, and still takes a correction', async () => {
  const word = cloneNoun();
  delete word.ai_review;
  mockCallable.mockResolvedValueOnce(answer({ pronunciation: 'ˈro.sa' }));
  render(<WordEditPanel word={word} onSave={async () => true} updating={false} />);
  dismiss();
  expect(screen.queryByRole('region', { name: 'AI assistant' })).toBeNull();
  expect(tab()).not.toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
  const report = await screen.findByText(
    'All good! No questions from me about rosa. I filled Pronunciation. If anything looks off, tell me below.'
  );
  expect(assistant()).toContainElement(report);
  expect(tab()).toBeNull();
  expect(toast.success).toHaveBeenCalledWith('AI autocomplete finished', undefined);

  // Sure is not the same as right: the admin corrects it in the same conversation.
  mockCallable.mockResolvedValueOnce(reply({ pronunciation: 'ˈroː.sa' }, { message: 'Fixed: the o is long.' }));
  say('The o is long.');
  expect(await screen.findByText('Fixed: the o is long.')).toBeInTheDocument();
  expect(mockCallable.mock.calls[1][0].conversation.history).toEqual([
    { from: 'ai', text: expect.stringContaining('All good! No questions from me about rosa. I filled Pronunciation.') },
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Accept change' }));
  expect(screen.getByLabelText('Pronunciation')).toHaveValue('ˈroː.sa');
});

it('says all good when there was nothing left to fill', async () => {
  const word = cloneNoun();
  delete word.ai_review;
  mockCallable.mockResolvedValueOnce(answer({ translation: 'a different rose' }));
  render(<WordEditPanel word={word} onSave={async () => true} updating={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
  expect(
    await within(assistant()).findByText(
      'All good! No questions from me about rosa, and there was nothing left to fill. If anything looks off, tell me below.'
    )
  ).toBeInTheDocument();
});

it('dismisses to a tab that counts open questions, stays dismissed from word to word, and comes back from a field', () => {
  const first = render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  dismiss();
  expect(screen.queryByRole('region', { name: 'AI assistant' })).toBeNull();
  expect(tab()).toHaveAccessibleName('Show the AI assistant (1 question)');

  first.unmount();
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  expect(tab()).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'AI question about Etymology' }));
  expect(questionCard('Etymology')).not.toBeNull();
  expect(composer()).toHaveFocus();
  expect(tab()).toBeNull();
});

it('keeps what was typed when dismissed, and each word keeps its own conversation', async () => {
  const view = render(<OnPage word={cloneNoun()} />);
  fireEvent.change(composer(), { target: { value: 'Half a thought' } });
  dismiss();
  fireEvent.click(tab()!);
  expect(composer()).toHaveValue('Half a thought');

  mockCallable.mockResolvedValueOnce(reply({}, { message: 'It came through Greek.' }));
  say('Where is rosa from?');
  expect(await screen.findByText('It came through Greek.')).toBeInTheDocument();

  view.rerender(<OnPage word={silva()} />);
  expect(screen.queryByText('It came through Greek.')).toBeNull();
  expect(composer()).toHaveValue('');
  fireEvent.change(composer(), { target: { value: 'About silva' } });

  view.rerender(<OnPage word={cloneNoun()} />);
  expect(screen.getByText('It came through Greek.')).toBeInTheDocument();
  expect(screen.getByText('Where is rosa from?')).toBeInTheDocument();
  view.rerender(<OnPage word={silva()} />);
  expect(composer()).toHaveValue('About silva');
});

it('lets a reply for another word finish there, announced, and acceptable once the admin is back', async () => {
  const finish = pending();
  const view = render(<OnPage word={cloneNoun()} />);
  say('Etymology: It is a loan from Greek rhódon.');
  view.rerender(<OnPage word={silva()} />);

  const notice = screen.getByRole('status');
  expect(notice).toHaveTextContent('Still answering about rosa…');
  fireEvent.click(within(notice).getByRole('button', { name: 'Keep going with the answer about rosa' }));
  expect(screen.queryByText('Still answering about rosa…')).toBeNull();

  await finish(
    reply({ etymology: 'From Greek rhódon.' }, { message: 'Rewritten as a loan.', answered: ['etymology'] })
  );
  expect(toast.info).toHaveBeenCalledWith('The AI answered about rosa', {
    description: 'Open rosa to see its answer.',
  });
  expect(screen.queryByText('Rewritten as a loan.')).toBeNull();

  view.rerender(<OnPage word={cloneNoun()} />);
  expect(screen.getByText('Rewritten as a loan.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Accept change' }));
  expect(screen.getByLabelText('Etymology')).toHaveValue('From Greek rhódon.');
  expect(questionCard('Etymology')).toBeNull();
});

it('stops a reply on request, from its own word or another, and ignores the late answer', async () => {
  const late = pending();
  const view = render(<OnPage word={cloneNoun()} />);
  say('First try.');
  const stopButton = within(assistant()).getByRole('button', { name: 'Stop waiting' });
  // The Function cannot be cancelled, so the button says the AI may still finish, and be charged.
  expect(stopButton).toHaveAttribute(
    'title',
    'This stops waiting for the answer. Generation may continue and still incur charges.'
  );
  fireEvent.click(stopButton);
  expect(composer()).toHaveValue('First try.');
  expect(
    within(assistant()).getByText(
      'You stopped waiting for this answer. Generation may continue and still incur charges.'
    )
  ).toBeInTheDocument();
  await late(reply({ etymology: 'late' }, { message: 'Too late.' }));
  expect(screen.queryByText('Too late.')).toBeNull();

  const later = pending();
  say('Second try.');
  view.rerender(<OnPage word={silva()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Stop waiting for the answer about rosa' }));
  expect(screen.queryByRole('status')).toBeNull();
  await later(reply({ etymology: 'late' }, { message: 'Also too late.' }));
  expect(toast.info).not.toHaveBeenCalled();

  view.rerender(<OnPage word={cloneNoun()} />);
  expect(screen.queryByText('Also too late.')).toBeNull();
  expect(composer()).toHaveValue('Second try.');
});

it('notices a field changed by hand after the AI asked, and Done closes the question with a note', async () => {
  const onSave = jest.fn(async () => true);
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  const card = () => questionCard('Etymology')!;
  expect(within(card()).queryByText(/You changed/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Etymology'), { target: { value: 'From Greek rhódon.' } });
  expect(within(card()).getByText('You changed Etymology since the AI asked.')).toBeInTheDocument();
  expect(within(card()).queryByRole('button', { name: 'Keep as is' })).toBeNull();

  fireEvent.click(within(card()).getByRole('button', { name: 'Done' }));
  expect(questionCard('Etymology')).toBeNull();
  expect(screen.getByText('You marked Etymology as done.')).toBeInTheDocument();
  const { ai_review } = await saveWord(onSave);
  expect(ai_review.uncertainties).toEqual([]);
  expect(ai_review.guidance).toEqual([
    {
      id: 'note-1',
      field: 'etymology',
      instruction: `When asked “${question.question}”, an admin set the value by hand.`,
    },
  ]);
});

it('puts the message back in the box when the AI cannot answer', async () => {
  mockCallable.mockRejectedValue(new Error('network down'));
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  say('Fix the etymology.');
  await waitFor(() => expect(composer()).toHaveValue('Fix the etymology.'));
  expect(toast.error).toHaveBeenCalledWith('The AI could not answer', { description: 'network down' });
  expect(within(assistant()).queryByText('Fix the etymology.', { selector: 'p' })).toBeNull();
});

const RULE_MESSAGE = 'No locative: only place names have one.';
const replyWithRule = (extra: Partial<VocabularyAIReply> = {}) =>
  reply(
    {},
    {
      message: 'Understood: no locative for rosa.',
      remember: [{ field: 'declension_table', note: 'rosa has no locative.' }],
      rule: 'Give locative forms only for place names.',
      ...extra,
    }
  );

it('suggests a rule for all words but saves it only on its own click, quoting the admin, and undoes it', async () => {
  const rules = learnedRules();
  mockCallable.mockResolvedValue(replyWithRule());
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} learnedRules={rules} />);
  say(RULE_MESSAGE);
  await screen.findByText('Understood: no locative for rosa.');
  expect(screen.getByText('Suggested rule for all words:')).toBeInTheDocument();
  expect(screen.getByText(`From your message: “${RULE_MESSAGE}”`)).toBeInTheDocument();

  // Accepting the reply keeps the note on rosa and saves nothing for every word.
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(within(assistant()).getByText('Accepted. Remembering 1 note.')).toBeInTheDocument();
  expect(rules.learn).not.toHaveBeenCalled();
  // The reply has shrunk, but the unsaved rule is still shown in full.
  expect(screen.getByText('Suggested rule for all words:')).toBeInTheDocument();

  // A quick double click still saves it once.
  const save = screen.getByRole('button', { name: 'Save as rule for all words' });
  fireEvent.click(save);
  fireEvent.click(save);
  expect(await screen.findByText(/Saved\. The AI follows it for every word\./)).toBeInTheDocument();
  expect(rules.learn).toHaveBeenCalledTimes(1);
  expect(rules.learn).toHaveBeenCalledWith({
    instruction: 'Give locative forms only for place names.',
    learnedFrom: { word: 'rosa', message: RULE_MESSAGE },
  });
  expect(toast.success).toHaveBeenCalledWith(
    'Saved as a rule for all words',
    expect.objectContaining({
      description: 'Give locative forms only for place names.',
      action: expect.objectContaining({ label: 'Undo' }),
    })
  );
  expect(screen.queryByRole('button', { name: 'Save as rule for all words' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(rules.forget).toHaveBeenCalledWith('rule-1'));
  expect(await screen.findByText('Rule removed.')).toBeInTheDocument();
  expect(toast.success).toHaveBeenCalledWith('Rule removed');
  // Removed by mistake? It can be saved again.
  expect(screen.getByRole('button', { name: 'Save as rule for all words' })).toBeInTheDocument();
});

it('keeps a suggested rule saveable after the reply is discarded, and offers a retry when saving fails', async () => {
  const rules = learnedRules();
  mockCallable.mockResolvedValue(replyWithRule({ remember: [], rule: 'A rule past the limit.' }));
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} learnedRules={rules} />);
  say('Something general.');
  await screen.findByText('Understood: no locative for rosa.');
  // A reply that only suggests a rule has nothing to accept.
  expect(screen.queryByRole('button', { name: /^Accept/ })).toBeNull();

  rules.learn.mockRejectedValueOnce(new Error('There are already 20 rules for all words.'));
  fireEvent.click(screen.getByRole('button', { name: 'Save as rule for all words' }));
  expect(await screen.findByText('Not saved: There are already 20 rules for all words.')).toBeInTheDocument();
  expect(toast.warning).toHaveBeenCalledWith('The rule for all words was not saved', {
    description: 'There are already 20 rules for all words.',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(/Saved\. The AI follows it for every word\./)).toBeInTheDocument();
  expect(rules.learn).toHaveBeenCalledTimes(2);
});

it('says when the AI already follows a suggested rule, and that rules cannot be saved where the page has none', async () => {
  const rules = learnedRules();
  rules.learn.mockImplementationOnce(async rule => ({
    settings: { revision: 1, rules: [], updatedAt: null, updatedBy: null },
    rule: { id: 'existing', instruction: rule.instruction },
    added: false,
  }));
  mockCallable.mockResolvedValue(replyWithRule());
  const view = render(
    <WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} learnedRules={rules} />
  );
  say(RULE_MESSAGE);
  await screen.findByText('Understood: no locative for rosa.');
  fireEvent.click(screen.getByRole('button', { name: 'Save as rule for all words' }));
  expect(await screen.findByText('The AI already follows this rule.')).toBeInTheDocument();
  view.unmount();

  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  say(RULE_MESSAGE);
  await screen.findByText('Understood: no locative for rosa.');
  expect(screen.getByText('Rules can’t be saved from this page.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save as rule for all words' })).toBeNull();
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

  expect(
    within(assistant()).getByText('Done. I filled Pronunciation in rosa. I have 2 questions for you above.')
  ).toBeInTheDocument();
  expect(within(questionCard('Pronunciation')!).getByText('Is the o long?')).toBeInTheDocument();
  // Autocomplete filled the field it asks about; only the admin's own edit counts as a change.
  expect(within(questionCard('Pronunciation')!).queryByText(/You changed/)).toBeNull();
  expect(within(questionCard('Etymology')!).getByText(question.question)).toBeInTheDocument();
  expect(within(assistant()).getByText('2 questions')).toBeInTheDocument();
  const payload = await saveWord(onSave);
  expect(payload.translation).toBe('rose');
  expect(payload.ai_review.uncertainties).toEqual([question, pronunciation]);
});

describe('when the admin keeps working while autocomplete runs', () => {
  it('still applies the answer after a question is answered in the assistant meanwhile', async () => {
    const finish = pending();
    const onSave = jest.fn(async () => true);
    render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
    fireEvent.click(within(questionCard('Etymology')!).getByRole('button', { name: 'Keep as is' }));
    await finish(answer({ pronunciation: 'ˈro.sa' }));

    expect(screen.getByLabelText('Pronunciation')).toHaveValue('ˈro.sa');
    expect(screen.getByRole('button', { name: 'AI Autocomplete' })).toBeEnabled();
    const payload = await saveWord(onSave);
    expect(payload.pronunciation).toBe('ˈro.sa');
    expect(payload.ai_review.uncertainties).toEqual([]);
  });

  it('keeps a field the admin changed meanwhile, drops the question about it, and says so', async () => {
    const finish = pending();
    const onSave = jest.fn(async () => true);
    render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
    fireEvent.change(screen.getByLabelText('Pronunciation'), { target: { value: 'mine' } });
    await finish(
      answer(
        { pronunciation: 'ˈro.sa', alternate_form: 'rhoda' },
        { uncertainties: [{ field: 'pronunciation', question: 'Is the o long?', explanation: 'Unclear.' }] }
      )
    );

    expect(screen.getByLabelText('Pronunciation')).toHaveValue('mine');
    expect(questionCard('Pronunciation')).toBeNull();
    expect(
      within(assistant()).getByText(
        'All good! No questions from me about rosa. I filled Alternate Form. I left Pronunciation as you changed it while I was working. If anything looks off, tell me below.'
      )
    ).toBeInTheDocument();
    const payload = await saveWord(onSave);
    expect(payload.pronunciation).toBe('mine');
    expect(payload.alternate_form).toBe('rhoda');
  });

  it('leaves a table cell empty that the admin emptied meanwhile, and fills the other empty cells', async () => {
    const finish = pending();
    const onSave = jest.fn(async () => true);
    render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
    fireEvent.doubleClick(screen.getByText('rosam'));
    const input = screen.getByPlaceholderText('Enter value...');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // The server sends back the table merged with the draft it was given, so the emptied cell comes back filled.
    await finish(
      answer({
        declension_table: {
          ...(noun as { declension_table: object }).declension_table,
          locative: row(['rosae'], null),
        },
      })
    );

    const payload = await saveWord(onSave);
    expect(payload.declension_table.accusative).toEqual(row(null, ['rosās']));
    expect(payload.declension_table.locative).toEqual(row(['rosae'], null));
  });
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

describe('Save and next', () => {
  const silvaNext = () => ({ word: 'silva', open: jest.fn() });

  it('saves, then opens the next word, without waiting for open AI questions', async () => {
    const onSave = jest.fn(async (_updates: Partial<VocabularyWordWithId>) => true);
    const next = silvaNext();
    render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} next={next} />);
    fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'a rose' } });
    const button = screen.getByRole('button', { name: /^Apply and next/ });
    expect(button).toHaveAttribute('title', 'Apply, then open silva (Ctrl+Enter or ⌘+Enter)');
    fireEvent.click(button);

    await waitFor(() => expect(next.open).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.translation).toBe('a rose');
    // The open question stays on the word for later.
    expect(saved.ai_review?.uncertainties).toEqual(noun.ai_review?.uncertainties);
    expect(onSave.mock.invocationCallOrder[0]).toBeLessThan(next.open.mock.invocationCallOrder[0]);
  });

  it('stays on the word with its draft when the save fails or the form is invalid', async () => {
    const onSave = jest.fn(async () => false);
    const next = silvaNext();
    render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} next={next} />);
    fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'a rose' } });
    fireEvent.click(screen.getByRole('button', { name: /^Apply and next/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(next.open).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Translation')).toHaveValue('a rose');

    fireEvent.change(screen.getByLabelText('Word'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^Apply and next/ }));
    expect(await screen.findByText('Validation Errors:')).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(next.open).not.toHaveBeenCalled();
  });

  it('runs on Ctrl/⌘+Enter from a field or the AI box, where plain Enter still sends the message', async () => {
    const onSave = jest.fn(async () => true);
    const next = silvaNext();
    render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} next={next} />);
    fireEvent.keyDown(screen.getByLabelText('Translation'), { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(next.open).toHaveBeenCalledTimes(1));

    fireEvent.change(composer(), { target: { value: 'Unsent thought' } });
    fireEvent.keyDown(composer(), { key: 'Enter', metaKey: true });
    await waitFor(() => expect(next.open).toHaveBeenCalledTimes(2));
    expect(mockCallable).not.toHaveBeenCalled();
    expect(composer()).toHaveValue('Unsent thought');
  });

  it('is disabled at the end of the list, says why, and is absent where the page has no list', () => {
    const onSave = jest.fn(async () => true);
    const view = render(
      <WordEditPanel
        word={cloneNoun()}
        onSave={onSave}
        updating={false}
        next={{ unavailable: 'This is the last word in the list.' }}
      />
    );
    const button = screen.getByRole('button', { name: /^Apply and next/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'This is the last word in the list.');
    fireEvent.keyDown(screen.getByLabelText('Translation'), { key: 'Enter', ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();

    view.rerender(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
    expect(screen.queryByRole('button', { name: /and next/ })).toBeNull();
  });
});
