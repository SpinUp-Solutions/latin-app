import type { EvaluationCaseInput } from './contracts';

/**
 * Starter cases taken from translation-grading exercises in the MCS lessons.
 * Each source is the exercise text exactly as the lesson sends it to the
 * grader; the answers run from an accurate translation to the mistake that
 * lesson's grammar point invites, so a comparison shows whether a profile
 * separates them.
 */
export const LESSON_EVALUATION_CASES: EvaluationCaseInput[] = [
  {
    title: 'Lesson XV (3rd declension) · Vergil, Aeneid 2.668',
    direction: 'latin-to-english',
    sourceText: 'Arma, virī, ferte arma; vocat lūx ultima victōs.',
    answers: [
      { id: 'accurate', label: 'Accurate', text: 'Arms, men, bring arms; the last light calls the conquered.' },
      {
        id: 'variant',
        label: 'Acceptable variant',
        text: 'Weapons, men, bring weapons! The final day is calling the defeated.',
      },
      {
        id: 'victors',
        label: 'Error: victōs read as "victors"',
        text: 'Arms, men, bring arms; the last light calls the victors.',
      },
      {
        id: 'genitive',
        label: 'Error: virī read as genitive',
        text: 'The arms of the men bring arms; the last light calls the conquered.',
      },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson XX (dative and ablative) · Petronius',
    direction: 'latin-to-english',
    sourceText: 'Nunc populus est domī leōnēs, forās vulpēs.',
    answers: [
      { id: 'accurate', label: 'Accurate', text: 'Now the people are lions at home and foxes out of doors.' },
      { id: 'literal', label: 'Literal but clear', text: 'Now the people is lions at home, foxes outside.' },
      {
        id: 'genitive',
        label: 'Error: domī read as genitive',
        text: 'Now the people of the house are lions, and the foxes are outside.',
      },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson XXII (prepositions) · Vergil, Eclogues',
    direction: 'latin-to-english',
    sourceText: 'frīgidus latet anguis in herbā',
    answers: [
      { id: 'accurate', label: 'Accurate', text: 'A cold snake lies hidden in the grass.' },
      { id: 'variant', label: 'Acceptable variant', text: 'A chilly serpent is lurking in the grass.' },
      { id: 'swapped', label: 'Error: subject and object swapped', text: 'The cold grass hides a snake.' },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson XXXV (imperatives) · Livy, AUC 3',
    direction: 'latin-to-english',
    sourceText: 'eam modestiam ferte in urbem.',
    answers: [
      { id: 'accurate', label: 'Accurate', text: 'Bring that restraint into the city.' },
      { id: 'variant', label: 'Acceptable variant', text: 'Carry this moderation with you into the city.' },
      {
        id: 'indicative',
        label: 'Error: imperative read as indicative',
        text: 'They carry that modesty into the city.',
      },
      { id: 'person', label: 'Error: modestiam read as a person', text: 'Bring the modest woman into the city.' },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson XLVI (impersonal passive) · Caesar, BG 6.37',
    direction: 'latin-to-english',
    sourceText: 'Tōtīs trepidātur castrīs, atque alius ex aliō causam tumultūs quaerit.',
    answers: [
      {
        id: 'accurate',
        label: 'Accurate',
        text: 'There is panic throughout the whole camp, and one man asks another the cause of the uproar.',
      },
      {
        id: 'free',
        label: 'Free but accurate',
        text: 'The whole camp is in a panic, and everyone asks everyone else what the commotion is about.',
      },
      {
        id: 'personal',
        label: 'Error: impersonal passive and plural castra',
        text: 'All the camps are trembled, and another seeks the cause of the uproar from another.',
      },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson LII (deponents) · Cicero, In Catilinam 1.1',
    direction: 'latin-to-english',
    sourceText: 'Quō ūsque tandem abūtēre, Catilīna, patientiā nostrā?',
    answers: [
      { id: 'accurate', label: 'Accurate', text: 'How long, Catiline, will you go on abusing our patience?' },
      {
        id: 'present',
        label: 'Slip: future read as present',
        text: 'How long, Catiline, are you abusing our patience?',
      },
      {
        id: 'passive',
        label: 'Error: deponent read as passive',
        text: 'How long, Catiline, will you be abused by our patience?',
      },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson LIV (reflexive pronouns) · Frāter sum alterīus',
    direction: 'latin-to-english',
    sourceText: 'Frāter sum alterīus, nēmō est enim suus frater; pār sum, sed alicui, quis enim pār est sibi?',
    answers: [
      {
        id: 'accurate',
        label: 'Accurate',
        text: "I am someone else's brother, for no one is his own brother; I am an equal, but to someone, for who is equal to himself?",
      },
      {
        id: 'minor',
        label: 'Slip: alterīus read as "the other"',
        text: 'I am the brother of the other one, for nobody is his own brother; I am equal, but to someone, for who is equal to himself?',
      },
      {
        id: 'reflexive',
        label: 'Error: reflexives read as non-reflexive',
        text: 'I am the brother of the other, for no one is his brother; I am equal, but to someone, for who is equal to him?',
      },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson LXIX (ablative absolutes) · Cicero, letter',
    direction: 'latin-to-english',
    sourceText: 'Quā rē Iānuāriō ineunte, ut cōnstituistī, cūrā ut Rōmae sīs.',
    answers: [
      {
        id: 'accurate',
        label: 'Accurate',
        text: 'So at the beginning of January, as you have decided, make sure that you are in Rome.',
      },
      {
        id: 'literal',
        label: 'Literal',
        text: 'Wherefore, with January beginning, as you resolved, take care that you are at Rome.',
      },
      {
        id: 'structure',
        label: 'Error: ablative absolute and imperative missed',
        text: 'Because of this, January is beginning, as you decided, and you care for Rome.',
      },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson LXXXII (indirect questions) · Cicero, Ep. 6.2',
    direction: 'latin-to-english',
    sourceText: 'Tū velim scrībās ad mē, quid agās et ubī futūrus sīs, ut aut quō scrībam aut quō veniam scīre possim.',
    answers: [
      {
        id: 'accurate',
        label: 'Accurate',
        text: 'I would like you to write to me what you are doing and where you are going to be, so that I can know either where to write or where to come.',
      },
      {
        id: 'present',
        label: 'Partial: futūrus sīs read as present',
        text: 'Please write to me what you are doing and where you are, so that I can know where to write or where to come.',
      },
      {
        id: 'persons',
        label: 'Error: persons of velim and agās confused',
        text: 'You would like to write to me what I am doing and where I will be, so that I can know where to write or where to come.',
      },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson XCI (indirect commands) · Cicero, Ad Atticum 7.9.3',
    direction: 'latin-to-english',
    sourceText: 'Dīcēs profectō persuādērī illī ut trādat exercitum et ita cōnsul fīat.',
    answers: [
      {
        id: 'accurate',
        label: 'Accurate',
        text: 'You will surely say that he should be persuaded to hand over his army and so become consul.',
      },
      {
        id: 'active',
        label: 'Partial: impersonal passive missed',
        text: 'You will surely say that he persuaded him to hand over the army and so become consul.',
      },
      {
        id: 'verbs',
        label: 'Error: dīcēs and persuādērī misread',
        text: 'I am certainly saying that I persuaded him to hand over the army and so he became consul.',
      },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson XCIV (cum temporal) · Caesar',
    direction: 'latin-to-english',
    sourceText: 'Eō cum Caesar vēnisset, obsidēs poposcit.',
    answers: [
      { id: 'accurate', label: 'Accurate', text: 'When Caesar had arrived there, he demanded hostages.' },
      { id: 'simple-past', label: 'Acceptable: simple past', text: 'When Caesar came there, he asked for hostages.' },
      {
        id: 'preposition',
        label: 'Error: cum read as "with", eō as "him"',
        text: 'Caesar came with him and asked for hostages.',
      },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson XCVI (cum causal) · Nepos, Hannibal 10.4',
    direction: 'latin-to-english',
    sourceText:
      'Classē paucīs diēbus erant dēcrētūrī. Superābātur nāvium multitūdine; dolō erat pugnandum, cum pār nōn esset armīs. Imperāvit quam plūrimās venēnātās serpentēs vīvās colligī eāsque in vasa fictilia conicī.',
    answers: [
      {
        id: 'accurate',
        label: 'Accurate',
        text: 'They were about to fight it out with their fleets in a few days. He was outnumbered in ships; he had to fight by trickery, since he was not equal in arms. He ordered as many poisonous snakes as possible to be gathered alive and put into earthenware jars.',
      },
      {
        id: 'minor',
        label: 'Slip: quam plūrimās read as "many"',
        text: 'They were going to fight a naval battle in a few days. He was outnumbered in ships; he had to fight by trickery, since he was not equal in arms. He ordered many poisonous snakes to be gathered alive and thrown into earthenware jars.',
      },
      {
        id: 'partial',
        label: 'Partial: periphrastics and causal cum missed',
        text: 'They had decided on a fleet for a few days. He was overcome by the multitude of ships; the trick was to be fought when he was not equal in arms. He ordered very many poisonous snakes to be collected alive and thrown into clay pots.',
      },
    ],
    modes: ['lesson', 'test'],
  },
  {
    title: 'Lesson CIV (result clauses) · Caesar, BG 1.39',
    direction: 'latin-to-english',
    sourceText: 'Tantus subitō timor omnem exercitum occupāvit ut nōn mediocriter omnium mentēs animōsque perturbāret.',
    answers: [
      {
        id: 'accurate',
        label: 'Accurate',
        text: "So great a fear suddenly seized the whole army that it greatly disturbed everyone's minds and spirits.",
      },
      {
        id: 'literal',
        label: 'Literal: nōn mediocriter kept',
        text: 'Such great fear suddenly took hold of the entire army that it disturbed the minds and hearts of all not moderately.',
      },
      {
        id: 'purpose',
        label: 'Error: result clause read as purpose',
        text: 'A great fear suddenly seized the whole army in order to disturb the minds and spirits of all.',
      },
    ],
    modes: ['lesson', 'test'],
  },
];
