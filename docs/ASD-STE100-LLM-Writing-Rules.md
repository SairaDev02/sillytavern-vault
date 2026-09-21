# ASD-STE100 Writing Rules for LLMs

> **Purpose:** A practical implementation guide for using an LLM to draft, rewrite, or review technical documentation in accordance with **ASD-STE100 Simplified Technical English, Issue 9 (January 15, 2025)**.
>
> **Status:** This is an LLM-oriented companion guide, **not the ASD-STE100 standard itself**. The official ASD-STE100 document and applicable company/project terminology remain authoritative.

## 1. What the LLM is trying to achieve

ASD-STE100 is a controlled natural language consisting of two major parts:

1. **Writing Rules** — grammar, sentence construction, procedure writing, descriptive writing, safety instructions, punctuation, and style.
2. **Controlled Dictionary** — approved words, their approved meanings, parts of speech, permitted forms, and alternatives for non-approved words.

The current official release is **Issue 9, January 15, 2025**. Issue 9 contains **53 writing rules in nine sections**, plus eight general recommendations. ASD states that AI tools may assist authors, but the standard itself remains the primary reference and AI output requires informed human review.

### LLM principle

> **Never treat “sounds simple” as equivalent to “STE-compliant.”**

For every generated sentence, preserve the technical meaning first, then satisfy the applicable STE rules.

---

## 2. LLM compliance hierarchy

When generating or rewriting text, apply these priorities in this order:

1. **Technical accuracy** — do not alter requirements, limits, conditions, sequence, safety meaning, or engineering intent.
2. **Terminology control** — use approved STE words and approved company/industry technical terminology.
3. **Approved meaning and part of speech** — an approved word is not automatically approved for every meaning or grammatical role.
4. **Sentence structure** — use the applicable procedure/descriptive/safety construction.
5. **Length and formatting** — satisfy word-count, list, punctuation, and paragraph rules.
6. **Consistency** — use the same terminology and sentence patterns for the same concepts.

If these goals conflict, **do not silently change technical meaning**. Flag the conflict and request authoritative terminology or engineering clarification.

---

## 3. Non-negotiable LLM behaviors

An LLM generating STE text **MUST**:

- Prefer the official STE dictionary over general English synonyms.
- Check the **approved meaning**, not only whether a word appears in the dictionary.
- Check the **part of speech** allowed for the word.
- Treat company/industry/project technical nouns and technical verbs as controlled terminology.
- Preserve one technical noun for one item throughout the document.
- Use active voice for procedures.
- Use imperative form for procedural instructions.
- Limit procedural sentences to **20 words**.
- Limit descriptive sentences to **25 words**.
- Avoid normal `-ing` verb constructions unless the form is permitted as a technical noun or as part of a technical noun.
- Avoid phrasal verbs unless the specific phrasal verb is approved.
- Avoid contractions.
- Use complete grammatical sentences.
- Make conditions explicit and place required preconditions before commands.
- Use warnings/cautions according to the actual risk.
- Never invent that a word is STE-approved.

The LLM **MUST NOT**:

- Invent STE dictionary entries.
- Treat a common synonym as an approved STE synonym without verification.
- Turn technical nouns into verbs merely because the result sounds natural.
- Replace a precise technical term with a vague “simpler” word.
- Remove information merely to meet a word-count limit.
- Merge separate instructions merely to reduce sentence count.
- Change warning/caution wording in a way that changes the safety meaning.
- Claim “ASD-certified” or “fully compliant” output without an authoritative check.

---

# Part I — Writing Rules

## 4. Section 1 — Words

### Rule 1.1 — Allowed word sources

Use words that are:

- approved in the STE dictionary;
- approved technical nouns; or
- approved technical verbs.

**LLM action:** Maintain separate terminology sources for the STE dictionary and project/company terminology.

### Rule 1.2 — Part of speech

Use each approved dictionary word only as its specified part of speech.

Example pattern:

- `test` may be approved as a noun but not necessarily as a verb.
- Do not convert an approved noun into a verb because ordinary English permits it.

### Rule 1.3 — Approved meaning

Use an approved word only with the meaning specified by the STE dictionary.

A word can be valid STE vocabulary while its intended everyday meaning is **not** the approved meaning.

**LLM check:** For each potentially ambiguous approved word, verify the dictionary meaning before using it.

### Rule 1.4 — Approved forms of verbs and adjectives

Use only the verb forms and adjective forms specified or permitted by the dictionary.

**LLM check:** Do not invent inflections or alternative forms merely because they are grammatically possible in general English.

### Rule 1.5 — Technical nouns

Technical nouns may be used when they fit an applicable technical-noun category.

Use established terminology from:

- company glossaries;
- engineering drawings;
- official parts information;
- terminology databases; or
- applicable industry/domain sources.

The categories cover subject fields such as parts, vehicles/machines, tools, materials, processes, measurement, science/engineering, software/IT, law/regulations, and other specialized domains.

### Rule 1.6 — Non-approved words used as technical nouns

A word that is not approved in the general dictionary can still be used when it is legitimately a technical noun or part of a technical noun in an applicable technical-noun category.

**LLM action:** Do not “correct” an authoritative technical term solely because it is absent from the general STE dictionary.

### Rule 1.7 — Technical nouns are not verbs

Do not use a technical noun as a verb.

Bad pattern:

> `Oil the surface.`

Preferred construction:

> `Apply oil to the surface.`

### Rule 1.8 — Use established technical nouns

When a technical noun is already approved by the company, industry, or subject field, use that term.

Do not replace an established technical term with a generic synonym for stylistic variety.

### Rule 1.9 — Short and clear technical nouns

When selecting a technical noun that is not already established, choose a term that is short and easy to understand. STE gives a maximum of three words for newly selected technical nouns under this rule.

### Rule 1.10 — No regional/slang/jargon technical nouns

Do not select regional expressions, slang, or specialist jargon as technical nouns merely because a local group uses them.

Technical terminology should be understandable to the intended international readership.

### Rule 1.11 — One noun for one item

Do not use different technical nouns for the same item.

Bad pattern:

- `actuator`
- `control unit`
- `servo unit`

when all three refer to the same physical item.

**LLM rule:** Create and maintain a document-level terminology map: `concept → preferred technical noun`.

### Rule 1.12 — Technical verbs

A verb that is not in the general dictionary may be used when it is a valid technical verb in an applicable technical-verb category.

Issue 9 defines four broad areas:

1. manufacturing processes;
2. computer processes and applications;
3. instructions/information for applicable subject fields;
4. law and regulations.

Use a technical verb only when it is necessary and technically precise. If an approved general verb can express the meaning accurately, prefer the approved general verb.

### Rule 1.13 — Technical verbs are not nouns

Do not use a technical verb as a noun.

Keep the technical verb in its permitted verbal role.

### Rule 1.14 — American English spelling

Use American English spelling unless another applicable official directive, publication specification, contract, or style guide requires a different spelling.

Examples of typical controlled spelling include:

- `color`, not `colour`;
- `aluminum`, not `aluminium`.

Quoted text and fixed external text should not be silently rewritten merely to change spelling.

---

## 5. Section 2 — Multi-word nouns

### Rule 2.1 — Prefer multi-word nouns of three words or fewer

A multi-word noun should normally contain **no more than three words**.

Examples:

- `actuator operating rod` — 3 words
- `horizontal cylinder pivot bearing` — 4 words, therefore needs special treatment

### Rule 2.2 — Long technical nouns

If an established technical noun has more than three words:

1. write the full technical noun when necessary, especially at first occurrence;
2. then, where appropriate, introduce a shorter clear form or approved abbreviation;
3. use hyphens where they correctly show that words form one unit.

**LLM rule:** Never shorten a technical noun by deleting words that are needed to distinguish one component from another.

---

## 6. Section 3 — Verbs

### Rule 3.1 — Use only dictionary verb forms

Use only the verb forms supplied by the STE dictionary for an approved verb.

### Rule 3.2 — Permitted verb forms and tenses

Use only:

- infinitive/base form;
- imperative/command form;
- simple present;
- simple past;
- simple future;
- past participle when used as an adjective.

Avoid unsupported complex verb tenses.

### Rule 3.3 — Past participle as adjective

A permitted past participle may be used as an adjective to describe a condition.

Examples of the construction pattern:

- `the adjusted linkage`
- `the disassembled unit`

Do not confuse this permitted adjective use with a passive construction.

### Rule 3.4 — Avoid complex auxiliary-verb constructions

Do not use auxiliary verbs to construct complex verb forms that STE does not permit.

Prefer direct structures such as:

> `Adjust the temperature.`

instead of a more complex passive or modal construction when the meaning permits.

### Rule 3.5 — `-ing` restriction

Do not use an `-ing` form as a normal progressive verb construction.

An `-ing` form may be used when permitted as:

- a technical noun; or
- a modifier within a technical noun.

Bad pattern:

> `While you are checking the unit...`

Preferred pattern:

> `While you check the unit...`

### Rule 3.6 — Active voice

Use the active voice.

In descriptive writing, passive voice can be used when the agent is unknown.

In procedures, identify who performs the action whenever practical and use an active command.

### Rule 3.7 — Describe actions with verbs

Use an approved verb to describe an action rather than turning the action into an abstract noun or another part of speech.

Prefer:

> `Adjust the valve.`

rather than an unnecessarily nominalized construction such as:

> `Make an adjustment to the valve.`

Use the approved construction that best communicates the action directly.

---

## 7. Section 4 — Sentences

### Rule 4.1 — Short and clear sentences

Write short, clear sentences with an obvious grammatical structure.

For procedures, communicate the action directly to the reader.

### Rule 4.2 — Do not omit words or use contractions

Do not remove necessary:

- nouns;
- verbs;
- subjects;
- articles; or
- other grammatical elements

merely to make a sentence shorter.

Do not use contractions such as:

- `don't` → `do not`
- `isn't` → `is not`
- `can't` → `cannot`

### Rule 4.3 — Vertical lists

Use a vertical list for complex text containing several items, components, documents, or actions.

Typical construction:

```text
The report must include:

- A completed form.
- A drawing of the unit.
- A photograph of the unit.
- A copy of the source data.
```

For a vertical list:

- put a colon before the list;
- identify each item consistently;
- start each item with an uppercase letter;
- use an article where applicable;
- use a period when the item is a complete sentence;
- do not use commas or semicolons to terminate list items.

### Rule 4.4 — Connecting words and phrases

Use clear connecting words and phrases to show relationships between related sentences.

Examples include:

- `and`
- `but`
- `then`
- `thus`
- `as a result`
- `at the same time`

Use them to make logical progression explicit, not decorative.

### Rule 4.5 — Articles and demonstratives

When applicable, put an article (`a`, `an`, `the`) or demonstrative (`this`, `these`) before the noun or multi-word noun.

Prefer:

> `Turn the shaft assembly.`

rather than:

> `Turn shaft assembly.`

---

## 8. Section 5 — Procedural writing

Procedures tell the reader **what to do**.

### Rule 5.1 — Maximum 20 words

Each procedural sentence must contain **no more than 20 words**.

This also applies to warnings, cautions, and other safety instructions written as procedural text.

### Rule 5.2 — One instruction per sentence

Write only one instruction in each sentence unless two or more actions occur at the same time.

Allowed example pattern:

> `Hold the panel in its open position and install the fastener.`

Do not merge sequential actions simply to reduce the step count.

### Rule 5.3 — Imperative form

Write instructions in the imperative/command form.

Prefer:

> `Remove the cover.`

Avoid:

> `The operator must remove the cover.`

when a direct command communicates the same requirement.

### Rule 5.4 — Condition before command

When a condition must be known before the reader performs the action, put the condition first, then the command.

Pattern:

```text
If <condition>, <command>.
```

Example pattern:

> `If the shims are installed, remove them.`

### Rule 5.5 — Notes provide information only

A `NOTE` gives information. It should not contain an instruction.

If the reader must perform an action, put that action in the procedure rather than hiding it in a note.

---

## 9. Section 6 — Descriptive writing

Descriptive writing gives information rather than direct instructions.

### Rule 6.1 — Give information gradually

Introduce information in a logical sequence. Each sentence should normally have one clear subject.

Avoid giving too many new facts, entities, and relationships in one sentence.

### Rule 6.2 — Use key words and key phrases

Repeat important terminology consistently so the reader can see the relationship between sentences and ideas.

Do not vary terminology merely to avoid repetition.

### Rule 6.3 — Maximum 25 words

Each descriptive sentence must contain **no more than 25 words**.

### Rule 6.4 — Use paragraphs for related information

Use paragraphs to group information that belongs together and to show logical progression.

### Rule 6.5 — One topic per paragraph

Each paragraph should have one clear topic.

Use the first sentence as a topic sentence when appropriate.

### Rule 6.6 — Maximum six sentences per paragraph

A descriptive paragraph must contain **no more than six sentences**.

When more are needed, divide the content into logically related paragraphs.

---

## 10. Section 7 — Safety instructions

Safety text communicates the hazard and the required protective action.

### Rule 7.1 — Identify risk level

Use the applicable safety signal, such as:

- **WARNING** — risk of injury or death;
- **CAUTION** — risk of damage to equipment, tools, or machines.

When both injury/death and equipment-damage risks are present, use the higher-risk warning level.

The actual risk analysis determines the signal word. The LLM must not infer risk from tone alone.

### Rule 7.2 — Start with a clear command or condition

Start the safety instruction with an unambiguous command or an applicable condition.

Avoid abstract statements that do not tell the reader what to do or what condition applies.

### Rule 7.3 — Explain the risk or result

After the command/condition, state the relevant hazard, consequence, or possible result so the reader understands why the safety instruction matters.

**LLM rule:** Preserve the exact safety meaning. Do not weaken, exaggerate, or invent a hazard.

---

## 11. Section 8 — Punctuation and word count

### Rule 8.1 — Punctuation

Standard English punctuation is generally permitted, **except the semicolon (`;`)**.

Use separate sentences instead of semicolons.

### Rule 8.2 — Hyphens

Use hyphens to connect words that are directly related, especially in technical nouns.

Do not use a hyphen as a substitute for a dash or as an arbitrary way to shorten terminology.

### Rule 8.3 — Parentheses

Parentheses may be used for:

- references to illustrations or text;
- item identifiers;
- procedure-step identifiers;
- abbreviations;
- singular/plural alternatives;
- explanations; and
- alternatives.

### Rule 8.4 — Colon in vertical lists

In a vertical list, the colon before the items functions like a sentence boundary for word counting.

Therefore:

- procedural text before the colon: maximum 20 words;
- descriptive text before the colon: maximum 25 words;
- each list item is counted as a separate sentence for its applicable limit.

### Rule 8.5 — Parenthetical text and word count

Text inside parentheses counts as one word in the surrounding sentence for the main sentence count. The parenthetical text is also treated as its own sentence for word-count purposes.

### Rule 8.6 — Elements that count as one word

Count each of these as one word:

- numbers;
- numbers together with units of measurement;
- abbreviations;
- alphanumeric identifiers;
- quoted text;
- titles, headings, placards, and labels;
- proper nouns of individuals, groups, organizations, and geopolitical entities.

### Rule 8.7 — Hyphenated words count as one word

A correctly hyphenated word is counted as one word.

**LLM warning:** Do not add hyphens only to evade a sentence-length rule. Hyphenation must be linguistically and technically justified.

---

## 12. Section 9 — Writing practices

### Rule 9.1 — Use a different sentence construction when necessary

A word-for-word replacement is not always sufficient.

When a non-approved word cannot be replaced without changing meaning or grammatical correctness, restructure the sentence.

Recommended transformation process:

1. Identify the exact meaning.
2. Find an approved synonym with the same part of speech, if one exists.
3. Check that the synonym preserves meaning.
4. If not, redesign the sentence.
5. Recheck every other rule after restructuring.

### Rule 9.2 — Use approved words correctly

Approved vocabulary still has restricted meanings and grammatical roles.

**LLM rule:** “Approved word” means “approved in this meaning and this grammatical role,” not “safe everywhere.”

### Rule 9.3 — Do not create phrasal verbs

Do not combine approved words into a new phrasal verb when the resulting phrase has a meaning different from the individual approved meanings.

Examples of the pattern to avoid:

- `put out` when the intended meaning is `extinguish`;
- `give off` when the intended meaning is `release`.

Only use a phrasal verb when that exact construction is approved with the required meaning.

### Rule 9.4 — Consistent terminology and wording

For repeated operations and repeated concepts, use the same terminology and the same wording pattern whenever the context and meaning are the same.

Do not introduce stylistic variation merely to make the text sound less repetitive.

---

# Part II — General Recommendations

These are recommendations, not additional numbered STE rules.

## GR-1 — Prefer explicit `that`

Use `that` after verbs such as `make sure`, `show`, and `recommend` when it improves clause boundaries and reduces ambiguity.

Prefer:

> `Make sure that the valve is open.`

### GR-2 — Check every use of `with`

`With` can express different relationships. Re-read sentences containing `with` and rewrite them when the relationship is ambiguous.

When possible, make the primary action explicit.

### GR-3 — Pronouns must have an unambiguous referent

Use only permitted pronouns and replace an ambiguous pronoun with the actual noun.

Bad pattern:

> `If you engage the pins incorrectly with the seats, they can become damaged.`

The reader may not know what `they` refers to.

### GR-4 — Make `this` unambiguous

Do not use `this` when the reader could reasonably interpret it as referring to more than one preceding item or condition.

Repeat the noun or restate the condition when necessary.

### GR-5 — Avoid false friends

For non-native English readers, words that resemble words in another language can have different meanings.

Use the intended English meaning, not a translation based on visual similarity.

### GR-6 — Avoid Latin abbreviations

Prefer English expressions such as:

- `for example` rather than `e.g.`;
- `that is` rather than `i.e.`;
- explicit wording rather than `etc.` when the omitted items matter.

### GR-7 — Use inclusive, gender-neutral language

Use neutral language in technical documentation.

Do not use gender-specific pronouns or gendered occupational/person references when a neutral construction is available, except when a specific gender term is technically necessary in context.

### GR-8 — Use possessives carefully

The possessive form (`'s`) is permitted, but use it correctly and avoid it when the construction could be confusing to the intended readership.

---

# Part III — LLM Transformation Algorithm

Use this deterministic pipeline when converting ordinary technical English into STE-style text.

## Step 1 — Classify the content

Classify each unit as exactly one of:

```text
PROCEDURE
DESCRIPTION
SAFETY
NOTE
LIST
TABLE_TEXT
FIXED_TEXT
```

If a unit contains multiple content types, split it before rewriting.

## Step 2 — Preserve technical intent

Extract and lock these facts before rewriting:

```text
entities
actions
conditions
sequence
quantities
limits
units
warnings/cautions
exceptions
references
required outcomes
```

The rewrite must preserve all of them unless the user explicitly asks for a content change.

## Step 3 — Resolve terminology

For every important noun and verb:

```text
1. Is it a known STE dictionary word?
2. If yes, what is its approved meaning?
3. What part of speech is permitted?
4. Is the intended usage consistent with that meaning?
5. If not a dictionary word, is it an approved technical noun/verb?
6. Is there an established company/project term that must be used?
```

If the answer cannot be established from authoritative terminology data, **flag it instead of guessing**.

## Step 4 — Select sentence structure

### For procedures

Use:

```text
[condition], [imperative command].
```

or:

```text
[imperative command].
```

Target one instruction per sentence and no more than 20 words.

### For descriptive writing

Use:

```text
[subject] + [clear verb] + [object/complement].
```

Introduce one subject and one logical relationship at a time. Keep each sentence at 25 words or fewer.

### For safety instructions

Use:

```text
WARNING/CAUTION: [condition or command]. [risk/result].
```

The signal word must come from the actual risk analysis.

## Step 5 — Simplify verbs first

Prefer a direct, approved verb over:

- nominalizations;
- vague verbs;
- passive constructions;
- unsupported modal/auxiliary constructions;
- unnecessary `-ing` constructions;
- invented verb uses of nouns.

## Step 6 — Remove ambiguity

Check especially:

- pronouns (`it`, `they`, `this`, `these`);
- `with`;
- phrasal verbs;
- technical noun substitutions;
- missing articles;
- implicit subjects;
- unclear conditions.

## Step 7 — Split long or dense sentences

Do not merely delete words.

Instead:

1. identify independent actions or ideas;
2. separate them into sentences or vertical-list items;
3. preserve sequence and dependencies;
4. recheck word count.

## Step 8 — Validate word count

Apply the STE word-count rules, including special treatment for:

- parenthetical text;
- numbers;
- units;
- abbreviations;
- identifiers;
- quoted text;
- headings/titles/labels;
- proper nouns;
- hyphenated words;
- vertical-list colons.

## Step 9 — Validate consistency

Create a final terminology and phrasing pass:

```text
same concept → same technical noun
same repeated action → same wording pattern
same condition type → same construction
same unit → same identifier
same safety meaning → same signal level
```

## Step 10 — Produce review metadata

For high-assurance workflows, return structured review information alongside the text:

```yaml
ste_version: "ASD-STE100 Issue 9"
content_type: "procedure | description | safety | note | list"
terminology_verified: true|false|unknown
word_count_verified: true|false
meaning_preserved: true|false
potential_issues: []
requires_human_review: true|false
```

---

# Part IV — LLM Review Checklist

Use this checklist before presenting text as STE-compliant.

## Vocabulary

- [ ] Every general vocabulary word is verified against the applicable STE dictionary.
- [ ] Every dictionary word is used with its approved meaning.
- [ ] Every dictionary word is used as its permitted part of speech.
- [ ] Technical nouns come from approved terminology or a valid technical-noun category.
- [ ] Technical verbs come from approved terminology or a valid technical-verb category.
- [ ] Technical nouns are not being used as verbs.
- [ ] Technical verbs are not being used as nouns.
- [ ] One technical noun is used consistently for each item.

## Grammar and style

- [ ] No unsupported verb tense or complex verb construction.
- [ ] No unnecessary `-ing` verb form.
- [ ] Procedures use active voice.
- [ ] Procedures use imperative commands.
- [ ] No contractions.
- [ ] Required articles/demonstratives are present.
- [ ] No ambiguous pronouns.
- [ ] `with` does not create ambiguity.
- [ ] No unapproved phrasal verbs.
- [ ] No semicolons.
- [ ] American English spelling is used unless an applicable authority requires otherwise.

## Structure

- [ ] Procedure sentences are ≤20 words.
- [ ] Descriptive sentences are ≤25 words.
- [ ] Procedural sentences normally contain one instruction.
- [ ] Conditions that must be known first are placed before commands.
- [ ] Complex item/action collections are represented as vertical lists where useful.
- [ ] Descriptive paragraphs have one topic.
- [ ] Descriptive paragraphs contain ≤6 sentences.
- [ ] Key terminology is repeated consistently.

## Safety

- [ ] Warning/caution level is based on actual risk.
- [ ] Safety text starts with a clear command or condition.
- [ ] The possible result/risk is stated clearly.
- [ ] No safety meaning was weakened, exaggerated, or invented.

## Meaning

- [ ] No technical requirement was changed.
- [ ] No quantity, unit, tolerance, threshold, or sequence was changed.
- [ ] No component was renamed without authority.
- [ ] No information was removed only to satisfy sentence length.
- [ ] No new technical fact was invented.

---

# Part V — Patterns for LLM Rewriting

## 1. Nominalization → direct verb

**Input pattern**

> `Perform an adjustment of the valve.`

**Transformation pattern**

> `[Verb] the valve.`

Use the exact approved verb that expresses the intended action.

## 2. Passive procedure → active command

**Input pattern**

> `The cover must be removed.`

**Transformation pattern**

> `Remove the cover.`

## 3. Progressive verb → simple form

**Input pattern**

> `While you are checking the unit...`

**Transformation pattern**

> `While you check the unit...`

## 4. Missing condition → condition first

**Input pattern**

> `Remove the pins if the cover is open.`

**STE-oriented pattern**

> `If the cover is open, remove the pins.`

Use this when the condition must be known before the action.

## 5. Ambiguous pronoun → explicit noun

**Input pattern**

> `Remove the filter and inspect it.`

If more than one noun could be the referent, repeat the noun:

> `Remove the filter and inspect the filter for damage.`

## 6. Phrasal verb → precise verb

**Input pattern**

> `Put out the fire.`

**Transformation pattern**

> `Extinguish the fire.`

Only perform this replacement after checking the approved meaning in the dictionary.

## 7. Long sentence → sequential work steps

**Input pattern**

> A sentence containing several sequential actions.

**Transformation pattern**

```text
1. [Action 1].
2. [Action 2].
3. [Action 3].
```

Do not split actions that genuinely occur at the same time unless the documentation model permits them to remain together.

## 8. Long noun chain → explain then shorten

**Input pattern**

> A technical noun containing more than three words.

**Transformation pattern**

```text
[first occurrence: full authoritative technical noun]
[optional explanation]
[subsequent occurrences: shorter approved form or abbreviation]
```

Never invent an abbreviation.

---

# Part VI — Recommended Prompt Contract for an STE LLM

Use the following as a system/developer instruction for an LLM that must produce STE-oriented technical text.

```text
You are a technical-writing assistant operating under ASD-STE100 Issue 9.

Your job is to produce clear, technically accurate controlled-language text.

Rules:
1. Preserve the original technical meaning exactly.
2. Treat the official ASD-STE100 dictionary as authoritative for general vocabulary.
3. Use each dictionary word only with its approved meaning and part of speech.
4. Use approved company/industry/project technical nouns and technical verbs when provided.
5. Never invent an STE-approved word, meaning, verb form, or technical term.
6. Never use a technical noun as a verb unless it is independently authorized as a technical verb.
7. Do not use unsupported verb tenses or complex verb constructions.
8. Avoid normal progressive -ing verb constructions.
9. Use active voice for procedures.
10. Use imperative form for procedural instructions.
11. Keep procedural sentences to 20 words or fewer.
12. Keep descriptive sentences to 25 words or fewer.
13. Keep descriptive paragraphs to six sentences or fewer and one topic per paragraph.
14. Put required conditions before commands.
15. Normally use one instruction per procedural sentence.
16. Use vertical lists for complex sets of items or actions.
17. Do not omit grammatical words merely to shorten a sentence.
18. Do not use contractions.
19. Do not use semicolons.
20. Avoid unapproved phrasal verbs.
21. Use articles and demonstratives when required for clarity.
22. Use terminology consistently. Do not vary nouns or phrasing for style.
23. Make pronoun references explicit when ambiguity is possible.
24. Avoid ambiguous uses of "with" and "this".
25. Use gender-neutral language where applicable.
26. Use American English spelling unless another authoritative requirement applies.
27. For safety text, use the applicable WARNING or CAUTION level based on the actual risk.
28. Never weaken, exaggerate, or invent a safety consequence.
29. When a word-for-word replacement is inadequate, restructure the sentence while preserving meaning.
30. When compliance cannot be verified, say "VERIFICATION REQUIRED" rather than guessing.

Before final output, perform these checks:
- terminology
- approved meaning
- part of speech
- verb form/tense
- active voice
- imperative form for procedures
- sentence word count
- paragraph length
- punctuation
- ambiguity
- consistency
- technical meaning preservation
- safety meaning preservation
```

---

# Part VII — Verification Strategy

An LLM should distinguish between **generation** and **verification**.

## Generation pass

Produce the clearest technically accurate STE-oriented draft.

## Verification pass

Independently inspect the draft for:

```text
dictionary status
approved meaning
part of speech
technical terminology
technical noun/verb categories
verb form
voice
sentence type
word count
paragraph count
punctuation
ambiguity
consistency
technical meaning
safety meaning
```

## Confidence rule

Use three states rather than guessing:

```text
VERIFIED      = supported by the authoritative dictionary/glossary/rules
UNVERIFIED    = cannot be checked from available authoritative data
VIOLATION     = known to conflict with an applicable rule
```

An LLM should not convert `UNVERIFIED` into `VERIFIED` merely because a term looks reasonable.

---

# Part VIII — Important Boundary Conditions

## STE is not generic “simple English”

STE is a controlled natural language. A sentence can be easy to read and still be non-compliant because of:

- vocabulary;
- restricted word meaning;
- wrong part of speech;
- wrong verb form;
- passive voice in a procedure;
- unsupported `-ing` construction;
- excessive sentence length;
- ambiguous terminology;
- inconsistent technical naming.

## STE does not replace technical expertise

The writer or reviewer must understand the equipment, system, process, or subject being described. Language simplification cannot resolve an incorrect or incomplete technical concept.

## STE tools are aids, not authorities

Automated checkers and LLMs can support review, but they can produce false positives and false negatives. The official ASD-STE100 standard and authoritative project/company terminology remain the source of truth.

---

# Part IX — Minimal Machine-Readable Rule Set

For implementation in an LLM evaluator or linter, the following abstraction is useful:

```yaml
standard:
  name: ASD-STE100
  issue: 9
  date: 2025-01-15

sentence_limits:
  procedure: 20
  descriptive: 25

paragraph_limits:
  descriptive_max_sentences: 6

procedure:
  voice: active
  mood: imperative
  default_instructions_per_sentence: 1
  condition_before_command: true
  notes_are_informational_only: true

verbs:
  allowed_tenses:
    - infinitive
    - imperative
    - simple_present
    - simple_past
    - simple_future
    - past_participle_as_adjective
  progressive_ing_as_verb: false
  complex_auxiliary_constructions: false

vocabulary:
  general_words: controlled_dictionary
  approved_meaning_required: true
  approved_part_of_speech_required: true
  technical_nouns_allowed: true
  technical_verbs_allowed: true
  technical_noun_as_verb: false
  technical_verb_as_noun: false
  terminology_must_be_consistent: true

style:
  contractions: false
  semicolon: false
  american_spelling_default: true
  ambiguous_pronouns: avoid
  ambiguous_with: avoid
  ambiguous_this: avoid
  phrasal_verbs: avoid_unless_authorized
  latin_abbreviations: avoid
  inclusive_language: gender_neutral

multi_word_nouns:
  preferred_max_words: 3
  long_authoritative_terms: write_full_then_shorten_when_appropriate
  invented_abbreviations: false

safety:
  warning: injury_or_death_risk
  caution: equipment_or_property_damage_risk
  command_or_condition_first: true
  explain_risk_or_result: true

verification:
  unknown_terms_must_not_be_guessed: true
  technical_meaning_must_be_preserved: true
  requires_human_review_for_high_assurance_content: true
```

---

# Part X — Official References

- **ASD-STE100 official website:** https://www.asd-ste100.org/
- **Official downloads / Issue 9:** https://www.asd-ste100.org/STE_downloads.html
- **Official Issue 9 PDF:** https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf
- **Official STE FAQ:** https://www.asd-ste100.org/faq.html
- **Official guidance on STE tools and AI:** https://www.asd-ste100.org/STEsoftware.html

## Source note

This document summarizes and operationalizes the rules of **ASD-STE100 Issue 9 (2025)** for LLM use. It does not reproduce the standard or its complete dictionary. For authoritative compliance, consult the official Issue 9 publication and the applicable company/project terminology resources.
